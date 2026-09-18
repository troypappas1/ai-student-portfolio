require('dotenv').config();
const fs = require('fs');
const db = require('./db');
const { generatePin, hashPin } = require('./lib/pin');

const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (existing > 0) {
  console.log(`Database already has ${existing} user(s). Refusing to reseed — delete the DB file first if you want a clean slate.`);
  process.exit(1);
}

const insertUser = db.prepare(
  `INSERT INTO users (name, role, pin_hash, school_email) VALUES (?, ?, ?, ?)`
);
const insertArtifact = db.prepare(
  `INSERT INTO artifacts (user_id, title, class_or_team, year, project_link, raw_description, ai_summary, status, reviewed_by, reviewed_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const credentials = [];

function makeUser(name, role, email) {
  const pin = generatePin();
  const info = insertUser.run(name, role, hashPin(pin), email || null);
  credentials.push({ name, role, pin });
  return info.lastInsertRowid;
}

const adminId = makeUser('Ms. Alvarez (Admin/Teacher)', 'admin', 'alvarez@example.edu');

const maya = makeUser('Maya Chen', 'student', 'maya.chen@example.edu');
const jordan = makeUser('Jordan Blake', 'student', 'jordan.blake@example.edu');
const priya = makeUser('Priya Patel', 'student', 'priya.patel@example.edu');
const diego = makeUser('Diego Ramirez', 'student', 'diego.ramirez@example.edu');
const sam = makeUser('Sam Okafor', 'student', 'sam.okafor@example.edu');

const year = String(new Date().getFullYear());

insertArtifact.run(
  maya,
  'Autonomous line-following robot',
  'Robotics Club',
  year,
  'https://github.com/example/line-follower',
  'I built a robot that uses two IR sensors and a PID loop to follow a black line on the floor. The hardest part was tuning the PID constants so it wouldn\'t oscillate on sharp turns. I also 3D-printed the chassis myself.',
  'Maya designed and built an autonomous line-following robot for Robotics Club, using dual IR sensors and a hand-tuned PID control loop to keep it stable through sharp turns. She also 3D-printed the chassis herself.',
  'approved',
  adminId,
  new Date().toISOString()
);

insertArtifact.run(
  jordan,
  'Short film: "Waiting Room"',
  'Film & Media',
  year,
  'https://drive.google.com/file/d/example',
  'A 6-minute short film I wrote, shot, and edited about a conversation between two strangers in a hospital waiting room. I did all the sound design myself in Audacity.',
  '[Draft — no AI key configured] Jordan submitted "Short film: \\"Waiting Room\\"" for Film & Media. In their own words: A 6-minute short film I wrote, shot, and edited about a conversation between two strangers in a hospital waiting room. I did all the sound design myself in Audacity.',
  'pending',
  null,
  null
);

insertArtifact.run(
  priya,
  'Data visualization: county voter turnout',
  'AP Statistics',
  year,
  null,
  'For my final project I scraped county-level voter turnout data and built an interactive map showing turnout trends over 20 years. I used Python with pandas and plotly.',
  'Priya built an interactive choropleth map visualizing 20 years of county-level voter turnout trends for her AP Statistics final project, using Python with pandas and plotly to scrape and process the underlying data.',
  'approved',
  adminId,
  new Date().toISOString()
);

insertArtifact.run(
  diego,
  'Ceramic sculpture series: "Roots"',
  'Studio Art',
  year,
  null,
  'A series of three stoneware sculptures exploring my family\'s immigration story, glazed with a technique I developed by mixing my own glazes.',
  '[Draft — no AI key configured] Diego submitted "Ceramic sculpture series: \\"Roots\\"" for Studio Art. In their own words: A series of three stoneware sculptures exploring my family\'s immigration story, glazed with a technique I developed by mixing my own glazes.',
  'pending',
  null,
  null
);

fs.writeFileSync(
  'SEED_CREDENTIALS.md',
  '# Ledger seed credentials (local testing only — do not commit or share)\n\n' +
    '| Name | Role | PIN |\n|---|---|---|\n' +
    credentials.map((c) => `| ${c.name} | ${c.role} | \`${c.pin}\` |`).join('\n') +
    '\n'
);

console.log('Seeded database. Credentials written to SEED_CREDENTIALS.md:\n');
credentials.forEach((c) => console.log(`  ${c.role.padEnd(7)} ${c.name.padEnd(28)} PIN: ${c.pin}`));
