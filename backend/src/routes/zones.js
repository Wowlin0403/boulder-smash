const router = require('express').Router({ mergeParams: true });
const db = require('../db');
const { adminOnly, requireEventOwnership } = require('../middleware/auth');

// ── Zones ────────────────────────────────────────────────────────────────────

router.get('/zones', (req, res) => {
  res.json(db.prepare('SELECT * FROM zones WHERE event_id = ? ORDER BY name').all(req.params.id));
});

router.post('/zones', adminOnly, requireEventOwnership, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '區域名稱必填' });
  const count = db.prepare('SELECT COUNT(*) as n FROM zones WHERE event_id = ?').get(req.params.id).n;
  if (count >= 8) return res.status(400).json({ error: '最多 8 個區域' });
  const zone = db.prepare('INSERT INTO zones (event_id, name) VALUES (?, ?)').run(req.params.id, name.trim());
  res.status(201).json(db.prepare('SELECT * FROM zones WHERE id = ?').get(zone.lastInsertRowid));
});

router.put('/zones/:zoneId', adminOnly, requireEventOwnership, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '區域名稱必填' });
  const zone = db.prepare('SELECT id FROM zones WHERE id = ? AND event_id = ?').get(req.params.zoneId, req.params.id);
  if (!zone) return res.status(404).json({ error: '區域不存在' });
  db.prepare('UPDATE zones SET name = ? WHERE id = ?').run(name.trim(), req.params.zoneId);
  res.json(db.prepare('SELECT * FROM zones WHERE id = ?').get(req.params.zoneId));
});

router.delete('/zones/:zoneId', adminOnly, requireEventOwnership, (req, res) => {
  const zone = db.prepare('SELECT id FROM zones WHERE id = ? AND event_id = ?').get(req.params.zoneId, req.params.id);
  if (!zone) return res.status(404).json({ error: '區域不存在' });
  db.prepare('DELETE FROM routes WHERE zone_id = ?').run(req.params.zoneId);
  db.prepare('DELETE FROM zones WHERE id = ?').run(req.params.zoneId);
  res.json({ ok: true });
});

router.delete('/zones', adminOnly, requireEventOwnership, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM smash_scores WHERE event_id = ?').run(req.params.id);
    db.prepare(`
      DELETE FROM category_routes WHERE category_id IN (
        SELECT id FROM categories WHERE event_id = ?
      )
    `).run(req.params.id);
    db.prepare('DELETE FROM routes WHERE event_id = ?').run(req.params.id);
    db.prepare('DELETE FROM zones WHERE event_id = ?').run(req.params.id);
  })();
  res.json({ ok: true });
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/routes', (req, res) => {
  const { zone_id, category_id } = req.query;
  if (category_id) {
    const routes = db.prepare(`
      SELECT r.*, z.name as zone_name,
        CASE WHEN cr.route_id IS NOT NULL THEN 1 ELSE 0 END as assigned
      FROM routes r
      LEFT JOIN zones z ON r.zone_id = z.id
      LEFT JOIN category_routes cr ON cr.route_id = r.id AND cr.category_id = ?
      WHERE r.event_id = ?
      ORDER BY r.zone_id, r.id
    `).all(category_id, req.params.id);
    return res.json(routes);
  }
  if (zone_id) {
    return res.json(db.prepare('SELECT r.*, z.name as zone_name FROM routes r LEFT JOIN zones z ON r.zone_id = z.id WHERE r.event_id = ? AND r.zone_id = ? ORDER BY r.id').all(req.params.id, zone_id));
  }
  res.json(db.prepare('SELECT r.*, z.name as zone_name FROM routes r LEFT JOIN zones z ON r.zone_id = z.id WHERE r.event_id = ? ORDER BY r.zone_id, r.id').all(req.params.id));
});

router.post('/routes', adminOnly, requireEventOwnership, (req, res) => {
  const { name, zone_id, top_score, zone_score } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '路線名稱必填' });
  if (zone_id) {
    const dup = db.prepare('SELECT id FROM routes WHERE event_id = ? AND zone_id = ? AND name = ?').get(req.params.id, zone_id, name.trim());
    if (dup) return res.status(400).json({ error: '此區域已有相同名稱的路線' });
  }
  const route = db.prepare('INSERT INTO routes (event_id, zone_id, name, top_score, zone_score) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, zone_id || null, name.trim(), top_score ?? 100, zone_score ?? 50);
  res.status(201).json(db.prepare('SELECT r.*, z.name as zone_name FROM routes r LEFT JOIN zones z ON r.zone_id = z.id WHERE r.id = ?').get(route.lastInsertRowid));
});

