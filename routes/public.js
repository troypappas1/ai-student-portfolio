const express = require('express');
const db = require('../db');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.get('/p/:token', (req, res) => {
  const link = db
    .prepare(
      `SELECT portfolio_permissions.*, users.name AS student_name
       FROM portfolio_permissions
       JOIN users ON users.id = portfolio_permissions.student_id
       WHERE token = ?`
    )
    .get(req.params.token);

  if (!link || link.revoked_at || (link.expires_at && link.expires_at <= new Date().toISOString())) {
    return res.status(404).render('share-invalid');
  }

  const artifacts = db
    .prepare(
      `SELECT artifacts.*, classes.name AS class_name, activities.name AS activity_name
       FROM artifacts
       LEFT JOIN classes ON classes.id = artifacts.class_id
       LEFT JOIN activities ON activities.id = artifacts.activity_id
       WHERE artifacts.student_id = ? AND artifacts.status = 'approved'
       ORDER BY artifacts.academic_year DESC, artifacts.created_at DESC`
    )
    .all(link.student_id);

  const years = db
    .prepare('SELECT * FROM portfolio_years WHERE student_id = ? ORDER BY academic_year DESC')
    .all(link.student_id);
  const yearMeta = {};
  for (const y of years) yearMeta[y.academic_year] = y;

  const byYear = {};
  for (const a of artifacts) (byYear[a.academic_year] ||= []).push(a);
  const allYears = Array.from(new Set([...Object.keys(byYear), ...years.map((y) => y.academic_year)])).sort().reverse();

  logAction({
    actorId: null,
    action: 'share_link.viewed',
    resourceType: 'portfolio_permission',
    resourceId: link.id,
    metadata: { ip: req.ip },
  });

  res.render('public-portfolio', { studentName: link.student_name, byYear, allYears, yearMeta });
});

module.exports = router;
