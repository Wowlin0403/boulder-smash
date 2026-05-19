const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/scoring.db');

const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'judge',
    active INTEGER DEFAULT 1,
    organizer_id INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    organizer_id INTEGER REFERENCES users(id),
    locked INTEGER DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#c8f135',
    rounds INTEGER NOT NULL DEFAULT 1,
    final_quota INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    bib TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    top_score REAL NOT NULL DEFAULT 100,
    zone_score REAL NOT NULL DEFAULT 50
  );

  CREATE TABLE IF NOT EXISTS category_routes (
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, route_id)
  );

  CREATE TABLE IF NOT EXISTS judge_zone_assignments (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, event_id, zone_id)
  );

  CREATE TABLE IF NOT EXISTS smash_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    top INTEGER NOT NULL DEFAULT 0,
    top_attempts INTEGER NOT NULL DEFAULT 0,
    zone INTEGER NOT NULL DEFAULT 0,
    zone_attempts INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by INTEGER REFERENCES users(id),
    UNIQUE(athlete_id, route_id)
  );

  CREATE TABLE IF NOT EXISTS boulders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    round TEXT NOT NULL DEFAULT 'final',
    number INTEGER NOT NULL,
    label TEXT NOT NULL,
    UNIQUE(category_id, round, number)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    round TEXT NOT NULL,
    boulder_id INTEGER NOT NULL REFERENCES boulders(id) ON DELETE CASCADE,
    top INTEGER NOT NULL DEFAULT 0,
    top_attempts INTEGER NOT NULL DEFAULT 0,
    zone INTEGER NOT NULL DEFAULT 0,
    zone_attempts INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by INTEGER REFERENCES users(id),
    UNIQUE(athlete_id, round, boulder_id)
  );

  CREATE TABLE IF NOT EXISTS dns_records (
    athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    round TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (athlete_id, event_id, round)
  );
`);

db.prepare("UPDATE users SET role = 'superadmin' WHERE role = 'admin'").run();

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existing) {
  const initPassword = process.env.ADMIN_PASSWORD || 'admin1234';
  const hash = bcrypt.hashSync(initPassword, 10);
  db.prepare('INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, ?, 1)').run('admin', hash, 'superadmin');
}

module.exports = db;
