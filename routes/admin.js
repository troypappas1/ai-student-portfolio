const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const { generatePin, hashPin } = require('../lib/pin');

const router = express.Router();
router.use(requireRole('admin'));

router.get('/admin', (req, res) => {
  const pending = db
    .prepare(
      `SELECT artifacts.*, users.name AS student_name
       FROM artifacts JOIN users ON users.id = artifacts.user_id
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
       FROM users LEFT JOIN artifacts ON artifacts.user_id = users.id
       WHERE users.role = 'student'
       GROUP BY users.id
       ORDER BY users.name ASC`
    )
    .all();

  res.render('admin-dashboard', {
    user: req.session.user,
    pending,
    students,
    newStudent: req.session.newStudent || null,
  });
  delete req.session.newStudent;
});

router.get('/admin/students/:id', (req, res) => {
  const student = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'student');
  if (!student) return res.status(404).send('Student not found.');

  const artifacts = db
    .prepare('SELECT * FROM artifacts WHERE user_id = ? ORDER BY year DESC, created_at DESC')
    .all(student.id);

  res.render('admin-student', { user: req.session.user, student, artifacts });
});

router.post('/admin/artifacts/:id/approve', (req, res) => {
  const summary = (req.body.ai_summary || '').trim();
  db.prepare(
    `UPDATE artifacts SET status = 'approved', ai_summary = ?, reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(summary, req.session.user.id, req.params.id);
  res.redirect('back');
});

router.post('/admin/artifacts/:id/reject', (req, res) => {
  db.prepare(
    `UPDATE artifacts SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(req.session.user.id, req.params.id);
  res.redirect('back');
});

router.post('/admin/students', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.school_email || '').trim() || null;
  if (!name) return res.status(400).send('Name is required.');

  const pin = generatePin();
  db.prepare(`INSERT INTO users (name, role, pin_hash, school_email) VALUES (?, 'student', ?, ?)`).run(
    name,
    hashPin(pin),
    email
  );

  req.session.newStudent = { name, pin };
  res.redirect('/admin');
});

module.exports = router;