router.post('/routes/bulk', adminOnly, requireEventOwnership, (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: '參數格式錯誤' });

  const zones = db.prepare('SELECT * FROM zones WHERE event_id = ?').all(req.params.id);
  const existingRoutes = db.prepare('SELECT * FROM routes WHERE event_id = ?').all(req.params.id);

  const inserted = [];
  const skipped = [];

  const insert = db.prepare('INSERT INTO routes (event_id, zone_id, name, top_score, zone_score) VALUES (?, ?, ?, ?, ?)');

  db.transaction(() => {
    rows.forEach(row => {
      const zone = zones.find(z => z.name === row.zone_name);
      if (!zone) { skipped.push({ ...row, reason: 'no_zone' }); return; }

      const duplicate = existingRoutes.find(r => r.zone_id === zone.id && r.name === row.name);
      if (duplicate) { skipped.push({ ...row, reason: 'duplicate' }); return; }

      const result = insert.run(req.params.id, zone.id, row.name, row.top_score ?? 100, row.zone_score ?? 50);
      const newRoute = { id: result.lastInsertRowid, event_id: +req.params.id, zone_id: zone.id, name: row.name, top_score: row.top_score ?? 100, zone_score: row.zone_score ?? 50 };
      existingRoutes.push(newRoute);
      inserted.push(newRoute);
    });
  })();

  res.json({ inserted: inserted.length, skipped: skipped.length });
});

router.put('/routes/:routeId', adminOnly, requireEventOwnership, (req, res) => {
  const route = db.prepare('SELECT * FROM routes WHERE id = ? AND event_id = ?').get(req.params.routeId, req.params.id);
  if (!route) return res.status(404).json({ error: '路線不存在' });
  const { name, zone_id, top_score, zone_score } = req.body;
  const newName = name?.trim() ?? route.name;
  const newZoneId = zone_id !== undefined ? (zone_id || null) : route.zone_id;
  if (newZoneId) {
    const dup = db.prepare('SELECT id FROM routes WHERE event_id = ? AND zone_id = ? AND name = ? AND id != ?').get(req.params.id, newZoneId, newName, req.params.routeId);
    if (dup) return res.status(400).json({ error: '此區域已有相同名稱的路線' });
  }
  db.prepare('UPDATE routes SET name=?, zone_id=?, top_score=?, zone_score=? WHERE id=?').run(
    newName, newZoneId, top_score ?? route.top_score, zone_score ?? route.zone_score, req.params.routeId
  );
  res.json(db.prepare('SELECT r.*, z.name as zone_name FROM routes r LEFT JOIN zones z ON r.zone_id = z.id WHERE r.id = ?').get(req.params.routeId));
});

router.delete('/routes/:routeId', adminOnly, requireEventOwnership, (req, res) => {
  const route = db.prepare('SELECT id FROM routes WHERE id = ? AND event_id = ?').get(req.params.routeId, req.params.id);
  if (!route) return res.status(404).json({ error: '路線不存在' });
  db.prepare('DELETE FROM routes WHERE id = ?').run(req.params.routeId);
  res.json({ ok: true });
});

// ── Category Routes ───────────────────────────────────────────────────────────

router.get('/categories/:catId/routes', (req, res) => {
  const { catId } = req.params;
  const rows = db.prepare(`
    SELECT r.*, z.name as zone_name
    FROM routes r
    JOIN category_routes cr ON cr.route_id = r.id
    LEFT JOIN zones z ON r.zone_id = z.id
    WHERE cr.category_id = ? AND r.event_id = ?
    ORDER BY r.zone_id, r.id
  `).all(catId, req.params.id);
  res.json(rows);
});

router.post('/categories/:catId/routes', adminOnly, requireEventOwnership, (req, res) => {
  const { route_ids } = req.body;
  if (!Array.isArray(route_ids)) return res.status(400).json({ error: '參數格式錯誤' });
  const { catId } = req.params;

  db.transaction(() => {
    db.prepare('DELETE FROM category_routes WHERE category_id = ?').run(catId);
    const insert = db.prepare('INSERT OR IGNORE INTO category_routes (category_id, route_id) VALUES (?, ?)');
    route_ids.forEach(rid => insert.run(catId, rid));
  })();

  res.json({ ok: true });
});

// ── Judge Zone Assignments ────────────────────────────────────────────────────

router.get('/judge-zones', (req, res) => {
  const rows = db.prepare('SELECT user_id, zone_id FROM judge_zone_assignments WHERE event_id = ?').all(req.params.id);
  res.json(rows);
});

router.post('/judge-zones', adminOnly, requireEventOwnership, (req, res) => {
  const { user_id, zone_ids } = req.body;
  if (!user_id || !Array.isArray(zone_ids)) return res.status(400).json({ error: '參數格式錯誤' });

  const judge = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'judge'").get(user_id);
  if (!judge) return res.status(404).json({ error: '裁判不存在' });

  db.transaction(() => {
    db.prepare('DELETE FROM judge_zone_assignments WHERE user_id = ? AND event_id = ?').run(user_id, req.params.id);
    const insert = db.prepare('INSERT OR IGNORE INTO judge_zone_assignments (user_id, event_id, zone_id) VALUES (?, ?, ?)');
    zone_ids.forEach(zid => insert.run(user_id, req.params.id, zid));
  })();

  res.json({ ok: true });
});

// ── Judge's own zone info ─────────────────────────────────────────────────────

router.get('/my-zones', (req, res) => {
  if (req.user.role !== 'judge') return res.json([]);
  const zones = db.prepare(`
    SELECT z.* FROM zones z
    JOIN judge_zone_assignments jza ON jza.zone_id = z.id
    WHERE jza.user_id = ? AND jza.event_id = ?
  `).all(req.user.id, req.params.id);
  res.json(zones);
});

module.exports = router;
