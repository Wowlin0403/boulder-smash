const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { superadminOnly, adminOnly } = require('../middleware/auth');

// ── Superadmin: 主辦方帳號管理 ───────────────────────────────────────────────

router.get('/', superadminOnly, (req, res) => {
  const organizers = db.prepare(
    "SELECT id, username, active, created_at FROM users WHERE role = 'organizer' ORDER BY id"
  ).all();
  const result = organizers.map(org => {
    const events = db.prepare('SELECT id, name FROM events WHERE organizer_id = ? ORDER BY date DESC').all(org.id);
    return { ...org, events };
  });
  res.json(result);
});

router.post('/', superadminOnly, (req, res) => {
  const { username, password, event_ids = [] } = req.body;
  if (!username || !password) return res.status(400).json({ error: '帳號與密碼必填' });

  try {
    let orgId;
    db.transaction(() => {
      const hash = bcrypt.hashSync(password, 10);
      orgId = db.prepare('INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, ?, 1)')
        .run(username, hash, 'organizer').lastInsertRowid;
      event_ids.forEach(eid => {
        db.prepare('UPDATE events SET organizer_id = ? WHERE id = ?').run(orgId, eid);
      });
    })();

    const org = db.prepare('SELECT id, username, active, created_at FROM users WHERE id = ?').get(orgId);
    const events = db.prepare('SELECT id, name FROM events WHERE organizer_id = ?').all(orgId);
    res.status(201).json({ ...org, events });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '帳號已存在' });
    throw e;
  }
});

// ── 自己改密碼（所有角色） ────────────────────────────────────────────────────

router.put('/self/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: '請填寫目前密碼與新密碼' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash))
    return res.status(401).json({ error: '目前密碼錯誤' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ ok: true });
});

// 更新負責比賽
router.put('/:id/events', superadminOnly, (req, res) => {
  const org = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'organizer'").get(req.params.id);
  if (!org) return res.status(404).json({ error: '主辦方不存在' });

  const { event_ids = [] } = req.body;
  db.transaction(() => {
    db.prepare('UPDATE events SET organizer_id = NULL WHERE organizer_id = ?').run(req.params.id);
    event_ids.forEach(eid => {
      db.prepare('UPDATE events SET organizer_id = ? WHERE id = ?').run(req.params.id, eid);
    });
  })();
  res.json({ ok: true });
});

// 重設密碼
router.put('/:id/password', superadminOnly, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '密碼必填' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '使用者不存在' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

// 啟用/停用主辦方
router.put('/:id/active', superadminOnly, (req, res) => {
  const org = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'organizer'").get(req.params.id);
  if (!org) return res.status(404).json({ error: '主辦方不存在' });
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// 刪除主辦方
router.delete('/:id', superadminOnly, (req, res) => {
  const org = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'organizer'").get(req.params.id);
  if (!org) return res.status(404).json({ error: '主辦方不存在' });
  db.transaction(() => {
    db.prepare('UPDATE events SET organizer_id = NULL WHERE organizer_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  })();
  res.json({ ok: true });
});

// ── Judge 帳號管理（organizer / superadmin）───────────────────────────────────

router.get('/judges', adminOnly, (req, res) => {
  let judges;
  if (req.user.role === 'superadmin') {
    judges = db.prepare("SELECT id, username, active, password_plain, created_at FROM users WHERE role = 'judge' ORDER BY username").all();
  } else {
    judges = db.prepare("SELECT id, username, active, password_plain, created_at FROM users WHERE role = 'judge' AND organizer_id = ? ORDER BY username").all(req.user.id);
  }
  res.json(judges);
});

router.post('/judges', adminOnly, (req, res) => {
  const { event_id } = req.body;
  if (!event_id) return res.status(400).json({ error: 'event_id 必填' });

  // 取得主辦方帳號名稱以產生密碼
  let organizerUsername, organizerId;
  if (req.user.role === 'organizer') {
    organizerUsername = req.user.username;
    organizerId = req.user.id;
  } else {
    const event = db.prepare('SELECT organizer_id FROM events WHERE id = ?').get(event_id);
    if (event?.organizer_id) {
      const org = db.prepare('SELECT username FROM users WHERE id = ?').get(event.organizer_id);
      organizerUsername = org?.username || 'admin';
      organizerId = event.organizer_id;
    } else {
      organizerUsername = 'admin';
      organizerId = null;
    }
  }

  // 找出此 event 目前最大的序號
  const existing = db.prepare("SELECT username FROM users WHERE username LIKE ?").all(`e${event_id}_j%`);
  const maxN = existing.reduce((max, u) => {
    const match = u.username.match(/^e\d+_j(\d+)$/);
    return match ? Math.max(max, parseInt(match[1])) : max;
  }, 0);

  const username = `e${event_id}_j${maxN + 1}`;
  const password = `${organizerUsername}0000`;

  try {
    const hash = bcrypt.hashSync(password, 10);
    const judgeId = db.prepare('INSERT INTO users (username, password_hash, role, active, organizer_id, password_plain) VALUES (?, ?, ?, 1, ?, ?)')
      .run(username, hash, 'judge', organizerId, password).lastInsertRowid;
    res.status(201).json(db.prepare('SELECT id, username, active, password_plain, created_at FROM users WHERE id = ?').get(judgeId));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '帳號已存在' });
    throw e;
  }
});

router.put('/judges/:id/password', adminOnly, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '密碼必填' });
  const judge = db.prepare("SELECT id, organizer_id FROM users WHERE id = ? AND role = 'judge'").get(req.params.id);
  if (!judge) return res.status(404).json({ error: '裁判不存在' });
  if (req.user.role === 'organizer' && judge.organizer_id !== req.user.id)
    return res.status(403).json({ error: '無權限' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

router.put('/judges/:id/active', adminOnly, (req, res) => {
  const judge = db.prepare("SELECT id, organizer_id FROM users WHERE id = ? AND role = 'judge'").get(req.params.id);
  if (!judge) return res.status(404).json({ error: '裁判不存在' });
  if (req.user.role === 'organizer' && judge.organizer_id !== req.user.id)
    return res.status(403).json({ error: '無權限' });
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/judges/:id', adminOnly, (req, res) => {
  const judge = db.prepare("SELECT id, organizer_id FROM users WHERE id = ? AND role = 'judge'").get(req.params.id);
  if (!judge) return res.status(404).json({ error: '裁判不存在' });
  if (req.user.role === 'organizer' && judge.organizer_id !== req.user.id)
    return res.status(403).json({ error: '無權限' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
