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

// Smash ranking — returns flat array of { rank, athlete_id, bib, name, category_id, total_score, is_advanced, is_guaranteed_advanced }
router.get('/events/:id/ranking/smash', (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM events WHERE id = ?').get(id)) return res.status(404).json({ error: '賽事不存在' });

  const categories = db.prepare('SELECT * FROM categories WHERE event_id = ?').all(id);
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

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

  const advancedIds = getAdvancedIds(db, id);

  const result = [];
  Object.entries(byCat).forEach(([catId, group]) => {
    assignSmashRanks(group);

    const cat = catMap[parseInt(catId)];
    const quota = (cat?.rounds === 2 && cat?.final_quota) ? cat.final_quota : 0;

    // 計算正常晉級的 cutoff score（不含保障邏輯）
    let normalCutoffScore = null;
    if (quota > 0) {
      const nonDnsSorted = group.filter(a => !a.is_dns).sort((a, b) => b.score - a.score);
      if (nonDnsSorted.length >= quota) normalCutoffScore = nonDnsSorted[quota - 1].score;
      else normalCutoffScore = nonDnsSorted.length > 0 ? nonDnsSorted[nonDnsSorted.length - 1].score : null;
    }

    group.forEach(a => {
      const is_advanced = advancedIds ? advancedIds.has(a.id) : false;
      const normallyAdvanced = normalCutoffScore !== null && !a.is_dns && a.score >= normalCutoffScore;
      const is_guaranteed_advanced = quota > 0 && is_advanced && !normallyAdvanced;

      result.push({
        rank: a.rank,
        athlete_id: a.id,
        bib: a.bib,
        name: a.name,
        category_id: a.category_id,
        total_score: a.score,
        is_dns: a.is_dns,
        is_advanced,
        is_guaranteed_advanced,
      });
    });
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

// ── Athlete score lookup (public) ─────────────────────────────────────────────

router.get('/events/:id/athletes', (req, res) => {
  const athletes = db.prepare(`
    SELECT a.id, a.bib, a.name, a.category_id, c.name as category_name
    FROM athletes a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.event_id = ?
    ORDER BY c.name, CAST(a.bib AS INTEGER), a.bib
  `).all(req.params.id);
  res.json(athletes);
});

router.get('/events/:id/athlete-scores', (req, res) => {
  const { athlete_id } = req.query;
  if (!athlete_id) return res.status(400).json({ error: 'athlete_id 必填' });

  const athlete = db.prepare(`
    SELECT a.id, a.bib, a.name, a.category_id, c.name as category_name
    FROM athletes a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.id = ? AND a.event_id = ?
  `).get(athlete_id, req.params.id);
  if (!athlete) return res.status(404).json({ error: '選手不存在' });

  const routes = db.prepare(`
    SELECT r.id, r.name, r.zone_id, r.top_score, r.zone_score, z.name as zone_name
    FROM routes r
    JOIN category_routes cr ON cr.route_id = r.id
    LEFT JOIN zones z ON r.zone_id = z.id
    WHERE cr.category_id = ? AND r.event_id = ?
    ORDER BY z.name, r.id
  `).all(athlete.category_id, req.params.id);

  const scoresMap = {};
  db.prepare('SELECT * FROM smash_scores WHERE athlete_id = ? AND event_id = ?')
    .all(athlete_id, req.params.id)
    .forEach(s => { scoresMap[s.route_id] = s; });

  let totalScore = 0, topCount = 0, zoneCount = 0;
  routes.forEach(r => {
    const s = scoresMap[r.id];
    if (s?.top) { totalScore += r.top_score; topCount++; }
    else if (s?.zone) { totalScore += r.zone_score; zoneCount++; }
  });

  const zonesMap = {};
  routes.forEach(r => {
    const key = r.zone_id ?? 'null';
    if (!zonesMap[key]) zonesMap[key] = { zone_id: r.zone_id, zone_name: r.zone_name || '未指派', routes: [] };
    const s = scoresMap[r.id];
    zonesMap[key].routes.push({
      id: r.id, name: r.name, top_score: r.top_score, zone_score: r.zone_score,
      top: s?.top ? 1 : 0, zone: s?.zone ? 1 : 0,
      top_attempts: s?.top_attempts || 0, zone_attempts: s?.zone_attempts || 0,
      attempts: s?.attempts || 0,
    });
  });

  const zones = Object.values(zonesMap).sort((a, b) => {
    if (a.zone_id === null) return 1;
    if (b.zone_id === null) return -1;
    return (a.zone_name || '').localeCompare(b.zone_name || '');
  });

  res.json({ athlete, total_score: totalScore, top_count: topCount, zone_count: zoneCount, zones });
});

module.exports = router;
