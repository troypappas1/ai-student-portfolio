const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const { generateSummary } = require('../lib/summarize');

const router = express.Router();

router.get('/student', requireRole('student'), (req, res) => {
  const artifacts = db
    .prepare('SELECT * FROM artifacts WHERE user_id = ? ORDER BY year DESC, created_at DESC')
    .all(req.session.user.id);

  const byYear = {};
  for (const a of artifacts) {
    (byYear[a.year] ||= []).push(a);
  }
  const years = Object.keys(byYear).sort().reverse();

  res.render('student-dashboard', {
    user: req.session.user,
    byYear,
    years,
    currentYear: String(new Date().getFullYear()),
  });
});

router.post('/student/artifacts', requireRole('student'), async (req, res) => {
  const { title, class_or_team, year, project_link, raw_description } = req.body;
  if (!title || !year || !raw_description) {
    return res.status(400).send('Title, year, and description are required.');
  }

  const summary = await generateSummary({
    studentName: req.session.user.name,
    title,
    classOrTeam: class_or_team,
    year,
    rawDescription: raw_description,
  });

  db.prepare(
    `INSERT INTO artifacts (user_id, title, class_or_team, year, project_link, raw_description, ai_summary, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(
    req.session.user.id,
    title.trim(),
    (class_or_team || '').trim() || null,
    year.trim(),
    (project_link || '').trim() || null,
    raw_description.trim(),
    summary
  );

  res.redirect('/student');
});

module.exports = router;
