const router = require('express').Router();
const db = require('../db');
const { adminOnly, superadminOnly, requireEventOwnership } = require('../middleware/auth');
const { getAdvancedIds, getRounds } = require('../utils/advancement');
const { calcScore, makeCmp, assignRanks, assignRanksWithDns, computeRoundRankMap, calcSmashScore, assignSmashRanks, computeSmashRankMap } = require('../utils/ranking');

const ROUND_KEYS = ['smash', 'final'];
const LOCK_DAYS = 7;

function isEventLocked(event) {
  if (event.locked === 1) return true;
  if (event.locked === 0) return false;
  if (!event.date) return false;
  const lockDate = new Date(event.date);
  lockDate.setDate(lockDate.getDate() + LOCK_DAYS);
  return new Date() > lockDate;
}

function requireUnlocked(req, res, next) {
  if (req.user?.role === 'superadmin') return next();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: '賽事不存在' });
  if (isEventLocked(event)) return res.status(423).json({ error: '此比賽已鎖定，無法進行編輯' });
  next();
}

function createCategoryFinalBoulders(eventId, categoryId) {
  const insert = db.prepare('INSERT OR IGNORE INTO boulders (event_id, category_id, round, number, label) VALUES (?, ?, ?, ?, ?)');
  for (let i = 1; i <= 5; i++) insert.run(eventId, categoryId, 'final', i, `B${i}`);
}

const ATHLETE_SELECT = `
  SELECT a.*, c.name as category_name, c.color as category_color, c.rounds as category_rounds
  FROM athletes a LEFT JOIN categories c ON a.category_id = c.id
`;

// ── Events ──────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  if (req.user.role === 'organizer') {
    return res.json(db.prepare('SELECT * FROM events WHERE organizer_id = ? ORDER BY date DESC, id DESC').all(req.user.id));
  }
  if (req.user.role === 'judge') {
    const assignments = db.prepare('SELECT DISTINCT event_id FROM judge_zone_assignments WHERE user_id = ?').all(req.user.id);
    if (assignments.length === 0) return res.json([]);
    const ids = assignments.map(a => a.event_id);
    return res.json(db.prepare(`SELECT * FROM events WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY date DESC, id DESC`).all(...ids));
  }
  res.json(db.prepare('SELECT * FROM events ORDER BY date DESC, id DESC').all());
});

router.post('/', superadminOnly, (req, res) => {
  const { name, date } = req.body;
  if (!name || !date) return res.status(400).json({ error: '名稱與日期必填' });

  const eventId = db.prepare('INSERT INTO events (name, date) VALUES (?, ?)').run(name, date).lastInsertRowid;

  const insertCat = db.prepare('INSERT INTO categories (event_id, name, color, rounds) VALUES (?, ?, ?, ?)');
  [{ name: '男子公開組', color: '#c8f135' }, { name: '女子公開組', color: '#38e8d5' }].forEach(c => {
    insertCat.run(eventId, c.name, c.color, 1);
  });

  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(eventId));
});

router.get('/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: '賽事不存在' });
  res.json(event);
});

router.put('/:id', superadminOnly, (req, res) => {
  const { name, date } = req.body;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: '賽事不存在' });
  db.prepare('UPDATE events SET name=?, date=? WHERE id=?').run(name ?? event.name, date ?? event.date, req.params.id);
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

router.delete('/:id', superadminOnly, (req, res) => {
  if (!db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: '賽事不存在' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.put('/:id/lock', superadminOnly, (req, res) => {
  const { locked } = req.body;
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: '賽事不存在' });
  db.prepare('UPDATE events SET locked = ? WHERE id = ?').run(locked ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

// ── Boulders（finals only）───────────────────────────────────────────────────

router.get('/:id/boulders/final', (req, res) => {
  const { category_id } = req.query;
  if (!category_id) return res.status(400).json({ error: '需提供 category_id' });
  res.json(db.prepare('SELECT * FROM boulders WHERE category_id = ? AND round = ? ORDER BY number').all(category_id, 'final'));
});

router.put('/:id/boulders/final/resize', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  const { count, category_id } = req.body;
  if (!count || count < 1 || count > 10) return res.status(400).json({ error: '路線數需介於 1–10' });
  if (!category_id) return res.status(400).json({ error: '需提供 category_id' });

  const existing = db.prepare('SELECT * FROM boulders WHERE category_id = ? AND round = ? ORDER BY number').all(category_id, 'final');
  const insert = db.prepare('INSERT OR IGNORE INTO boulders (event_id, category_id, round, number, label) VALUES (?, ?, ?, ?, ?)');
  for (let i = existing.length + 1; i <= count; i++) insert.run(req.params.id, category_id, 'final', i, `B${i}`);
  if (existing.length > count) {
    const toDelete = existing.slice(count).map(b => b.id);
    db.prepare(`DELETE FROM boulders WHERE id IN (${toDelete.map(() => '?').join(',')})`).run(...toDelete);
  }

  res.json(db.prepare('SELECT * FROM boulders WHERE category_id = ? AND round = ? ORDER BY number').all(category_id, 'final'));
});

router.put('/:id/boulders/:bId', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: '標籤必填' });
  db.prepare('UPDATE boulders SET label = ? WHERE id = ? AND event_id = ?').run(label, req.params.bId, req.params.id);
  res.json({ ok: true });
});

