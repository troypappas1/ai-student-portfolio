const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const { generateSummary } = require('../lib/summarize');
const { generateShareToken } = require('../lib/token');
const { logAction } = require('../lib/audit');

const router = express.Router();

function loadDashboardData(studentId) {
  const classes = db
    .prepare(
      `SELECT classes.* FROM classes
       JOIN enrollments ON enrollments.class_id = classes.id
       WHERE enrollments.student_id = ?
       ORDER BY academic_year DESC, name ASC`
    )
    .all(studentId);

  const activities = db
    .prepare(
      `SELECT activities.* FROM activities
       JOIN activity_members ON activity_members.activity_id = activities.id
       WHERE activity_members.student_id = ?
       ORDER BY academic_year DESC, name ASC`
    )
    .all(studentId);

  const artifacts = db
    .prepare(
      `SELECT artifacts.*, classes.name AS class_name, activities.name AS activity_name
       FROM artifacts
       LEFT JOIN classes ON classes.id = artifacts.class_id
       LEFT JOIN activities ON activities.id = artifacts.activity_id
       WHERE artifacts.student_id = ?
       ORDER BY artifacts.academic_year DESC, artifacts.created_at DESC`
    )
    .all(studentId);

  const years = db
    .prepare('SELECT * FROM portfolio_years WHERE student_id = ? ORDER BY academic_year DESC')
    .all(studentId);
  const yearMeta = {};
  for (const y of years) yearMeta[y.academic_year] = y;

  const byYear = {};
  for (const a of artifacts) (byYear[a.academic_year] ||= []).push(a);
  const allYears = Array.from(new Set([...Object.keys(byYear), ...years.map((y) => y.academic_year)])).sort().reverse();

  const shareLinks = db
    .prepare(
      `SELECT * FROM portfolio_permissions
       WHERE student_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY created_at DESC`
    )
    .all(studentId);

  return { classes, activities, byYear, allYears, yearMeta, shareLinks };
}

router.get('/student', requireRole('student'), (req, res) => {
  const data = loadDashboardData(req.session.user.id);
  res.render('student-dashboard', {
    user: req.session.user,
    ...data,
    currentYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    justCreatedLink: req.session.justCreatedLink || null,
  });
  delete req.session.justCreatedLink;
});

router.post('/student/artifacts', requireRole('student'), async (req, res) => {
  const { title, artifact_type, context_type, class_id, activity_id, academic_year, project_link, raw_description } =
    req.body;
  if (!title || !raw_description) {
    return res.status(400).send('Title and description are required.');
  }

  let resolvedClassId = null;
  let resolvedActivityId = null;
  let resolvedYear = (academic_year || '').trim();
  let contextName = null;

  if (context_type === 'class' && class_id) {
    const cls = db
      .prepare(
        `SELECT classes.* FROM classes
         JOIN enrollments ON enrollments.class_id = classes.id
         WHERE classes.id = ? AND enrollments.student_id = ?`
      )
      .get(class_id, req.session.user.id);
    if (!cls) return res.status(403).send('You are not enrolled in that class.');
    resolvedClassId = cls.id;
    resolvedYear = cls.academic_year;
    contextName = cls.name;
  } else if (context_type === 'activity' && activity_id) {
    const act = db
      .prepare(
        `SELECT activities.* FROM activities
         JOIN activity_members ON activity_members.activity_id = activities.id
         WHERE activities.id = ? AND activity_members.student_id = ?`
      )
      .get(activity_id, req.session.user.id);
    if (!act) return res.status(403).send('You are not a member of that activity.');
    resolvedActivityId = act.id;
    resolvedYear = act.academic_year;
    contextName = act.name;
  }

  if (!resolvedYear) return res.status(400).send('Academic year is required.');

  const summary = await generateSummary({
    studentName: req.session.user.name,
    title,
    classOrTeam: contextName,
    year: resolvedYear,
    rawDescription: raw_description,
  });

  const info = db
    .prepare(
      `INSERT INTO artifacts (student_id, class_id, activity_id, title, artifact_type, academic_year, project_link, raw_description, ai_summary, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    )
    .run(
      req.session.user.id,
      resolvedClassId,
      resolvedActivityId,
      title.trim(),
      (artifact_type || '').trim() || null,
      resolvedYear,
      (project_link || '').trim() || null,
      raw_description.trim(),
      summary
    );

  logAction({
    actorId: req.session.user.id,
    action: 'artifact.submitted',
    resourceType: 'artifact',
    resourceId: info.lastInsertRowid,
  });

  res.redirect('/student');
});

router.post('/student/share', requireRole('student'), (req, res) => {
  const label = (req.body.label || '').trim() || null;
  const days = parseInt(req.body.expires_in_days, 10);
  const token = generateShareToken();
  const expiresAt =
    Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;

  const info = db
    .prepare(
      `INSERT INTO portfolio_permissions (student_id, token, label, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.session.user.id, token, label, req.session.user.id, expiresAt);

  logAction({
    actorId: req.session.user.id,
    action: 'share_link.created',
    resourceType: 'portfolio_permission',
    resourceId: info.lastInsertRowid,
    metadata: { expiresAt },
  });

  req.session.justCreatedLink = token;
  res.redirect('/student');
});

router.post('/student/share/:id/revoke', requireRole('student'), (req, res) => {
  const link = db
    .prepare('SELECT * FROM portfolio_permissions WHERE id = ? AND student_id = ?')
    .get(req.params.id, req.session.user.id);
  if (!link) return res.status(404).send('Not found.');

  db.prepare(`UPDATE portfolio_permissions SET revoked_at = datetime('now') WHERE id = ?`).run(link.id);
  logAction({
    actorId: req.session.user.id,
    action: 'share_link.revoked',
    resourceType: 'portfolio_permission',
    resourceId: link.id,
  });
  res.redirect('/student');
});

module.exports = router;
