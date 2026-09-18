require('dotenv').config();
const fs = require('fs');
const db = require('./db');
const { generatePin, hashPin } = require('./lib/pin');

const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (existing > 0) {
  console.log(`Database already has ${existing} user(s). Refusing to reseed — delete the data/ folder first if you want a clean slate.`);
  process.exit(1);
}

const insertUser = db.prepare(`INSERT INTO users (name, role, pin_hash, school_email, graduation_year) VALUES (?, ?, ?, ?, ?)`);
const insertClass = db.prepare(`INSERT INTO classes (name, course_code, teacher_id, academic_year) VALUES (?, ?, ?, ?)`);
const insertActivity = db.prepare(`INSERT INTO activities (name, type, academic_year, description) VALUES (?, ?, ?, ?)`);
const enrollApproved = db.prepare(
  `INSERT INTO enrollments (student_id, class_id, status, decided_by, decided_at) VALUES (?, ?, 'approved', ?, datetime('now'))`
);
const enrollPending = db.prepare(`INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, 'pending')`);
const joinActivity = db.prepare(`INSERT INTO activity_members (student_id, activity_id) VALUES (?, ?)`);
const setYear = db.prepare(`INSERT INTO portfolio_years (student_id, academic_year, title, description) VALUES (?, ?, ?, ?)`);
const insertArtifact = db.prepare(
  `INSERT INTO artifacts (student_id, class_id, activity_id, title, artifact_type, academic_year, project_link, raw_description, ai_summary, ai_generated, teacher_summary, status, approved_by, approved_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const credentials = [];
function makeUser(name, role, email, graduationYear) {
  const pin = generatePin();
  const info = insertUser.run(name, role, hashPin(pin), email || null, graduationYear || null);
  credentials.push({ name, role, pin });
  return info.lastInsertRowid;
}

const thisYear = new Date().getFullYear();
const CUR = `${thisYear}-${thisYear + 1}`;
const PREV = `${thisYear - 1}-${thisYear}`;

// --- Admin ---
const adminId = makeUser('Ms. Alvarez (Admin)', 'admin', 'admin@sonomaacademy.edu');

// --- Teachers (a real department spread; several teach more than one class) ---
const TEACHERS = [
  { name: 'Mr. Chen', email: 'chen@sonomaacademy.edu' },
  { name: 'Ms. Diallo', email: 'diallo@sonomaacademy.edu' },
  { name: 'Dr. Okafor', email: 'okafor@sonomaacademy.edu' },
  { name: 'Ms. Reyes', email: 'reyes@sonomaacademy.edu' },
  { name: 'Mr. Patel', email: 'patel@sonomaacademy.edu' },
  { name: 'Ms. Kim', email: 'kim@sonomaacademy.edu' },
  { name: 'Mr. Alvarez', email: 'calvarez@sonomaacademy.edu' },
  { name: 'Coach Bennett', email: 'bennett@sonomaacademy.edu' },
];
const teacherIds = TEACHERS.map((t) => makeUser(t.name, 'teacher', t.email));

// --- Classes: 15 sections across 8 teachers, several teachers with multiple sections ---
const CLASS_DEFS = [
  { name: 'Physics', code: 'SCI-301', teacher: 0, year: CUR },
  { name: 'Chemistry', code: 'SCI-201', teacher: 0, year: CUR },
  { name: 'Studio Art', code: 'ART-201', teacher: 1, year: CUR },
  { name: 'Ceramics', code: 'ART-210', teacher: 1, year: CUR },
  { name: 'Algebra II', code: 'MATH-201', teacher: 2, year: CUR },
  { name: 'Calculus', code: 'MATH-401', teacher: 2, year: CUR },
  { name: 'Geometry', code: 'MATH-101', teacher: 2, year: PREV },
  { name: 'American Literature', code: 'ENG-301', teacher: 3, year: CUR },
  { name: 'Creative Writing', code: 'ENG-210', teacher: 3, year: CUR },
  { name: 'US History', code: 'HIS-301', teacher: 4, year: CUR },
  { name: 'World History', code: 'HIS-101', teacher: 4, year: PREV },
  { name: 'Spanish III', code: 'WL-301', teacher: 5, year: CUR },
  { name: 'Intro to Computer Science', code: 'CS-101', teacher: 6, year: CUR },
  { name: 'AP Computer Science', code: 'CS-401', teacher: 6, year: CUR },
  { name: 'PE 10', code: 'PE-100', teacher: 7, year: CUR },
];
const classIds = CLASS_DEFS.map((c) => insertClass.run(c.name, c.code, teacherIds[c.teacher], c.year).lastInsertRowid);
const C = Object.fromEntries(CLASS_DEFS.map((c, i) => [c.name, classIds[i]]));

// --- Activities (teams/clubs — admin-managed, no approval workflow) ---
const roboticsClubId = insertActivity.run('Robotics Club', 'Club', CUR, 'Design and build competition robots.').lastInsertRowid;
const soccerId = insertActivity.run('Varsity Soccer', 'Team', CUR, null).lastInsertRowid;
const debateId = insertActivity.run('Debate Team', 'Club', CUR, null).lastInsertRowid;
const yearbookId = insertActivity.run('Yearbook', 'Club', CUR, null).lastInsertRowid;
const dramaId = insertActivity.run('Drama Club', 'Club', CUR, null).lastInsertRowid;

// --- Students ---
// Troy Pappas is the fictional development student called for in the spec.
const troy = makeUser('Troy Pappas', 'student', 'troy.pappas@sonomaacademy.edu', 2028);
const maya = makeUser('Maya Chen', 'student', 'maya.chen@sonomaacademy.edu', 2027);
const jordan = makeUser('Jordan Blake', 'student', 'jordan.blake@sonomaacademy.edu', 2027);
const priya = makeUser('Priya Patel', 'student', 'priya.patel@sonomaacademy.edu', 2028);
const diego = makeUser('Diego Ramirez', 'student', 'diego.ramirez@sonomaacademy.edu', 2029);
const sam = makeUser('Sam Okafor', 'student', 'sam.okafor@sonomaacademy.edu', 2028);
const aria = makeUser('Aria Thompson', 'student', 'aria.thompson@sonomaacademy.edu', 2030);
const noah = makeUser('Noah Kim', 'student', 'noah.kim@sonomaacademy.edu', 2029);
const lily = makeUser('Lily Chen', 'student', 'lily.chen@sonomaacademy.edu', 2027);
const ethan = makeUser('Ethan Brooks', 'student', 'ethan.brooks@sonomaacademy.edu', 2030);

// Approved enrollments (a realistic spread across every teacher/class)
[
  [troy, 'Physics'], [troy, 'Calculus'],
  [maya, 'Studio Art'], [maya, 'Ceramics'],
  [jordan, 'Physics'], [jordan, 'US History'],
  [priya, 'Algebra II'], [priya, 'AP Computer Science'],
  [diego, 'Studio Art'], [diego, 'World History'],
  [sam, 'Calculus'], [sam, 'Creative Writing'],
  [aria, 'Intro to Computer Science'], [aria, 'PE 10'],
  [noah, 'Spanish III'], [noah, 'US History'],
  [lily, 'American Literature'], [lily, 'Geometry'],
  [ethan, 'Chemistry'], [ethan, 'AP Computer Science'],
].forEach(([studentId, className]) => enrollApproved.run(studentId, C[className], adminId));

// Pending class requests — this is what shows up in the new teacher/admin
// "approve a student's request to join your class" workflow.
[
  [troy, 'Chemistry'],
  [maya, 'American Literature'],
  [priya, 'Spanish III'],
  [aria, 'Physics'],
].forEach(([studentId, className]) => enrollPending.run(studentId, C[className]));

// Activity membership (admin-managed, unchanged)
[
  [troy, roboticsClubId], [jordan, roboticsClubId],
  [diego, soccerId], [sam, soccerId],
  [priya, debateId], [noah, debateId],
  [lily, yearbookId],
  [ethan, dramaId], [aria, dramaId],
].forEach(([studentId, activityId]) => joinActivity.run(studentId, activityId));

// --- Portfolio year titles ---
setYear.run(troy, PREV, 'Finding My Footing', 'The first year — trying things out.');
setYear.run(troy, CUR, 'Going Deeper', 'Building real projects and taking on more responsibility.');
setYear.run(maya, CUR, 'Building What Matters', null);
setYear.run(jordan, CUR, 'The Bigger Picture', null);

// --- Artifacts ---
// Troy gets a richer, two-year history (the spec's development student), with
// enough approved work to demo the connections map once an AI key is set.
insertArtifact.run(
  troy, null, null, 'Backyard Weather Station', 'Hardware', PREV, null,
  'I wired up a Raspberry Pi with a temperature and humidity sensor and logged readings to a spreadsheet every hour for a month, then charted the results.',
  'Troy built a Raspberry Pi weather station with temperature and humidity sensors, logging hourly readings for a month and charting the results.', 1,
  'Troy built a Raspberry Pi weather station with temperature and humidity sensors, logging hourly readings for a month and charting the results.',
  'approved', teacherIds[0], new Date().toISOString()
);
insertArtifact.run(
  troy, null, null, 'First Python Script: Dice Roller', 'Code', PREV, 'https://github.com/example/dice-roller',
  'A simple command-line dice roller in Python — my first real program longer than 10 lines. I learned about functions and random number generation.',
  "Troy wrote his first substantial Python program, a command-line dice roller, building his understanding of functions and random number generation.", 1,
  "Troy wrote his first substantial Python program, a command-line dice roller, building his understanding of functions and random number generation.",
  'approved', teacherIds[6], new Date().toISOString()
);
insertArtifact.run(
  troy, C['Physics'], null, 'Rocket Lab Data Analysis', 'PDF', CUR, null,
  'I analyzed our class rocket launch data to find patterns in thrust and altitude. Some of our results were unexpected — the second-stage separation added more drag than we predicted — so I had to rework my model and explain the discrepancy in my writeup.',
  'Troy analyzed experimental rocket launch data to identify patterns in thrust and altitude performance. He used quantitative analysis to interpret an unexpected result — added drag from second-stage separation — and communicated his revised conclusions clearly.', 1,
  'Troy analyzed experimental rocket launch data to identify patterns in thrust and altitude performance. He used quantitative analysis to interpret an unexpected result — added drag from second-stage separation — and communicated his revised conclusions clearly.',
  'approved', teacherIds[0], new Date().toISOString()
);
insertArtifact.run(
  troy, C['Calculus'], null, 'Related Rates: Water Tank Problem', 'PDF', CUR, null,
  'I extended a related-rates homework problem into a full model of a conical tank draining over time, checked it numerically against a simulation I wrote in Python.',
  'Troy extended a related-rates calculus problem into a full model of a draining conical tank, and validated his solution against a numerical simulation he wrote himself.', 1,
  'Troy extended a related-rates calculus problem into a full model of a draining conical tank, and validated his solution against a numerical simulation he wrote himself.',
  'approved', teacherIds[2], new Date().toISOString()
);
insertArtifact.run(
  troy, null, roboticsClubId, 'Autonomous Line-Following Robot', 'Video', CUR, 'https://github.com/example/line-follower',
  'I built a robot that uses two IR sensors and a PID loop to follow a black line on the floor. The hardest part was tuning the PID constants so it wouldn\'t oscillate on sharp turns. I also 3D-printed the chassis myself.',
  "Troy's submission \"Autonomous Line-Following Robot\" is ready for review. Connect an AI key to draft a summary automatically, or write one below.", 0, null,
  'pending', null, null
);

// A spread of other students' work — mostly single artifacts, mixed status,
// so the review queues aren't empty on a fresh seed.
insertArtifact.run(
  maya, C['Studio Art'], null, 'Ceramic Sculpture Series: "Roots"', 'Sculpture', CUR, null,
  'A series of three stoneware sculptures exploring my family\'s immigration story, glazed with a technique I developed by mixing my own glazes.',
  "Maya's submission \"Ceramic Sculpture Series: \\\"Roots\\\"\" is ready for review. Connect an AI key to draft a summary automatically, or write one below.", 0, null,
  'pending', null, null
);
insertArtifact.run(
  jordan, C['Physics'], null, 'Projectile Motion Lab', 'PDF', CUR, null,
  'I measured launch angle vs. range for a spring-loaded launcher and compared it to the theoretical model, including air resistance corrections.',
  'Jordan measured how launch angle affects range for a spring-loaded launcher and compared results against the theoretical projectile-motion model, incorporating air-resistance corrections into the analysis.', 1,
  'Jordan measured how launch angle affects range for a spring-loaded launcher and compared results against the theoretical projectile-motion model, incorporating air-resistance corrections into the analysis.',
  'approved', teacherIds[0], new Date().toISOString()
);
insertArtifact.run(
  priya, C['AP Computer Science'], null, 'Pathfinding Visualizer', 'Code', CUR, 'https://github.com/example/pathfinder',
  'A browser app that visualizes A* and Dijkstra pathfinding on a grid you can draw walls on. I wrote it to understand the algorithms better before the AP exam.',
  "Priya's submission \"Pathfinding Visualizer\" is ready for review. Connect an AI key to draft a summary automatically, or write one below.", 0, null,
  'pending', null, null
);
insertArtifact.run(
  diego, C['World History'], null, 'Cold War Propaganda Analysis', 'Essay', PREV, null,
  'An essay comparing US and Soviet propaganda posters from the 1950s-60s, looking at visual rhetoric techniques both sides used.',
  'Diego compared US and Soviet Cold War propaganda posters from the 1950s-60s, analyzing the visual rhetoric techniques each side used.', 1,
  'Diego compared US and Soviet Cold War propaganda posters from the 1950s-60s, analyzing the visual rhetoric techniques each side used.',
  'approved', teacherIds[4], new Date().toISOString()
);
insertArtifact.run(
  sam, C['Creative Writing'], null, 'Short Story: "The Long Way Home"', 'Writing', CUR, null,
  'A short story told in reverse chronological order about a family road trip. I was trying to practice non-linear narrative structure.',
  "Sam's submission \"Short Story: \\\"The Long Way Home\\\"\" is ready for review. Connect an AI key to draft a summary automatically, or write one below.", 0, null,
  'pending', null, null
);

fs.writeFileSync(
  'SEED_CREDENTIALS.md',
  '# Capture seed credentials (local testing only — do not commit or share)\n\n' +
    '| Name | Role | PIN |\n|---|---|---|\n' +
    credentials.map((c) => `| ${c.name} | ${c.role} | \`${c.pin}\` |`).join('\n') +
    '\n'
);

console.log(`Seeded ${credentials.length} people, ${CLASS_DEFS.length} classes, 5 activities. Credentials written to SEED_CREDENTIALS.md:\n`);
credentials.forEach((c) => console.log(`  ${c.role.padEnd(7)} ${c.name.padEnd(28)} PIN: ${c.pin}`));