// ── Categories ───────────────────────────────────────────────────────────────

router.get('/:id/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE event_id = ? ORDER BY id').all(req.params.id));
});

router.post('/:id/categories', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  const { name, color = '#c8f135', rounds = 1 } = req.body;
  if (!name) return res.status(400).json({ error: '組別名稱必填' });
  const catCount = db.prepare('SELECT COUNT(*) as n FROM categories WHERE event_id = ?').get(req.params.id).n;
  if (catCount >= 8) return res.status(400).json({ error: '單場比賽最多 8 個組別' });
  const validRounds = [1, 2].includes(rounds) ? rounds : 1;
  const catId = db.prepare('INSERT INTO categories (event_id, name, color, rounds) VALUES (?, ?, ?, ?)').run(req.params.id, name, color, validRounds).lastInsertRowid;
  if (validRounds === 2) createCategoryFinalBoulders(req.params.id, catId);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(catId));
});

router.put('/:id/categories/:catId', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  const { final_quota, rounds } = req.body;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND event_id = ?').get(req.params.catId, req.params.id);
  if (!cat) return res.status(404).json({ error: '組別不存在' });

  const newRounds = rounds !== undefined ? ([1, 2].includes(+rounds) ? +rounds : cat.rounds) : cat.rounds;
  db.prepare('UPDATE categories SET final_quota=?, rounds=? WHERE id=? AND event_id=?').run(
    final_quota ?? cat.final_quota ?? 0,
    newRounds,
    req.params.catId,
    req.params.id
  );

  if (newRounds === 2 && cat.rounds === 1) {
    createCategoryFinalBoulders(req.params.id, req.params.catId);
  } else if (newRounds === 1 && cat.rounds === 2) {
    db.prepare('DELETE FROM boulders WHERE category_id = ? AND round = ?').run(req.params.catId, 'final');
  }

  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.catId));
});

router.delete('/:id/categories/:catId', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ? AND event_id = ?').run(req.params.catId, req.params.id);
  res.json({ ok: true });
});

// ── Athletes ─────────────────────────────────────────────────────────────────

router.get('/:id/athletes', (req, res) => {
  const { round } = req.query;
  if (!db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: '賽事不存在' });

  let athletes = db.prepare(`${ATHLETE_SELECT} WHERE a.event_id = ? ORDER BY CAST(a.bib AS INTEGER), a.bib`).all(req.params.id);

  if (round === 'final') {
    const advancedIds = getAdvancedIds(db, req.params.id);
    if (advancedIds) athletes = athletes.filter(a => advancedIds.has(a.id));
  }

  res.json(athletes);
});

router.post('/:id/athletes', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  const { name, bib, category_id } = req.body;
  if (!name || !bib) return res.status(400).json({ error: '姓名與號碼牌必填' });
  if (db.prepare('SELECT id FROM athletes WHERE event_id = ? AND category_id = ? AND bib = ?').get(req.params.id, category_id || null, bib)) {
    return res.status(409).json({ error: '號碼牌已存在（同組別）' });
  }
  const athId = db.prepare('INSERT INTO athletes (event_id, category_id, name, bib) VALUES (?, ?, ?, ?)').run(req.params.id, category_id || null, name, bib).lastInsertRowid;
  res.status(201).json(db.prepare(`${ATHLETE_SELECT} WHERE a.id = ?`).get(athId));
});

router.delete('/:id/athletes', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  db.prepare('DELETE FROM athletes WHERE event_id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.put('/:id/athletes/:athId', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  const { name, bib } = req.body;
  if (!name?.trim() || !bib?.trim()) return res.status(400).json({ error: '姓名與號碼牌必填' });
  const ath = db.prepare('SELECT * FROM athletes WHERE id = ? AND event_id = ?').get(req.params.athId, req.params.id);
  if (!ath) return res.status(404).json({ error: '選手不存在' });
  const conflict = db.prepare('SELECT id FROM athletes WHERE event_id = ? AND category_id = ? AND bib = ? AND id != ?').get(req.params.id, ath.category_id, bib.trim(), req.params.athId);
  if (conflict) return res.status(409).json({ error: '號碼牌已存在（同組別）' });
  db.prepare('UPDATE athletes SET name = ?, bib = ? WHERE id = ? AND event_id = ?').run(name.trim(), bib.trim(), req.params.athId, req.params.id);
  res.json(db.prepare('SELECT * FROM athletes WHERE id = ?').get(req.params.athId));
});

