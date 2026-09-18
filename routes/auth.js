const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { hashPin } = require('../lib/pin');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/student');
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
    req.session.user = { id: user.id, name: user.name, role: user.role };
    res.redirect(user.role === 'admin' ? '/admin' : '/student');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
