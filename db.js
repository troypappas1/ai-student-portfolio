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
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    pin_hash TEXT NOT NULL UNIQUE,
    school_email TEXT,
    graduation_year INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    course_code TEXT,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    academic_year TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_by INTEGER REFERENCES users(id),
    decided_at TEXT,
    UNIQUE (student_id, class_id)
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    academic_year TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    UNIQUE (student_id, activity_id)
  );

  CREATE TABLE IF NOT EXISTS portfolio_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,
    title TEXT,
    description TEXT,
    UNIQUE (student_id, academic_year)
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    artifact_type TEXT,
    academic_year TEXT NOT NULL,
    project_link TEXT,
    raw_description TEXT NOT NULL,
    ai_summary TEXT,
    ai_generated INTEGER NOT NULL DEFAULT 0,
    teacher_summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by INTEGER REFERENCES users(id),
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portfolio_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    label TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS portfolio_graphs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    generated_by INTEGER REFERENCES users(id),
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Lightweight migration for databases created before a column existed —
// CREATE TABLE IF NOT EXISTS only helps on a brand new database; a table
// that already exists (e.g. the currently-deployed instance's SQLite file)
// keeps its original columns unless we add them here explicitly.
function addColumnIfMissing(table, column, definition) {
  const existing = conn.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('users', 'graduation_year', 'INTEGER');
addColumnIfMissing('artifacts', 'ai_generated', 'INTEGER NOT NULL DEFAULT 0');
// Existing enrollments predate the request/approve workflow, so they were
// already de facto active — default them to 'approved' rather than
// 'pending' so nobody is silently locked out of a class they were already in.
addColumnIfMissing('enrollments', 'status', "TEXT NOT NULL DEFAULT 'approved'");
addColumnIfMissing('enrollments', 'requested_at', 'TEXT');
addColumnIfMissing('enrollments', 'decided_by', 'INTEGER REFERENCES users(id)');
addColumnIfMissing('enrollments', 'decided_at', 'TEXT');

conn.exec(`
  CREATE INDEX IF NOT EXISTS idx_artifacts_student ON artifacts(student_id);
  CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
  CREATE INDEX IF NOT EXISTS idx_artifacts_class ON artifacts(class_id);
  CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
  CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id);
  CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
  CREATE INDEX IF NOT EXISTS idx_activity_members_student ON activity_members(student_id);
  CREATE INDEX IF NOT EXISTS idx_permissions_token ON portfolio_permissions(token);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
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
