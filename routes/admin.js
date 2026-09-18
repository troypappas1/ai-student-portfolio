const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const { generatePin, hashPin } = require('../lib/pin');
const { logAction } = require('../lib/audit');

const router = express.Router();
router.use('/admin', requireRole('admin'));

router.get('/admin', (req, res) => {
  const pending = db
    .prepare(
      `SELECT artifacts.*, users.name AS student_name, classes.name AS class_name, activities.name AS activity_name
       FROM artifacts
       JOIN users ON users.id = artifacts.student_id
       LEFT JOIN classes ON classes.id = artifacts.class_id
       LEFT JOIN activities ON activities.id = artifacts.activity_id
       WHERE artifacts.status = 'pending'
       ORDER BY artifacts.created_at ASC`
    )
    .all();

  const students = db
    .prepare(
      `SELECT users.id, users.name, users.school_email,
              COUNT(artifacts.id) AS total,
              SUM(CASE WHEN artifacts.status = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN artifacts.status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM users LEFT JOIN artifacts ON artifacts.student_id = users.id
       WHERE users.role = 'student'
       GROUP BY users.id
       ORDER BY users.name ASC`
    )
    .all();

  const teachers = db.prepare(`SELECT id, name, school_email FROM users WHERE role = 'teacher' ORDER BY name ASC`).all();

  res.render('admin-dashboard', {
    user: req.session.user,
    pending,
    students,
    teachers,
    newPerson: req.session.newPerson || null,
    aiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
  delete req.session.newPerson;
});

router.get('/admin/students/:id', (req, res) => {
  const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'student');
  if (!student) return res.status(404).send('Student not found.');

  const artifacts = db
    .prepare(
      `SELECT artifacts.*, classes.name AS class_name, activities.name AS activity_name
       FROM artifacts
       LEFT JOIN classes ON classes.id = artifacts.class_id
       LEFT JOIN activities ON activities.id = artifacts.activity_id
       WHERE artifacts.student_id = ? ORDER BY artifacts.academic_year DESC, artifacts.created_at DESC`
    )
    .all(student.id);

  res.render('admin-student', { user: req.session.user, student, artifacts });
});

router.post('/admin/artifacts/:id/approve', (req, res) => {
  const summary = (req.body.teacher_summary || '').trim();
  db.prepare(
    `UPDATE artifacts SET status = 'approved', teacher_summary = ?, approved_by = ?, approved_at = datetime('now')
     WHERE id = ?`
  ).run(summary, req.session.user.id, req.params.id);
  logAction({ actorId: req.session.user.id, action: 'artifact.approved', resourceType: 'artifact', resourceId: Number(req.params.id) });
  res.redirect('back');
});

router.post('/admin/artifacts/:id/reject', (req, res) => {
  db.prepare(
    `UPDATE artifacts SET status = 'rejected', approved_by = ?, approved_at = datetime('now') WHERE id = ?`
  ).run(req.session.user.id, req.params.id);
  logAction({ actorId: req.session.user.id, action: 'artifact.rejected', resourceType: 'artifact', resourceId: Number(req.params.id) });
  res.redirect('back');
});

router.post('/admin/people', (req, res) => {
  const name = (req.body.name || '').trim();
  const role = req.body.role === 'teacher' ? 'teacher' : 'student';
  const email = (req.body.school_email || '').trim() || null;
  const graduationYear = role === 'student' ? parseInt(req.body.graduation_year, 10) || null : null;
  if (!name) return res.status(400).send('Name is required.');

  const pin = generatePin();
  const info = db
    .prepare(`INSERT INTO users (name, role, pin_hash, school_email, graduation_year) VALUES (?, ?, ?, ?, ?)`)
    .run(name, role, hashPin(pin), email, graduationYear);

  logAction({ actorId: req.session.user.id, action: 'user.created', resourceType: 'user', resourceId: info.lastInsertRowid, metadata: { role } });
  req.session.newPerson = { name, role, pin };
  res.redirect('/admin');
});

// --- Classes ---

router.get('/admin/classes', (req, res) => {
  const classes = db
    .prepare(
      `SELECT classes.*, users.name AS teacher_name,
              SUM(CASE WHEN enrollments.status = 'approved' THEN 1 ELSE 0 END) AS student_count,
              SUM(CASE WHEN enrollments.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM classes
       LEFT JOIN users ON users.id = classes.teacher_id
       LEFT JOIN enrollments ON enrollments.class_id = classes.id
       GROUP BY classes.id
       ORDER BY classes.academic_year DESC, classes.name ASC`
    )
    .all();
  const teachers = db.prepare(`SELECT id, name FROM users WHERE role = 'teacher' ORDER BY name ASC`).all();
  res.render('admin-classes', { user: req.session.user, classes, teachers });
});

router.post('/admin/classes', (req, res) => {
  const { name, course_code, teacher_id, academic_year } = req.body;
  if (!name || !academic_year) return res.status(400).send('Name and academic year are required.');
  const info = db
    .prepare(`INSERT INTO classes (name, course_code, teacher_id, academic_year) VALUES (?, ?, ?, ?)`)
    .run(name.trim(), (course_code || '').trim() || null, teacher_id || null, academic_year.trim());
  logAction({ actorId: req.session.user.id, action: 'class.created', resourceType: 'class', resourceId: info.lastInsertRowid });
  res.redirect('/admin/classes');
});

router.get('/admin/classes/:id', (req, res) => {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!cls) return res.status(404).send('Class not found.');
  const roster = db
    .prepare(
      `SELECT users.id, users.name, enrollments.id AS enrollment_id, enrollments.status FROM users
       JOIN enrollments ON enrollments.student_id = users.id
       WHERE enrollments.class_id = ? ORDER BY enrollments.status ASC, users.name ASC`
    )
    .all(cls.id);
  const available = db
    .prepare(
      `SELECT id, name FROM users
       WHERE role = 'student' AND id NOT IN (SELECT student_id FROM enrollments WHERE class_id = ?)
       ORDER BY name ASC`
    )
    .all(cls.id);
  res.render('admin-class', { user: req.session.user, cls, roster, available });
});

