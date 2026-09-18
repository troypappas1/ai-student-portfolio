const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const { logAction } = require('../lib/audit');

const router = express.Router();
router.use('/teacher', requireRole('teacher'));

// Every query below filters by teacher_id = req.session.user.id at the SQL
// level rather than trusting a class id passed from the client — a teacher
// can never see or act on a class/artifact that isn't theirs.

router.get('/teacher', (req, res) => {
  const classes = db
    .prepare(
      `SELECT classes.*, COUNT(DISTINCT enrollments.student_id) AS student_count
       FROM classes
       LEFT JOIN enrollments ON enrollments.class_id = classes.id
       WHERE classes.teacher_id = ?
       GROUP BY classes.id
       ORDER BY classes.academic_year DESC, classes.name ASC`
    )
    .all(req.session.user.id);

  const pending = db
    .prepare(
      `SELECT artifacts.*, users.name AS student_name, classes.name AS class_name
       FROM artifacts
       JOIN classes ON classes.id = artifacts.class_id
       JOIN users ON users.id = artifacts.student_id
       WHERE classes.teacher_id = ? AND artifacts.status = 'pending'
       ORDER BY artifacts.created_at ASC`
    )
    .all(req.session.user.id);

  res.render('teacher-dashboard', { user: req.session.user, classes, pending });
});

router.get('/teacher/classes/:id', (req, res) => {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(req.params.id, req.session.user.id);
  if (!cls) return res.status(404).send('Class not found.');

  const roster = db
    .prepare(
      `SELECT users.id, users.name,
              COUNT(artifacts.id) AS artifact_count
       FROM users
       JOIN enrollments ON enrollments.student_id = users.id
       LEFT JOIN artifacts ON artifacts.student_id = users.id AND artifacts.class_id = ?
       WHERE enrollments.class_id = ?
       GROUP BY users.id
       ORDER BY users.name ASC`
    )
    .all(cls.id, cls.id);

  res.render('teacher-class', { user: req.session.user, cls, roster });
});

router.post('/teacher/artifacts/:id/approve', (req, res) => {
  const artifact = db
    .prepare(
      `SELECT artifacts.* FROM artifacts
       JOIN classes ON classes.id = artifacts.class_id
       WHERE artifacts.id = ? AND classes.teacher_id = ?`
    )
    .get(req.params.id, req.session.user.id);
  if (!artifact) return res.status(403).send('Forbidden');

  const summary = (req.body.teacher_summary || '').trim();
  db.prepare(
    `UPDATE artifacts SET status = 'approved', teacher_summary = ?, approved_by = ?, approved_at = datetime('now')
     WHERE id = ?`
  ).run(summary, req.session.user.id, artifact.id);

  logAction({ actorId: req.session.user.id, action: 'artifact.approved', resourceType: 'artifact', resourceId: artifact.id });
  res.redirect('back');
});

router.post('/teacher/artifacts/:id/reject', (req, res) => {
  const artifact = db
    .prepare(
      `SELECT artifacts.* FROM artifacts
       JOIN classes ON classes.id = artifacts.class_id
       WHERE artifacts.id = ? AND classes.teacher_id = ?`
    )
    .get(req.params.id, req.session.user.id);
  if (!artifact) return res.status(403).send('Forbidden');

  db.prepare(
    `UPDATE artifacts SET status = 'rejected', approved_by = ?, approved_at = datetime('now') WHERE id = ?`
  ).run(req.session.user.id, artifact.id);

  logAction({ actorId: req.session.user.id, action: 'artifact.rejected', resourceType: 'artifact', resourceId: artifact.id });
  res.redirect('back');
});

module.exports = router;
