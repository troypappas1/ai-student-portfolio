# Capture — Sonoma Academy student portfolio

*Grades tell you how a student performed. Capture shows you what they actually did.*

A working pilot build: students request to join classes (teacher approves), submit
"artifacts" tied to a real class or team/club, get an AI-drafted summary, and their
teacher reviews and approves it before it becomes part of the student's permanent,
year-by-year portfolio. Students control sharing explicitly via revocable links —
portfolios are private by default.

This is a real Node/Express app with a SQLite database — not a mock. It follows the
phased approach from the full product spec: this build is the **foundation + core
workflow** phases, not the full Next.js/Supabase production architecture described in
that spec (see "Relationship to the full spec" below for what's intentionally deferred
and why, and for an honest requirement-by-requirement compliance summary).

## Run it locally

```bash
npm install
cp .env.example .env        # then open .env and set a real SESSION_SECRET
npm run seed                 # creates a realistic school: 1 admin, 8 teachers, 10 students,
                              # 15 classes, 5 activities, and a dev student (Troy Pappas, Class of 2028)
npm start
```

Open http://localhost:3000. Sign-in PINs are printed to the console and written to
`SEED_CREDENTIALS.md` (gitignored — local testing only).

**Do you need an AI key?** Yes, for real AI-drafted summaries and the connections map —
set `ANTHROPIC_API_KEY` in `.env` (locally) or `fly secrets set ANTHROPIC_API_KEY=...`
(deployed). Without it, artifact summaries fall back to a plain, clearly-labeled
placeholder ("Draft (no AI key)") and the connections map is disabled with an explanation
— the whole rest of the app still works with zero configuration.

## What's actually built

- **PIN-based sign-in** — 8-character random PIN, hashed at rest, rate-limited login.
- **Three roles**: `student`, `teacher`, `admin`, each enforced server-side/SQL-side, not
  by hiding UI. A teacher's every query filters by `teacher_id = req.session.user.id`;
  tested that changing a class id in the URL to another teacher's class 404s instead of
  leaking data, and that a student POSTing an artifact against a class they're only
  *pending* on (not yet approved) gets a 403.
- **Student-requests-class → teacher-approves workflow**: students browse all classes
  under the "Join a Class" tab and request to join; the class only appears as theirs
  (and only then can they submit artifacts to it) once the teacher who owns that class
  approves the request. Admin can also approve/deny, or enroll directly (auto-approved).
- **A real school-shaped seed**: 8 teachers across departments, 15 class sections —
  several teachers teaching 2–3 sections each (`classes.teacher_id`) — 5 clubs/teams, and
  10 students with a realistic, varied spread of enrollments, pending requests, and
  artifacts in different review states.
- **Tabbed student dashboard** — one tab per class the student is actually in, one per
  activity, a Personal Projects tab, a Join-a-Class tab, and a Portfolio tab with the
  year-by-year narrative, sharing, and the connections map. Each class/activity tab has
  its own scoped "submit an artifact" form, so a student never has to hunt through a
  dropdown of everything at the school.
- **Artifact review workflow** — AI drafts a summary immediately on submission,
  clearly labeled as an AI draft or a no-key placeholder (never silently presented as
  final); the teacher (or admin) edits/approves it, and that edited version
  (`teacher_summary`) becomes the official portfolio text — kept in a separate column
  from the AI draft so the two are never conflated.
- **The web of connections** — once a student has 2+ approved artifacts, they can
  generate an AI-found map of genuine connections between their work (shared skills,
  recurring interests, growth over time) as an interactive force-directed diagram —
  hover or tap a node to see its summary and which edges light up. Explicitly a manual,
  on-demand action (not auto-generated per page load) with a visible credits warning and
  a 60-second regenerate cooldown, because each generation is a real AI call. The same
  diagram renders on the public share-link page.
