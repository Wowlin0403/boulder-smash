const router = require('express').Router();
const db = require('../db');
const { calcSmashScore, assignSmashRanks, calcScore, makeCmp, assignRanksWithDns } = require('../utils/ranking');
const { getAdvancedIds } = require('../utils/advancement');

router.get('/events/:id', (req, res) => {
  const event = db.prepare('SELECT id, name, date FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: '賽事不存在' });
  res.json(event);
});

router.get('/events/:id/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE event_id = ? ORDER BY id').all(req.params.id));
});

// Smash ranking — returns flat array of { rank, athlete_id, bib, name, category_id, total_score }
router.get('/events/:id/ranking/smash', (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM events WHERE id = ?').get(id)) return res.status(404).json({ error: '賽事不存在' });

  const athletes = db.prepare('SELECT a.*, c.name as category_name FROM athletes a LEFT JOIN categories c ON a.category_id = c.id WHERE a.event_id = ? ORDER BY a.bib').all(id);

  const dnsSet = new Set(
    db.prepare("SELECT athlete_id FROM dns_records WHERE event_id = ? AND round = 'smash'").all(id).map(r => r.athlete_id)
  );

  const smashScoresRaw = {};
  db.prepare('SELECT * FROM smash_scores WHERE event_id = ?').all(id).forEach(s => {
    if (!smashScoresRaw[s.athlete_id]) smashScoresRaw[s.athlete_id] = {};
    smashScoresRaw[s.athlete_id][s.route_id] = s;
  });

  const categoryRoutesCache = {};
  const byCat = {};

  athletes.forEach(a => {
    if (!a.category_id) return;
    if (!byCat[a.category_id]) byCat[a.category_id] = [];

    if (!categoryRoutesCache[a.category_id]) {
      categoryRoutesCache[a.category_id] = db.prepare(`
        SELECT r.id, r.top_score, r.zone_score
        FROM routes r JOIN category_routes cr ON cr.route_id = r.id
        WHERE cr.category_id = ? AND r.event_id = ?
      `).all(a.category_id, id);
    }
    const categoryRoutes = categoryRoutesCache[a.category_id];

    const routeScores = categoryRoutes.map(r => {
      const s = smashScoresRaw[a.id]?.[r.id];
      return { top: s?.top ? 1 : 0, zone: s?.zone ? 1 : 0, top_score: r.top_score, zone_score: r.zone_score };
    });

    byCat[a.category_id].push({ ...a, score: calcSmashScore(routeScores), is_dns: dnsSet.has(a.id) });
  });

  const result = [];
  Object.values(byCat).forEach(group => {
    assignSmashRanks(group);
    group.forEach(a => result.push({
      rank: a.rank,
      athlete_id: a.id,
      bib: a.bib,
      name: a.name,
      category_id: a.category_id,
      total_score: a.score,
      is_dns: a.is_dns,
    }));
  });

  res.json(result);
});

// Final ranking — returns flat array with boulderScores
router.get('/events/:id/ranking/final', (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM events WHERE id = ?').get(id)) return res.status(404).json({ error: '賽事不存在' });

  const cats = db.prepare("SELECT * FROM categories WHERE event_id = ? AND rounds = 2").all(id);
  if (!cats.length) return res.json([]);

  let athletes = db.prepare('SELECT * FROM athletes WHERE event_id = ? ORDER BY bib').all(id);
  const advancedIds = getAdvancedIds(db, id);
  if (advancedIds) athletes = athletes.filter(a => advancedIds.has(a.id));

  const bouldersMap = {};
  cats.forEach(c => {
    bouldersMap[c.id] = db.prepare("SELECT * FROM boulders WHERE category_id = ? AND round = 'final' ORDER BY number").all(c.id);
  });

  const scoreMap = {};
  db.prepare("SELECT * FROM scores WHERE event_id = ? AND round = 'final'").all(id).forEach(s => {
    if (!scoreMap[s.athlete_id]) scoreMap[s.athlete_id] = {};
    scoreMap[s.athlete_id][s.boulder_id] = s;
  });

  const dnsSet = new Set(
    db.prepare("SELECT athlete_id FROM dns_records WHERE event_id = ? AND round = 'final'").all(id).map(r => r.athlete_id)
  );

  // smash rank map for tiebreaker
  const smashScores = db.prepare('SELECT ss.*, r.top_score, r.zone_score FROM smash_scores ss JOIN routes r ON ss.route_id = r.id WHERE ss.event_id = ?').all(id);
  const smashByAthlete = {};
  smashScores.forEach(s => {
    if (!smashByAthlete[s.athlete_id]) smashByAthlete[s.athlete_id] = [];
    smashByAthlete[s.athlete_id].push(s);
  });

  const catAthletes = {};
  athletes.forEach(a => {
    if (!a.category_id) return;
    const boulders = bouldersMap[a.category_id] || [];
    const is_dns = dnsSet.has(a.id);
    const boulderScores = boulders.map(b => {
      const s = scoreMap[a.id]?.[b.id];
      if (!s) return { boulder_id: b.id, top: 0, top_attempts: 0, zone: 0, zone_attempts: 0, attempts: 0 };
      return { boulder_id: b.id, top: s.top ? 1 : 0, top_attempts: s.top_attempts || 0, zone: s.zone ? 1 : 0, zone_attempts: s.zone_attempts || 0, attempts: s.attempts || 0 };
    });
    if (!catAthletes[a.category_id]) catAthletes[a.category_id] = [];
    catAthletes[a.category_id].push({ ...a, boulderScores, score: calcScore(boulderScores), is_dns });
  });

  // Compute smash rank maps per category for tiebreaker
  const smashRankMaps = {};
  cats.forEach(cat => {
    const catGroup = db.prepare('SELECT * FROM athletes WHERE event_id = ? AND category_id = ?').all(id, cat.id);
    const catAthleteIds = new Set(catGroup.map(a => a.id));
    const smashByAthleteLocal = {};
    smashScores.filter(s => catAthleteIds.has(s.athlete_id)).forEach(s => {
      if (!smashByAthleteLocal[s.athlete_id]) smashByAthleteLocal[s.athlete_id] = [];
      smashByAthleteLocal[s.athlete_id].push(s);
    });
    const smashGroup = catGroup.map(a => ({ id: a.id, total_score: calcSmashScore(smashByAthleteLocal[a.id] || []) }));
    assignSmashRanks(smashGroup);
    const rankMap = {};
    smashGroup.forEach(a => { rankMap[a.id] = a.rank; });
    smashRankMaps[cat.id] = rankMap;
  });

  const result = [];
  Object.entries(catAthletes).forEach(([catId, group]) => {
    const prevRankMap = smashRankMaps[catId] || null;
    const cmp = makeCmp(prevRankMap);
    assignRanksWithDns(group, cmp, prevRankMap);
    group.forEach(a => result.push({
      rank: a.rank,
      athlete_id: a.id,
      bib: a.bib,
      name: a.name,
      category_id: a.category_id,
      boulderScores: a.boulderScores,
      is_dns: a.is_dns,
    }));
  });

  res.json(result);
});

module.exports = router;
