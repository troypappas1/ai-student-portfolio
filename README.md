# Ledger

A working first draft of the AI-curated student artifact portfolio pilot: students sign in
with a PIN, submit "artifacts" (a project + description + optional link), get an AI-drafted
summary, and an admin/teacher reviews and approves it before it appears on the student's
portfolio. Admin can see every student and every artifact.

This is a real Node/Express app with a SQLite database — not a mock. It's meant to be the
Year 1 pilot build described in the project doc, not the final production system (see
"Known limitations & next steps" below for what a real school rollout would still need).

## Run it locally

```bash
npm install
cp .env.example .env        # then open .env and set a real SESSION_SECRET
npm run seed                 # creates an admin + 5 mock students with sample artifacts
npm start
```

Open http://localhost:3000. Sign-in PINs for the seeded accounts are printed to the
console and written to `SEED_CREDENTIALS.md` (gitignored — local testing only, delete it
before sharing your screen).

Sign in as the admin PIN to see the review queue and full roster. Sign in as any student
PIN to see that student's own portfolio and submit a new artifact.

If you don't set `ANTHROPIC_API_KEY` in `.env`, artifact summaries fall back to a simple
templated draft (clearly labeled `[Draft — no AI key configured]`) so the whole flow still
works without any API key. Set the key to get real AI-drafted summaries from Claude.

## What's actually built

- PIN-based sign-in (8-character random PIN, hashed at rest, rate-limited login).
- Two roles: `student` and `admin`. Admin sees everything; a student sees only their own
  portfolio.
- Students submit artifacts (title, class/team, year, optional project link, free-text
  description) and get an AI-drafted summary immediately.
- Admin review queue: edit the AI summary, then approve or reject. Only approved artifacts
  show as final on a student's portfolio; students can still see their own pending ones.
- Admin can add new students, which generates a new PIN shown once (write it down — it's
  hashed immediately after, per how the doc's privacy/security section wanted this treated).
- Admin roster view + drill-in to any individual student's full portfolio.
- Warm paper/ink visual style per the original mock (`portfolio-mock.html` in the doc):
  cream/moss/clay palette, Source Serif 4 + IBM Plex Sans.

## Deploying to Railway

I can't do this last step for you — it needs your Railway account logged in via the CLI —
but everything here is set up to make it a few commands:

```bash
npm install -g @railway/cli   # if you don't have it
railway login
railway init                  # from inside this folder
railway up
```

Then in the Railway dashboard for the new service:

1. **Add a volume** (Settings → Volumes) mounted at `/data`. Without this, the SQLite file
   is wiped on every redeploy.
2. **Set environment variables** (Settings → Variables):
   - `SESSION_SECRET` — a long random string.
   - `DATABASE_PATH` — `/data/ledger.db` (matches the volume mount).
   - `ANTHROPIC_API_KEY` — optional, for real AI summaries instead of the fallback.
3. Railway sets `PORT` automatically; the app already reads `process.env.PORT`.
4. Run the seed script once against the deployed DB (`railway run npm run seed`) to create
   your first admin + test students, or add real students by hand through the admin "Add a
   student" form once you're signed in.

## Known limitations & next steps

This is intentionally scoped as a Year 1 pilot tool, per the project doc's own framing —
not something to hand real student PII to at scale yet:

- **Auth is PIN-only.** Fine for a small opt-in pilot; the doc's real-backend plan calls for
  Google Workspace SSO before this touches real FERPA-covered student records. Swapping in
  Supabase/Firebase/Auth0 auth later is a contained change (it only touches `routes/auth.js`
  and the `users` table).
- **Only two roles exist (`student`, `admin`).** The doc also describes a `teacher` role
  scoped to just their own roster. Adding it is straightforward: add a `teacher_id` column
  linking students to a teacher, and filter the admin queries by it for teacher-role users.
- **Sessions use Express's in-memory store**, so restarting the server logs everyone out.
  Fine for a pilot; swap for a persistent session store (e.g. `connect-sqlite3`) if that
  becomes annoying.
- **File uploads aren't implemented.** Students can paste a link (Google Drive, GitHub,
  YouTube, etc.) to their actual artifact rather than uploading video/PDF directly. Real
  file storage (Supabase Storage or S3) is the next piece to add per the doc's backend plan.
- **No bias/fairness auditing, blind comparison study, or longitudinal tracking yet** — those
  are Year 2 research angles from the doc, not things the software itself does.
- **The Raspberry Pi capture station** from the doc's "study angles" isn't built — this repo
  is the software side only.

## Project structure

```
server.js            entry point, sessions, route mounting
db.js                 SQLite schema + connection
seed.js               creates mock admin/students + sample artifacts
lib/pin.js            PIN generation + hashing
lib/auth.js           requireAuth / requireRole middleware
lib/summarize.js      AI summary (Claude API) with a no-key fallback
routes/auth.js         /login, /logout
routes/student.js      student dashboard + artifact submission
routes/admin.js         review queue, roster, student drill-in, add-student
views/                 EJS templates
public/style.css       warm paper/ink theme
```