router.post('/admin/classes/:id/enroll', (req, res) => {
  const studentId = parseInt(req.body.student_id, 10);
  if (!studentId) return res.status(400).send('Student is required.');
  db.prepare(
    `INSERT INTO enrollments (student_id, class_id, status, decided_by, decided_at) VALUES (?, ?, 'approved', ?, datetime('now'))
     ON CONFLICT(student_id, class_id) DO UPDATE SET status = 'approved', decided_by = excluded.decided_by, decided_at = excluded.decided_at`
  ).run(studentId, req.params.id, req.session.user.id);
  logAction({ actorId: req.session.user.id, action: 'enrollment.created', resourceType: 'class', resourceId: Number(req.params.id), metadata: { studentId } });
  res.redirect(`/admin/classes/${req.params.id}`);
});

router.post('/admin/enrollments/:id/approve', (req, res) => {
  db.prepare(
    `UPDATE enrollments SET status = 'approved', decided_by = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(req.session.user.id, req.params.id);
  logAction({ actorId: req.session.user.id, action: 'enrollment.approved', resourceType: 'enrollment', resourceId: Number(req.params.id) });
  res.redirect('back');
});

router.post('/admin/enrollments/:id/reject', (req, res) => {
  db.prepare(
    `UPDATE enrollments SET status = 'rejected', decided_by = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(req.session.user.id, req.params.id);
  logAction({ actorId: req.session.user.id, action: 'enrollment.rejected', resourceType: 'enrollment', resourceId: Number(req.params.id) });
  res.redirect('back');
});

// --- Activities ---

router.get('/admin/activities', (req, res) => {
  const activities = db
    .prepare(
      `SELECT activities.*, COUNT(activity_members.id) AS student_count
       FROM activities
       LEFT JOIN activity_members ON activity_members.activity_id = activities.id
       GROUP BY activities.id
       ORDER BY activities.academic_year DESC, activities.name ASC`
    )
    .all();
  res.render('admin-activities', { user: req.session.user, activities });
});

router.post('/admin/activities', (req, res) => {
  const { name, type, academic_year, description } = req.body;
  if (!name || !academic_year) return res.status(400).send('Name and academic year are required.');
  const info = db
    .prepare(`INSERT INTO activities (name, type, academic_year, description) VALUES (?, ?, ?, ?)`)
    .run(name.trim(), (type || '').trim() || null, academic_year.trim(), (description || '').trim() || null);
  logAction({ actorId: req.session.user.id, action: 'activity.created', resourceType: 'activity', resourceId: info.lastInsertRowid });
  res.redirect('/admin/activities');
});

router.get('/admin/activities/:id', (req, res) => {
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).send('Activity not found.');
  const roster = db
    .prepare(
      `SELECT users.id, users.name FROM users
       JOIN activity_members ON activity_members.student_id = users.id
       WHERE activity_members.activity_id = ? ORDER BY users.name ASC`
    )
    .all(activity.id);
  const available = db
    .prepare(
      `SELECT id, name FROM users
       WHERE role = 'student' AND id NOT IN (SELECT student_id FROM activity_members WHERE activity_id = ?)
       ORDER BY name ASC`
    )
    .all(activity.id);
  res.render('admin-activity', { user: req.session.user, activity, roster, available });
});

router.post('/admin/activities/:id/enroll', (req, res) => {
  const studentId = parseInt(req.body.student_id, 10);
  if (!studentId) return res.status(400).send('Student is required.');
  db.prepare(`INSERT OR IGNORE INTO activity_members (student_id, activity_id) VALUES (?, ?)`).run(studentId, req.params.id);
  logAction({ actorId: req.session.user.id, action: 'activity_membership.created', resourceType: 'activity', resourceId: Number(req.params.id), metadata: { studentId } });
  res.redirect(`/admin/activities/${req.params.id}`);
});

// --- Portfolio year titles ---

router.post('/admin/students/:id/years', (req, res) => {
  const { academic_year, title, description } = req.body;
  if (!academic_year) return res.status(400).send('Academic year is required.');
  db.prepare(
    `INSERT INTO portfolio_years (student_id, academic_year, title, description) VALUES (?, ?, ?, ?)
     ON CONFLICT(student_id, academic_year) DO UPDATE SET title = excluded.title, description = excluded.description`
  ).run(req.params.id, academic_year.trim(), (title || '').trim() || null, (description || '').trim() || null);
  logAction({ actorId: req.session.user.id, action: 'portfolio_year.set', resourceType: 'user', resourceId: Number(req.params.id), metadata: { academic_year } });
  res.redirect(`/admin/students/${req.params.id}`);
});

// --- Audit log ---

router.get('/admin/audit', (req, res) => {
  const logs = db
    .prepare(
      `SELECT audit_logs.*, users.name AS actor_name
       FROM audit_logs LEFT JOIN users ON users.id = audit_logs.actor_user_id
       ORDER BY audit_logs.created_at DESC LIMIT 200`
    )
    .all();
  res.render('admin-audit', { user: req.session.user, logs });
});

module.exports = router;