router.delete('/:id/athletes/:athId', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  db.prepare('DELETE FROM athletes WHERE id = ? AND event_id = ?').run(req.params.athId, req.params.id);
  res.json({ ok: true });
});

router.post('/:id/athletes/bulk', adminOnly, requireEventOwnership, requireUnlocked, (req, res) => {
  const { athletes } = req.body;
  if (!Array.isArray(athletes) || athletes.length === 0) return res.status(400).json({ error: '資料格式錯誤' });

  const imported = [], skipped = [];
  const checkBib = db.prepare('SELECT id FROM athletes WHERE event_id = ? AND category_id = ? AND bib = ?');
  const insert = db.prepare('INSERT INTO athletes (event_id, category_id, name, bib) VALUES (?, ?, ?, ?)');

  db.transaction(() => {
    for (const a of athletes) {
      if (checkBib.get(req.params.id, a.category_id || null, a.bib)) {
        skipped.push({ ...a, reason: '號碼牌已存在（同組別）' });
      } else {
        insert.run(req.params.id, a.category_id || null, a.name, a.bib);
        imported.push(a);
      }
    }
  })();

  res.json({ imported, skipped });
});

// ── Smash Scores ─────────────────────────────────────────────────────────────

router.get('/:id/smash-scores', (req, res) => {
  const { category_id } = req.query;
  let query = `
    SELECT ss.*, a.name as athlete_name, a.bib, r.name as route_name, r.top_score, r.zone_score
    FROM smash_scores ss
    JOIN athletes a ON ss.athlete_id = a.id
    JOIN routes r ON ss.route_id = r.id
    WHERE ss.event_id = ?
  `;
  const params = [req.params.id];
  if (category_id) {
    query += ' AND a.category_id = ?';
    params.push(category_id);
  }
  res.json(db.prepare(query).all(...params));
});

router.post('/:id/smash-scores', requireUnlocked, (req, res) => {
  const { athlete_id, scores } = req.body;
  if (!athlete_id || !Array.isArray(scores)) return res.status(400).json({ error: '資料格式錯誤' });

  const upsert = db.prepare(`
    INSERT INTO smash_scores (athlete_id, event_id, route_id, top, top_attempts, zone, zone_attempts, attempts, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(athlete_id, route_id) DO UPDATE SET
      top=excluded.top, top_attempts=excluded.top_attempts,
      zone=excluded.zone, zone_attempts=excluded.zone_attempts,
      attempts=excluded.attempts,
      updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `);

  db.transaction(items => {
    for (const s of items) {
      upsert.run(athlete_id, req.params.id, s.route_id, s.top ? 1 : 0, s.top_attempts || 0, s.zone ? 1 : 0, s.zone_attempts || 0, s.attempts || 0, req.user.id);
    }
  })(scores);

  res.json({ ok: true });
});

// ── Finals Scores ─────────────────────────────────────────────────────────────

