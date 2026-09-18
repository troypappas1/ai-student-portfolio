const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { hashPin } = require('../lib/pin');

const router = express.Router();

function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'teacher') return '/teacher';
  return '/student';
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(homeFor(req.session.user.role));
  }
  res.render('login', { error: null });
});

router.post('/login', loginLimiter, (req, res) => {
  const pin = (req.body.pin || '').trim();
  if (!pin) return res.render('login', { error: 'Enter your PIN.' });

  const user = db.prepare('SELECT * FROM users WHERE pin_hash = ?').get(hashPin(pin));
  if (!user) return res.render('login', { error: 'That PIN was not recognized.' });

  req.session.regenerate((err) => {
    if (err) return res.render('login', { error: 'Something went wrong. Try again.' });
    req.session.user = { id: user.id, name: user.name, role: user.role, graduationYear: user.graduation_year };
    res.redirect(homeFor(user.role));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