- **Sharing** — a student can generate a high-entropy, revocable share link
  (`crypto.randomBytes`, never derived from the student's id) with an optional
  expiration, viewable at `/p/:token` with no login and showing only `status='approved'`
  artifacts. Every creation, revoke, and view is audit-logged.
- Warm paper/ink editorial visual style: cream/moss/clay palette, Source Serif 4 +
  IBM Plex Sans, "Sonoma Academy / Capture" branding throughout, including the student's
  graduation year ("Class of 2028") next to their name.

## Relationship to the full spec

The original spec calls for Next.js + TypeScript + Supabase (Postgres, Auth, RLS, S3-
compatible Storage) deployed on Vercel — a different, much larger production
architecture — and its own phasing section explicitly says not to build everything at
once. This app stays on the Express/SQLite foundation and brings forward every piece of
that spec that translates onto it. Honest scorecard against the spec's numbered sections:

**Solidly met:** server-side/SQL-enforced authorization for every role (never trusting a
client-supplied role or id — verified live, not just asserted); portfolios private by
default with explicit, revocable, high-entropy share links; the AI summary rule (short,
grounded only in what the student wrote, never invents achievements/grades, clearly
labeled as AI vs. teacher-authored, teacher edit required before it's official); the
teacher workflow (open a class → see requests/students → review); the student workflow
(see classes/teams by tab, submit for review); portfolio year narrative pulled from the
database, not hardcoded; the audit log; the phased, foundation-first build order; the
"Troy Pappas, Class of 2028" development student with real fake artifacts, no hardcoded
production data.

**Adapted to fit this stack:** "RLS" → authorization enforced in every query's `WHERE`
clause instead of Postgres policies (same guarantee, different mechanism, since SQLite
has no RLS). "Signed URLs for private storage" → not applicable, since there's no file
storage yet (see below). The AI "Full Picture" chronological narrative → the connections
map's generated narrative paragraph plays a similar role, though it's not literally
structured as "Year 1: ... Year 2: ...".

**Not built, and why:**
- **File uploads to object storage** (Supabase Storage / S3, signed URLs, video/PDF/audio
  players, thumbnails). Students paste a link instead. This is a genuinely separate
  subsystem, not a small add-on — it's the single biggest remaining gap.
- **Advisor and parent/guardian roles**, and per-artifact visibility tiers (private /
  family / school / shared_link). Only student/teacher/admin exist; sharing today is
  portfolio-level via a link, not per-person grants.
- **Admin search/filter UI** (by year/class/activity/artifact) and a **storage dashboard**
  — the admin pages are list/drill-down views, not a search interface; storage metrics
  don't apply without file storage.
- **Senior speeches, graduation comments, recommendation briefs, college-sharing
  categories** — Phase 5/6 features in the spec's own plan.
- **Google Workspace SSO** — PIN auth suits a small opt-in pilot; swapping in real SSO
  only touches `routes/auth.js` and the `users` table later.
- **TypeScript / Next.js / Tailwind / shadcn** — this is plain JS/Express/EJS by
  deliberate choice (see the "just build on what we have" decision in this project's
  history) — a real stack, just not the one in the original spec.
- **A full accessibility/security audit of every route** — key adversarial scenarios were
  spot-checked live (cross-teacher access, cross-class artifact submission), not
  exhaustively audited against every route/role combination.

## Deploying

Railway (SQLite + volume) and Fly.io are both reasonable hosts for this as-is. Vercel is
**not** a fit without a rewrite — its serverless functions have no persistent filesystem
and no shared in-memory sessions, which this app currently relies on for SQLite and
login state.

```bash
# Fly.io
brew install flyctl
fly auth login       # opens your browser
fly launch           # from inside this folder; say yes to a volume for /data
fly deploy
```

Either way, set `SESSION_SECRET`, `DATABASE_PATH` (pointed at the persistent
volume/mount), and optionally `ANTHROPIC_API_KEY` as environment variables, then run
`npm run seed` once against the deployed instance.

## Project structure

```
server.js              entry point, sessions, route mounting
db.js                   SQLite schema + connection
seed.js                 creates the realistic school dataset
lib/pin.js              PIN generation + hashing
lib/token.js            high-entropy share-link token generation
lib/auth.js             requireAuth / requireRole middleware
lib/audit.js            audit_logs writer
lib/summarize.js        AI artifact summary (Claude API) with a no-key fallback
lib/connections.js      AI connections-map generator (Claude API), no-key/low-data guards
routes/auth.js          /login, /logout
routes/student.js       tabbed dashboard, class requests, artifact submission, connections, sharing
routes/teacher.js       class-scoped review queue, enrollment approvals, roster
routes/admin.js         review queue, roster, classes, activities, enrollments, audit log
routes/public.js        /p/:token — read-only shared portfolio + connections map, no auth
views/                  EJS templates
public/style.css        warm paper/ink theme
public/graph.js         client-side force-directed layout + hover interactions for the connections map
```