router.get('/:id/scores/final', (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, a.name as athlete_name, a.bib, b.label as boulder_label, b.number as boulder_number
    FROM scores s
    JOIN athletes a ON s.athlete_id = a.id
    JOIN boulders b ON s.boulder_id = b.id
    WHERE s.event_id = ? AND s.round = 'final'
  `).all(req.params.id));
});

router.post('/:id/scores', requireUnlocked, (req, res) => {
  const { athlete_id, scores } = req.body;
  if (!athlete_id || !Array.isArray(scores)) return res.status(400).json({ error: '資料格式錯誤' });

  const upsert = db.prepare(`
    INSERT INTO scores (athlete_id, event_id, round, boulder_id, top, top_attempts, zone, zone_attempts, attempts, updated_at, updated_by)
    VALUES (?, ?, 'final', ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(athlete_id, round, boulder_id) DO UPDATE SET
      top=excluded.top, top_attempts=excluded.top_attempts,
      zone=excluded.zone, zone_attempts=excluded.zone_attempts,
      attempts=excluded.attempts,
      updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `);

  db.transaction(items => {
    for (const s of items) {
      upsert.run(athlete_id, req.params.id, s.boulder_id, s.top ? 1 : 0, s.top_attempts || 0, s.zone ? 1 : 0, s.zone_attempts || 0, s.attempts || 0, req.user.id);
    }
  })(scores);

  res.json({ ok: true });
});

// ── Ranking ──────────────────────────────────────────────────────────────────

router.get('/:id/ranking/smash', (req, res) => {
  const { id } = req.params;
  const catList = db.prepare('SELECT * FROM categories WHERE event_id = ?').all(id);

  let athletes = db.prepare(`${ATHLETE_SELECT} WHERE a.event_id = ? ORDER BY CAST(a.bib AS INTEGER), a.bib`).all(id);
  athletes = athletes.filter(a => a.category_id);

  const dnsSet = new Set(
    db.prepare("SELECT athlete_id FROM dns_records WHERE event_id = ? AND round = 'smash'").all(id).map(r => r.athlete_id)
  );

  const smashScores = {};
  db.prepare('SELECT * FROM smash_scores WHERE event_id = ?').all(id).forEach(s => {
    if (!smashScores[s.athlete_id]) smashScores[s.athlete_id] = {};
    smashScores[s.athlete_id][s.route_id] = s;
  });

  const categoryRoutesCache = {};
  const byCategory = {};

  athletes.forEach(a => {
    if (!byCategory[a.category_id]) byCategory[a.category_id] = [];

    if (!categoryRoutesCache[a.category_id]) {
      categoryRoutesCache[a.category_id] = db.prepare(`
        SELECT r.id, r.name as route_name, r.top_score, r.zone_score
        FROM routes r JOIN category_routes cr ON cr.route_id = r.id
        WHERE cr.category_id = ? AND r.event_id = ?
      `).all(a.category_id, id);
    }
    const categoryRoutes = categoryRoutesCache[a.category_id];

    const routeScores = categoryRoutes.map(r => {
      const s = smashScores[a.id]?.[r.id];
      return {
        route_id: r.id,
        route_name: r.route_name,
        top: s?.top ? 1 : 0,
        top_attempts: s?.top_attempts || 0,
        zone: s?.zone ? 1 : 0,
        zone_attempts: s?.zone_attempts || 0,
        attempts: s?.attempts || 0,
        top_score: r.top_score,
        zone_score: r.zone_score,
      };
    });

    byCategory[a.category_id].push({
      ...a,
      routeScores,
      score: calcSmashScore(routeScores),
      scored: !!smashScores[a.id],
      is_dns: dnsSet.has(a.id),
    });
  });

  const result = [];
  const quotas = {};
  Object.entries(byCategory).forEach(([catId, group]) => {
    assignSmashRanks(group);
    group.forEach(a => result.push(a));
    const cat = catList.find(c => c.id === parseInt(catId));
    quotas[catId] = cat?.rounds === 2 ? (cat.final_quota || 0) : 0;
  });

  res.json({ athletes: result, total: athletes.length, quotas });
});

router.get('/:id/ranking/final', (req, res) => {
  const { id } = req.params;
  const catList = db.prepare('SELECT * FROM categories WHERE event_id = ?').all(id);
  const finalCats = catList.filter(c => c.rounds === 2);
  const finalCatIds = new Set(finalCats.map(c => c.id));

  const advancedIds = getAdvancedIds(db, id);
  let athletes = db.prepare(`${ATHLETE_SELECT} WHERE a.event_id = ? ORDER BY CAST(a.bib AS INTEGER), a.bib`).all(id);
  athletes = athletes.filter(a => a.category_id && finalCatIds.has(a.category_id) && advancedIds.has(a.id));

  const bouldersMap = {};
  finalCats.forEach(c => {
    bouldersMap[c.id] = db.prepare('SELECT * FROM boulders WHERE category_id = ? AND round = ? ORDER BY number').all(c.id, 'final');
  });

  const scoreMap = {};
  db.prepare("SELECT * FROM scores WHERE event_id = ? AND round = 'final'").all(id).forEach(s => {
    if (!scoreMap[s.athlete_id]) scoreMap[s.athlete_id] = {};
    scoreMap[s.athlete_id][s.boulder_id] = s;
  });

  const dnsSet = new Set(
    db.prepare("SELECT athlete_id FROM dns_records WHERE event_id = ? AND round = 'final'").all(id).map(r => r.athlete_id)
  );

  const byCategory = {};
  athletes.forEach(a => {
    if (!byCategory[a.category_id]) byCategory[a.category_id] = [];
    const boulders = bouldersMap[a.category_id] || [];
    const is_dns = dnsSet.has(a.id);
    let tops = 0, zones = 0, tAtt = 0, zAtt = 0;
    const boulderScores = boulders.map(b => {
      const s = scoreMap[a.id]?.[b.id];
      if (!s) return { boulder_id: b.id, top: 0, top_attempts: 0, zone: 0, zone_attempts: 0, attempts: 0 };
      if (s.top) { tops++; tAtt += s.top_attempts || 1; }
      if (s.zone) { zones++; zAtt += s.zone_attempts || 1; }
      return { boulder_id: b.id, top: s.top ? 1 : 0, top_attempts: s.top_attempts || 0, zone: s.zone ? 1 : 0, zone_attempts: s.zone_attempts || 0, attempts: s.attempts || 0 };
    });

    const smashRankMap = computeSmashRankMap(db, id, a.category_id);

    byCategory[a.category_id].push({
      ...a, tops, zones, tAtt, zAtt,
      scored: !!scoreMap[a.id],
      boulderScores,
      score: calcScore(boulderScores),
      is_dns,
      _smashRank: smashRankMap[a.id] ?? 9999,
    });
  });

  const result = [];
  Object.entries(byCategory).forEach(([catId, group]) => {
    const prevRankMap = {};
    group.forEach(a => { prevRankMap[a.id] = a._smashRank; });
    const cmp = makeCmp(prevRankMap);
    assignRanksWithDns(group, cmp, prevRankMap);
    group.forEach(a => result.push(a));
  });

  res.json({ athletes: result, bouldersMap, total: athletes.length, scored: athletes.filter(a => scoreMap[a.id]).length });
});

// ── DNS ──────────────────────────────────────────────────────────────────────

router.get('/:id/dns', (req, res) => {
  const { round } = req.query;
  if (!round || !ROUND_KEYS.includes(round)) return res.status(400).json({ error: '無效輪次' });
  const records = db.prepare('SELECT athlete_id FROM dns_records WHERE event_id = ? AND round = ?').all(req.params.id, round);
  res.json({ dns: records.map(r => r.athlete_id) });
});

router.post('/:id/dns', adminOnly, requireEventOwnership, (req, res) => {
  const { athlete_id, round } = req.body;
  if (!athlete_id || !round || !ROUND_KEYS.includes(round)) return res.status(400).json({ error: '參數錯誤' });
  const athlete = db.prepare('SELECT id FROM athletes WHERE id = ? AND event_id = ?').get(athlete_id, req.params.id);
  if (!athlete) return res.status(404).json({ error: '選手不存在' });
  db.prepare('INSERT OR REPLACE INTO dns_records (athlete_id, event_id, round) VALUES (?, ?, ?)').run(athlete_id, req.params.id, round);
  res.json({ ok: true });
});

router.delete('/:id/dns', adminOnly, requireEventOwnership, (req, res) => {
  const { athlete_id, round } = req.body;
  if (!athlete_id || !round) return res.status(400).json({ error: '參數錯誤' });
  db.prepare('DELETE FROM dns_records WHERE athlete_id = ? AND event_id = ? AND round = ?').run(athlete_id, req.params.id, round);
  res.json({ ok: true });
});

// ── Start Order（finals，按 smash 排名降冪）───────────────────────────────────

router.get('/:id/categories/:catId/startorder/final', (req, res) => {
  const { id, catId } = req.params;
  const category = db.prepare('SELECT * FROM categories WHERE id = ? AND event_id = ?').get(catId, id);
  if (!category) return res.status(404).json({ error: '組別不存在' });
  if (category.rounds < 2) return res.status(400).json({ error: '此組別無決賽輪次' });

  const advancedIds = getAdvancedIds(db, id);
  let athletes = db.prepare('SELECT * FROM athletes WHERE event_id = ? AND category_id = ? ORDER BY CAST(bib AS INTEGER), bib').all(id, catId);
  if (advancedIds) athletes = athletes.filter(a => advancedIds.has(a.id));

  const smashRankMap = computeSmashRankMap(db, id, parseInt(catId));

  athletes.sort((a, b) => {
    const ra = smashRankMap[a.id] ?? 9999;
    const rb = smashRankMap[b.id] ?? 9999;
    if (ra !== rb) return rb - ra;
    return String(a.bib).localeCompare(String(b.bib), undefined, { numeric: true });
  });

  res.json(athletes.map((a, i) => ({ ...a, startOrder: i + 1, prevRank: smashRankMap[a.id] ?? null })));
});

// ── CSV Export（UI 保留，功能未實作）─────────────────────────────────────────

router.get('/:id/export/:round', adminOnly, requireEventOwnership, (req, res) => {
  res.status(501).json({ error: 'CSV 匯出功能尚未實作' });
});

module.exports = router;
