const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATABASE_PATH = process.env.DATABASE_PATH || './data/ledger.db';
fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const conn = new DatabaseSync(DATABASE_PATH);
conn.exec('PRAGMA journal_mode = WAL;');
conn.exec('PRAGMA foreign_keys = ON;');

conn.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
    pin_hash TEXT NOT NULL UNIQUE,
    school_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    class_or_team TEXT,
    year TEXT NOT NULL,
    project_link TEXT,
    raw_description TEXT NOT NULL,
    ai_summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_artifacts_user ON artifacts(user_id);
  CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
`);

// Thin wrapper so the rest of the app can use the same
// prepare().run/get/all(...) shape that better-sqlite3 exposes.
module.exports = {
  prepare(sql) {
    const stmt = conn.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params),
    };
  },
  exec(sql) {
    return conn.exec(sql);
  },
};
