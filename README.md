# Capture — Sonoma Academy student portfolio

*Grades tell you how a student performed. Capture shows you what they actually did.*

A working pilot build: students sign in with a PIN, submit "artifacts" tied to a real
class or team/club, get an AI-drafted summary, and their teacher reviews and approves it
before it becomes part of the student's permanent, year-by-year portfolio. Students
control sharing explicitly via revocable links — portfolios are private by default.

This is a real Node/Express app with a SQLite database — not a mock. It follows the
phased approach from the full product spec: this build is the **foundation + core
workflow** phases (auth, roles, classes/activities, artifact review, sharing, audit
logging), not the full production architecture described in that spec (see "Relationship
to the full spec" below for what's intentionally deferred and why).

## Run it locally

```bash
npm install
cp .env.example .env        # then open .env and set a real SESSION_SECRET
npm run seed                 # creates an admin, 2 teachers, and 3 students (incl. a dev student)
npm start
```

Open http://localhost:3000. Sign-in PINs are printed to the console and written to
`SEED_CREDENTIALS.md` (gitignored — local testing only).

If you don't set `ANTHROPIC_API_KEY` in `.env`, artifact summaries fall back to a simple
templated draft (clearly labeled `[Draft — no AI key configured]`) so the whole flow still
works without any API key.

## What's actually built

- **PIN-based sign-in** — 8-character random PIN, hashed at rest (never stored in
  plaintext), rate-limited login.
- **Three roles**: `student`, `teacher`, `admin`.
  - A student only ever sees their own portfolio — there is no route that accepts a
    client-supplied student id for a student session.
  - A teacher only sees classes where `classes.teacher_id` is their own id, enforced in
    every query's `WHERE` clause — not by hiding UI. Tried changing a class id in the URL
    to another teacher's class during testing; it correctly 404s instead of leaking data.
  - Admin has full access, and every admin/teacher approve, reject, class/activity
    creation, enrollment, and share-link action is written to an `audit_logs` table
    (visible at `/admin/audit`).
- **Real relational structure**: `classes`, `activities` (teams/clubs), `enrollments`,
  `activity_members` — a student picks from *their own* enrolled classes/activities when
  submitting an artifact, not free text.
- **Portfolio years** (`portfolio_years` table) — admin can set a title/description per
  student per year (e.g. "2026–2027 — Going Deeper"), matching the narrative-portfolio
  framing from the spec. Falls back to a plain year label if unset.
- **Artifact review workflow** — AI drafts a summary immediately on submission; the
  teacher (or admin) edits/approves it, and that edited version (`teacher_summary`)
  becomes the official portfolio text, kept separate from the original AI draft
  (`ai_summary`) so the two are never conflated.
- **Sharing** — a student can generate a high-entropy, revocable share link
  (`portfolio_permissions`, token via `crypto.randomBytes`, never derived from the
  student's id) with an optional expiration, viewable at `/p/:token` with no login. The
  public view only ever shows `status = 'approved'` artifacts. Every link creation, revoke,
  and view is audit-logged.
- Warm paper/ink editorial visual style: cream/moss/clay palette, Source Serif 4 +
  IBM Plex Sans, "Sonoma Academy / Capture" branding on login and the public portfolio.

## Relationship to the full spec

The full spec (Next.js + Supabase + Postgres RLS + S3-compatible storage + parent
accounts + AI "Full Picture" narrative + recommendation briefs + school SSO) is a
different, much larger production architecture — and its own phasing section says not to
build it all at once. This app deliberately stays on the simpler Express/SQLite
foundation already running and pulls forward the pieces of that spec that translate
directly onto it:

**Brought over:** real classes/activities/enrollments instead of free text, a
teacher role properly scoped by SQL `WHERE` clause (not client-trust), portfolio year
titles, revocable share links with expiration, and an audit log.

**Deliberately not attempted here** (would need different infrastructure, not just more
routes):
- **Row Level Security / Postgres** — SQLite has no RLS. Authorization here is enforced
  in every route handler's SQL instead (e.g. teacher queries always filter by
  `teacher_id = req.session.user.id`). Real RLS would need a move to Postgres.
- **File uploads / object storage** — students paste a link (Drive, GitHub, YouTube)
  rather than uploading video/PDF directly. Real signed-URL file storage is a genuinely
  separate subsystem (Supabase Storage or S3), not a small add-on.
- **Parent/guardian accounts, advisor role, per-artifact visibility tiers** — only
  student/teacher/admin exist today; sharing is portfolio-level via a link, not
  per-person grants.
- **AI "Full Picture" narrative, recommendation briefs, senior speeches/graduation
  comments** — these are Year-2/Phase-5 features in the spec's own plan.
- **Google Workspace SSO** — PIN auth is appropriate for a small opt-in pilot; swapping in
  real SSO later only touches `routes/auth.js` and the `users` table.

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
`npm run seed` once against the deployed instance (or add people by hand via the admin
"Add a person" form).

## Project structure

```
server.js              entry point, sessions, route mounting
db.js                   SQLite schema + connection
seed.js                 creates admin/teachers/students + sample artifacts
lib/pin.js              PIN generation + hashing
lib/token.js            high-entropy share-link token generation
lib/auth.js             requireAuth / requireRole middleware
lib/audit.js            audit_logs writer
lib/summarize.js        AI summary (Claude API) with a no-key fallback
routes/auth.js          /login, /logout
routes/student.js       dashboard, artifact submission, share-link create/revoke
routes/teacher.js       class-scoped review queue + roster
routes/admin.js         review queue, roster, classes, activities, audit log
routes/public.js        /p/:token — read-only shared portfolio, no auth
views/                  EJS templates
public/style.css        warm paper/ink theme
```
