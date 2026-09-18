require('dotenv').config();
const fs = require('fs');
const db = require('./db');
const { generatePin, hashPin } = require('./lib/pin');

const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (existing > 0) {
  console.log(`Database already has ${existing} user(s). Refusing to reseed — delete the data/ folder first if you want a clean slate.`);
  process.exit(1);
}

const insertUser = db.prepare(`INSERT INTO users (name, role, pin_hash, school_email) VALUES (?, ?, ?, ?)`);
const insertClass = db.prepare(`INSERT INTO classes (name, course_code, teacher_id, academic_year) VALUES (?, ?, ?, ?)`);
const insertActivity = db.prepare(`INSERT INTO activities (name, type, academic_year, description) VALUES (?, ?, ?, ?)`);
const enroll = db.prepare(`INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)`);
const joinActivity = db.prepare(`INSERT INTO activity_members (student_id, activity_id) VALUES (?, ?)`);
const setYear = db.prepare(`INSERT INTO portfolio_years (student_id, academic_year, title, description) VALUES (?, ?, ?, ?)`);
const insertArtifact = db.prepare(
  `INSERT INTO artifacts (student_id, class_id, activity_id, title, artifact_type, academic_year, project_link, raw_description, ai_summary, teacher_summary, status, approved_by, approved_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const credentials = [];
function makeUser(name, role, email) {
  const pin = generatePin();
  const info = insertUser.run(name, role, hashPin(pin), email || null);
  credentials.push({ name, role, pin });
  return info.lastInsertRowid;
}

const adminId = makeUser('Ms. Alvarez (Admin)', 'admin', 'alvarez@sonomaacademy.edu');
const teacherRobotics = makeUser('Mr. Chen (Robotics/Physics)', 'teacher', 'chen@sonomaacademy.edu');
const teacherArt = makeUser('Ms. Diallo (Studio Art)', 'teacher', 'diallo@sonomaacademy.edu');

const thisYear = new Date().getFullYear();
const CUR = `${thisYear}-${thisYear + 1}`;
const PREV = `${thisYear - 1}-${thisYear}`;

const physicsId = insertClass.run('Physics', 'SCI-301', teacherRobotics, CUR).lastInsertRowid;
const artId = insertClass.run('Studio Art', 'ART-201', teacherArt, CUR).lastInsertRowid;
const roboticsClubId = insertActivity.run('Robotics Club', 'Club', CUR, 'Design and build competition robots.').lastInsertRowid;

// Troy Pappas — the development student called for in the project spec.
const troy = makeUser('Troy Pappas', 'student', 'troy.pappas@sonomaacademy.edu');
enroll.run(troy, physicsId);
joinActivity.run(troy, roboticsClubId);
setYear.run(troy, PREV, 'Finding My Footing', 'The first year — trying things out.');
setYear.run(troy, CUR, 'Going Deeper', 'Building real projects and taking on more responsibility.');

insertArtifact.run(
  troy,
  physicsId,
  null,
  'Rocket Lab Data Analysis',
  'PDF',
  CUR,
  null,
  'I analyzed our class rocket launch data to find patterns in thrust and altitude. Some of our results were unexpected — the second-stage separation added more drag than we predicted — so I had to rework my model and explain the discrepancy in my writeup.',
  'Troy analyzed experimental rocket launch data to identify patterns in thrust and altitude performance. He used quantitative analysis to interpret an unexpected result — added drag from second-stage separation — and communicated his revised conclusions clearly.',
  'Troy analyzed experimental rocket launch data to identify patterns in thrust and altitude performance. He used quantitative analysis to interpret an unexpected result — added drag from second-stage separation — and communicated his revised conclusions clearly.',
  'approved',
  teacherRobotics,
  new Date().toISOString()
);

insertArtifact.run(
  troy,
  null,
  roboticsClubId,
  'Autonomous Line-Following Robot',
  'Video',
  CUR,
  'https://github.com/example/line-follower',
  'I built a robot that uses two IR sensors and a PID loop to follow a black line on the floor. The hardest part was tuning the PID constants so it wouldn\'t oscillate on sharp turns. I also 3D-printed the chassis myself.',
  '[Draft — no AI key configured] Troy submitted "Autonomous Line-Following Robot" for Robotics Club. In their own words: I built a robot that uses two IR sensors and a PID loop to follow a black line on the floor. The hardest part was tuning the PID constants so it wouldn\'t oscillate on sharp turns. I also 3D-printed the chassis myself.',
  null,
  'pending',
  null,
  null
);

// A couple of additional mock students so the review queue and roster aren't empty.
const maya = makeUser('Maya Chen', 'student', 'maya.chen@sonomaacademy.edu');
enroll.run(maya, artId);
setYear.run(maya, CUR, 'Building What Matters', null);
insertArtifact.run(
  maya,
  artId,
  null,
  'Ceramic Sculpture Series: "Roots"',
  'Sculpture',
  CUR,
  null,
  'A series of three stoneware sculptures exploring my family\'s immigration story, glazed with a technique I developed by mixing my own glazes.',
  '[Draft — no AI key configured] Maya submitted "Ceramic Sculpture Series: \\"Roots\\"" for Studio Art. In their own words: A series of three stoneware sculptures exploring my family\'s immigration story, glazed with a technique I developed by mixing my own glazes.',
  null,
  'pending',
  null,
  null
);

const jordan = makeUser('Jordan Blake', 'student', 'jordan.blake@sonomaacademy.edu');
enroll.run(jordan, physicsId);
setYear.run(jordan, CUR, 'The Bigger Picture', null);
insertArtifact.run(
  jordan,
  physicsId,
  null,
  'Projectile Motion Lab',
  'PDF',
  CUR,
  null,
  'I measured launch angle vs. range for a spring-loaded launcher and compared it to the theoretical model, including air resistance corrections.',
  'Jordan measured how launch angle affects range for a spring-loaded launcher and compared results against the theoretical projectile-motion model, incorporating air-resistance corrections into the analysis.',
  'Jordan measured how launch angle affects range for a spring-loaded launcher and compared results against the theoretical projectile-motion model, incorporating air-resistance corrections into the analysis.',
  'approved',
  teacherRobotics,
  new Date().toISOString()
);

fs.writeFileSync(
  'SEED_CREDENTIALS.md',
  '# Capture seed credentials (local testing only — do not commit or share)\n\n' +
    '| Name | Role | PIN |\n|---|---|---|\n' +
    credentials.map((c) => `| ${c.name} | ${c.role} | \`${c.pin}\` |`).join('\n') +
    '\n'
);

console.log('Seeded database. Credentials written to SEED_CREDENTIALS.md:\n');
credentials.forEach((c) => console.log(`  ${c.role.padEnd(7)} ${c.name.padEnd(28)} PIN: ${c.pin}`));
