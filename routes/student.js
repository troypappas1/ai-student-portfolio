const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const { generateSummary } = require('../lib/summarize');
const { generateShareToken } = require('../lib/token');
const { generateConnectionsMap } = require('../lib/connections');
const { logAction } = require('../lib/audit');

const router = express.Router();

function loadDashboardData(studentId) {
  const classes = db
    .prepare(
      `SELECT classes.*, users.name AS teacher_name FROM classes
       JOIN enrollments ON enrollments.class_id = classes.id
       LEFT JOIN users ON users.id = classes.teacher_id
       WHERE enrollments.student_id = ? AND enrollments.status = 'approved'
       ORDER BY academic_year DESC, name ASC`
    )
    .all(studentId);

  const pendingClasses = db
    .prepare(
      `SELECT classes.*, enrollments.status, users.name AS teacher_name FROM classes
       JOIN enrollments ON enrollments.class_id = classes.id
       LEFT JOIN users ON users.id = classes.teacher_id
       WHERE enrollments.student_id = ? AND enrollments.status != 'approved'
       ORDER BY enrollments.requested_at DESC`
    )
    .all(studentId);

  const browsableClasses = db
    .prepare(
      `SELECT classes.*, users.name AS teacher_name FROM classes
       LEFT JOIN users ON users.id = classes.teacher_id
       WHERE classes.id NOT IN (SELECT class_id FROM enrollments WHERE student_id = ?)
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
  const byClass = {};
  const byActivity = {};
  const personal = [];
  for (const a of artifacts) {
    (byYear[a.academic_year] ||= []).push(a);
    if (a.class_id) (byClass[a.class_id] ||= []).push(a);
    else if (a.activity_id) (byActivity[a.activity_id] ||= []).push(a);
    else personal.push(a);
  }
  const allYears = Array.from(new Set([...Object.keys(byYear), ...years.map((y) => y.academic_year)])).sort().reverse();

  const shareLinks = db
    .prepare(
      `SELECT * FROM portfolio_permissions
       WHERE student_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY created_at DESC`
    )
    .all(studentId);

  const approvedCount = artifacts.filter((a) => a.status === 'approved').length;
  const graphRow = db.prepare('SELECT * FROM portfolio_graphs WHERE student_id = ?').get(studentId);
  const graph = graphRow ? { ...JSON.parse(graphRow.data), generatedAt: graphRow.generated_at } : null;

  return {
    classes,
    pendingClasses,
    browsableClasses,
    activities,
    byYear,
    byClass,
    byActivity,
    personal,
    allYears,
    yearMeta,
    shareLinks,
    approvedCount,
    graph,
    aiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

router.get('/student', requireRole('student'), (req, res) => {
  const data = loadDashboardData(req.session.user.id);
  res.render('student-dashboard', {
    user: req.session.user,
    ...data,
    currentYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    justCreatedLink: req.session.justCreatedLink || null,
    connectionsError: req.session.connectionsError || null,
  });
  delete req.session.justCreatedLink;
  delete req.session.connectionsError;
});

router.post('/student/classes/:id/request', requireRole('student'), (req, res) => {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.id);
  if (!cls) return res.status(404).send('Class not found.');

  const existing = db
    .prepare('SELECT * FROM enrollments WHERE student_id = ? AND class_id = ?')
    .get(req.session.user.id, cls.id);

  if (!existing) {
    db.prepare(`INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, 'pending')`).run(
      req.session.user.id,
      cls.id
    );
  } else if (existing.status === 'rejected') {
    db.prepare(
      `UPDATE enrollments SET status = 'pending', requested_at = datetime('now'), decided_by = NULL, decided_at = NULL WHERE id = ?`
    ).run(existing.id);
  }

  logAction({ actorId: req.session.user.id, action: 'enrollment.requested', resourceType: 'class', resourceId: cls.id });
  res.redirect('/student');
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
         WHERE classes.id = ? AND enrollments.student_id = ? AND enrollments.status = 'approved'`
      )
      .get(class_id, req.session.user.id);
    if (!cls) return res.status(403).send('You are not an approved member of that class.');
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

  const { text: summary, aiGenerated } = await generateSummary({
    studentName: req.session.user.name,
    title,
    classOrTeam: contextName,
    year: resolvedYear,
    rawDescription: raw_description,
  });

  const info = db
    .prepare(
      `INSERT INTO artifacts (student_id, class_id, activity_id, title, artifact_type, academic_year, project_link, raw_description, ai_summary, ai_generated, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
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
      summary,
      aiGenerated ? 1 : 0
    );

  logAction({
    actorId: req.session.user.id,
    action: 'artifact.submitted',
    resourceType: 'artifact',
    resourceId: info.lastInsertRowid,
  });

  res.redirect('/student');
});

router.post('/student/connections/generate', requireRole('student'), async (req, res) => {
  const studentId = req.session.user.id;

  if (!process.env.ANTHROPIC_API_KEY) {
    req.session.connectionsError = 'Add an AI key first — see the setup note below.';
    return res.redirect('/student');
  }

  const existingGraph = db.prepare('SELECT generated_at FROM portfolio_graphs WHERE student_id = ?').get(studentId);
  if (existingGraph) {
    const secondsAgo = (Date.now() - new Date(existingGraph.generated_at + 'Z').getTime()) / 1000;
    if (secondsAgo < 60) {
      req.session.connectionsError = 'You just generated a map — wait about a minute before generating again (each one uses AI credits).';
      return res.redirect('/student');
    }
  }

  const rows = db
    .prepare(
      `SELECT artifacts.id, artifacts.title, artifacts.academic_year, artifacts.teacher_summary,
              classes.name AS class_name, activities.name AS activity_name
       FROM artifacts
       LEFT JOIN classes ON classes.id = artifacts.class_id
       LEFT JOIN activities ON activities.id = artifacts.activity_id
       WHERE artifacts.student_id = ? AND artifacts.status = 'approved'
       ORDER BY artifacts.academic_year ASC, artifacts.created_at ASC`
    )
    .all(studentId);

  if (rows.length < 2) {
    req.session.connectionsError = 'You need at least two approved artifacts before a connections map is worth generating.';
    return res.redirect('/student');
  }

  try {
    const result = await generateConnectionsMap({
      studentName: req.session.user.name,
      artifacts: rows.map((r) => ({
        id: r.id,
        academic_year: r.academic_year,
        context: r.class_name || r.activity_name,
        summary: r.teacher_summary,
      })),
    });

    const graphData = {
      narrative: result.narrative,
      nodes: rows.map((r) => ({
        id: r.id,
        title: r.title,
        year: r.academic_year,
        context: r.class_name || r.activity_name,
        summary: r.teacher_summary,
      })),
      edges: result.edges,
    };

    db.prepare(
      `INSERT INTO portfolio_graphs (student_id, generated_by, data) VALUES (?, ?, ?)
       ON CONFLICT(student_id) DO UPDATE SET generated_by = excluded.generated_by, generated_at = datetime('now'), data = excluded.data`
    ).run(studentId, studentId, JSON.stringify(graphData));

    logAction({ actorId: studentId, action: 'connections_map.generated', resourceType: 'user', resourceId: studentId });
  } catch (err) {
    console.error('Connections map generation failed:', err.message);
    req.session.connectionsError = 'Generating the map failed — try again in a moment.';
  }

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
