require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db'); // ensures tables exist before routes touch them

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');

const app = express();
app.set('trust proxy', 1); // needed for correct client IPs / rate limiting behind Railway's proxy

if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set. Set one in .env before deploying anywhere real.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 }, // 12 hours
  })
);

app.get('/', (req, res) => res.redirect('/login'));
app.use(authRoutes);
app.use(studentRoutes);
app.use(teacherRoutes);
app.use(adminRoutes);
app.use(publicRoutes);

app.use((req, res) => res.status(404).send('Not found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Capture running on http://localhost:${PORT}`));
