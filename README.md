# BalX — Islington Student Services Portal

A working prototype for "Automating Student Services": a parent self-service
portal, a staff portal, and an automated attendance risk engine, all backed
by one real Express + Postgres-ready backend. Runs entirely in **demo mode**
with realistic sample data — no database or SMS account needed to test it.

**Latest refinements (staff portal):**
- Quick Actions removed from the Overview page.
- Fee Log's search-by-name lookup removed; the leaderboard remains, and
  clicking a student now opens their real fee record in a proper modal
  instead (the modal existed in the design but wasn't wired up before).
- Recent Staff Activity now shows ~3 items at a time with the rest reachable
  by scrolling inside the card, rather than growing the whole page.
- Replying to a parent message now uses a real inline textarea in the
  message modal instead of the browser's native `prompt()` popup — the
  reply is verified to actually reach the parent's own portal, not just
  save silently.
- Student Alerts marked critical (red risk) now show a red icon *and* a red
  "Critical" text badge — previously only the icon color changed.

---

## 1. What's real vs. what's static

To keep this focused, only the features your team actually chose to build
are wired to live data. Everything else is clearly marked in the code as
static/illustrative.

**Fully real (backend-driven, tested):**
- One shared login gate (`index.html`) — pick "staff" or "parent", sign in
  with email + OTP, and you're automatically sent to the right portal based
  on your account's real role (not just which tile you clicked)
- Per-module attendance, derived from punch-in time vs. scheduled class time
  (mirrors the real Islington attendance report rules exactly), each
  subject shown with a colored Tutorial/Workshop/Lecture badge
- The automated risk engine (green/amber/red), alert creation, AND real
  parent notification — when attendance drops, the linked parent is
  actually emailed (not just a silent database row)
- A subject-by-subject breakdown showing present/late/absent counts, not
  just a single percentage
- Real fees & payments (due/overdue/paid), generated per student
- **Notifications** — every real notice for the selected child, or the
  exact text "No notifications available." if there are none
- **Urgent Messages banner** — always visible; shows a real unread urgent
  notice with a "View Notice" button, or "No urgent message" with no button
  at all when there isn't one. Viewing one persists server-side (won't
  reappear after reload)
- **Academic progress** — a real This-term/Last-term toggle. Since no
  grades exist in this system, none are invented: this splits each
  subject's actual attendance history into an older half and a newer half
- **Lecturers & advisors** — dynamic heading with the real selected
  child's name, an "Email" button (not "Message"), and a real formatted
  lecturer email built from their actual name — never the student's own
  address
- "Message Student Services" ticketing, both sides (parent creates, staff
  replies and manages status). Staff replies show up on the parent's ticket
  card. Once a request is resolved, a "Clear Request" button appears for
  both sides — enforced server-side, so neither side can hide a request
  that isn't actually resolved yet
- **Parent Messages** (staff portal) — the exact same real ticket data as
  Student Requests, shown inbox-style with the parent's real name; "No
  message yet." when genuinely empty; working Reply (saves server-side,
  auto-advances status) and Mark done buttons
- **Student Alerts** (staff portal) — sorted worst-attendance-first,
  capped at 10 with a working "See more" to reveal the rest
- Staff attendance-log lookup (search any student, see their full per-module
  grid, click a Late/Absent cell for the reason)
- Live staff dashboard numbers (open requests, resolved, total students,
  active alerts, etc.) computed straight from the database — never
  hardcoded or randomized
- Role-based data isolation (a parent can only ever see their own children —
  enforced server-side, not just hidden in the UI)

**Removed entirely** (were static/fake, and not part of the chosen scope):
Student Clearance card, Upcoming Meetings, Quick Actions (parent portal),
Today's Appointments, Recent Staff Activity (staff portal).

**Static / out of scope (kept as illustrative content, clearly commented in
the code as such):** the Performance section's weekly requests-handled
chart, staff directory extra-seat cards, notification settings toggles.

## 2. Page map

| URL | What it is |
|---|---|
| `/` (`index.html`) | Main login gate — pick your role, sign in with email + OTP |
| `/parent.html` | Parent portal (redirected here automatically after login) |
| `/staff.html` | Staff portal (redirected here automatically after login) |

Both portals check for a valid session on load and bounce back to `/` if
you're not signed in — there's no separate login form on those pages
anymore, sign-in only happens at the main gate.

---

## 3. Architecture

```
generate/derive          Node/Express backend             Frontend (static files,
attendance from    --->  (src/) — same server serves  --> served by the same
punch-in times           both the API and the HTML         Express app)
                                    |
                          demo mode: in-memory data
                          (src/demo/store.js)
                                    |
                          real mode: Postgres/Supabase
                          (schema.sql + src/config/db.js)
```

- **One server, one origin.** Express serves the frontend AND the API from
  the same port — no CORS to fight with.
- **Demo mode vs. real mode** is controlled entirely by whether
  `DATABASE_URL` is set in `.env`. Every data-access function lives in
  `src/repositories.js` and branches there — nothing else in the app needs
  to know which mode it's in.
- **The risk engine** (`src/services/riskEngine.js`) is the same logic
  validated in the Phase D automation sandbox: derive Present/Late/Absent
  from punch-in time, apply "two Lates = one Absent", assign a risk level,
  and only alert on a downward transition (with a 48h cooldown).

---

## 4. Step-by-step: testing this on a Mac

You need **Node.js installed** (version 18 or newer — it needs to have
`fetch` built in). If you're not sure, open Terminal and run `node -v`.
If that fails or shows a version below 18, install Node first from
[nodejs.org](https://nodejs.org) (the "LTS" button) or via Homebrew:
`brew install node`.

### Step 1 — Unzip and open Terminal here
Unzip the project, then in Finder right-click the folder → **New Terminal
at Folder** (or open Terminal and `cd` into the unzipped folder).

### Step 2 — Install dependencies
```bash
npm install
```
This only installs Express, Postgres driver, JWT, etc. — nothing needs a
real account yet.

### Step 3 — Start the server
```bash
npm start
```
You should see:
```
[server] Running in DEMO MODE — no DATABASE_URL set, using in-memory sample data.
[server] Demo login codes: request an OTP for any seeded phone number, the code is always 123456
[server] Listening on http://localhost:5000
```
That's it — no `.env` file needed for demo mode.

### Step 4 — Open the portal in your browser
- **Main login: http://localhost:5000/** — pick "I'm a parent or carer" or
  "I'm school staff", enter an email, click "Send code".
  - If SMTP isn't configured (no `.env`, or `.env` without SMTP filled in):
    the screen shows the code directly — demo mode, no real email needed.
  - If SMTP **is** configured (your `.env` already has it): a real email is
    sent and the screen does **not** show the code — check your inbox.
  You'll be sent to the right portal automatically after verifying.

### Step 5 — The real test accounts (these are the ONLY accounts that exist now)
| Email | Role | Linked student(s) |
|---|---|---|
| studentservice444@gmail.com | staff | — |
| workprakriti11@gmail.com | parent | Aarav Karki, Maya Karki |
| aashrasingh282@gmail.com | parent | Rohan Sharma, Nisha Sharma |
| jaybirmalla@gmail.com | parent | Sijan Thapa (our deliberately at-risk demo student) |
| swornim1029@gmail.com | parent | Kavi Gurung |
| garimadangol012@gmail.com | parent | Laxmi Gurung |

The old placeholder accounts (phone numbers, `@example.com` addresses) are
gone — these 6 real Gmail addresses are the entire user table now.

### Step 6 — Testing with REAL email OTPs (what you actually asked for)

Your `.env` already has real Supabase + Gmail credentials filled in, so as
soon as you run `npm start` with that `.env` in place, you're in **real
delivery mode** — no extra flag or setting to flip.

**To test staff login:**
1. Go to `http://localhost:5000/`, click "I'm school staff"
2. Enter `studentservice444@gmail.com`, click "Send code"
3. Check that Gmail inbox — a real email titled *"Your Islington Student
   Services verification code"* should arrive within a few seconds
4. Enter the 6-digit code from the email, click "Sign in"
5. You land on `/staff.html`, signed in as "Student Services"

**To test each parent login:** exactly the same steps, using one of the 5
parent emails above instead, from "I'm a parent or carer". Each one lands on
`/parent.html` showing their own linked child's real attendance —
`jaybirmalla@gmail.com` is the most interesting one to try, since Sijan
(their linked student) is deliberately set up to be at-risk in a couple of
modules, so you'll see amber/red badges and a populated "Attendance risk
check" card.

**Where the OTP arrives:** directly in that Gmail inbox, as a normal email
(sender name "Islington Student Services", sent from
`studentservice444@gmail.com` since that's the account in `SMTP_USER`). If
it's not in the inbox within ~10 seconds, check Spam/Promotions.

**How to tell from the Terminal whether it actually sent:** watch the
terminal running `npm start` — every attempt prints one of these:
```
[notify:EMAIL] Sent to jaybirmalla@gmail.com (messageId: <...>)     <- success
[notify:EMAIL] Failed to send to jaybirmalla@gmail.com: <reason>   <- failed, reason included
[notify:EMAIL-DEMO] to jaybirmalla@gmail.com | subject: body       <- SMTP not configured, would've shown on screen instead
```
If you see `[notify:EMAIL] Sent to ...`, the email genuinely left your
server — if it didn't arrive after that, it's a Gmail-side thing (check
Spam, or that the app password is still valid), not a bug in this code.

**A code that doesn't arrive:** click "Resend code" — the old code is
immediately invalidated the moment you request a new one (only the most
recent code for that email is ever valid), so always use the latest one
you received.

### Step 7 — Things to actually click on to see it working
- **Parent portal:** the attendance table, the fees table, the "Attendance
  risk check" card, and the "By subject" present/late/absent breakdown are
  all real data for whichever child is selected. If a parent has two
  children (like workprakriti11), a dropdown in the top bar switches
  between them. Submit a message under "Message Student Services" — it
  actually creates a ticket. Click "View Notice" on an urgent notice, then
  reload the page — it now says "No urgent message" and stays that way,
  because it's saved server-side. Try the Academic Progress toggle — "Last
  term" shows genuinely different numbers, computed from the older half of
  that subject's real attendance history. Check "Lecturers & advisors" —
  the heading uses the real child's name, and each card's "Email" button
  opens a real-looking lecturer address.
- **Staff portal:** type "Sijan" into the Attendance Log Lookup search box —
  he's our deliberately at-risk student, so you'll see a grid with several
  red/amber cells. Click one to see the reason. Check "Student Alerts" —
  sorted worst-attendance-first, with a "See more" button once there are
  more than 10. Try composing an urgent notice targeted at `STU005` (Sijan)
  — it looks up his real linked parent (jaybirmalla@gmail.com) and actually
  emails them; watch the terminal for `[notify:EMAIL] Sent to
  jaybirmalla@gmail.com` to confirm it went out for real. That same
  real-email path also fires automatically whenever the attendance sync
  flags a student's risk level getting worse — check the terminal right
  after server startup for a batch of `[notify:EMAIL...]` lines. In
  **Parent Messages**, click "Reply" on any real message — it actually
  saves and shows up on the parent's side. Mark a request "Resolved" in
  Student Requests — a clear (✓) icon appears next to it, greyed out and
  unclickable on anything still open.

### Step 8 (optional) — Run the automated test suite yourself
```bash
npm test
```
This starts its own server instance, exercises every API route (login,
attendance, tickets, notices, cross-family data isolation, the sync job),
and prints OK/FAIL for each check.

If you have Node 18+ (for real DOM-level tests of the actual HTML/JS):
```bash
npm start &                          # start the server in one terminal
node tests/test-login-gate.mjs       # tests the main login gate + redirects
node tests/test-frontend.mjs         # tests the parent portal
node tests/test-staff-frontend.mjs   # tests the staff portal
```
These three run against whatever `.env` is currently in place — if SMTP is
configured they'll still pass (they read the code from the API's
`demoCode` field when present, and just check the "sent to your email"
message otherwise).

There are also three tests that don't touch your real Gmail at all — they
spin up a throwaway local mail server to prove the send logic itself is
correct, which is how this whole fix was verified before being handed to
you:
```bash
node tests/test-email-delivery.mjs   # proves the Nodemailer integration works
node tests/test-real-otp-flow.mjs    # proves a real OTP email + login end-to-end
node tests/test-notice-email.mjs     # proves targeted notices reach the right parent
```

---

## 5. Using the REAL Supabase database (already configured, needs your verification)

A real `.env` file is already included with:
- Your Supabase connection string (`DATABASE_URL`)
- Your Gmail credentials for real email sending (`SMTP_*`)
- Your Twilio Account SID (SMS needs 2 more pieces — see below)

**Good news since the last handoff:** `npm start` now does everything by
itself the first time — applies `schema.sql`, AND generates realistic
attendance/clearance data (this used to be missing entirely; the tables
existed but stayed empty in real mode). It's also now safe to restart the
server any number of times — schema.sql used to error out and crash the
server on the second run ("relation already exists"); that's fixed, and was
verified by actually running it three times in a row against a real local
Postgres instance before this was handed to you.

**Important: I could not personally test the live Supabase connection or
real email sending against your actual Gmail/Supabase.** My environment can
only reach standard web ports (443), and both Postgres (port 6543) and SMTP
(port 587) are blocked here. I verified the exact same code against a local
Postgres 16 instance and a local fake mail server instead — that confirms
the logic itself is correct, but your Mac (with normal internet access) is
what proves it against your real accounts.

### First run
```bash
npm start
```
You should see:
```
[server] DATABASE_URL found — applying schema.sql to Postgres...
[db] schema.sql applied ✓
[server] attendance table is empty — generating realistic sample data (one-time)...
[server] Generated 392 attendance rows and ran the initial risk sync.
[server] Listening on http://localhost:5000
```
That's it — no separate `npm run seed` step is required anymore; `npm start`
does it automatically the first time only. (`npm run seed` still exists if
you ever want to re-apply things manually — it's just no longer mandatory.)

### Every run after that
Just `npm start` again. It'll print `"schema.sql applied ✓"` (skipping
anything that already exists) and skip attendance generation since the
table is no longer empty — no errors, no duplicate data.

**Re-seeding from scratch:** if you ever want a completely fresh dataset,
drop everything first in the Supabase SQL Editor:
```sql
DROP TABLE IF EXISTS tickets, notices, clearance_items, attendance_summary,
  attendance, student_modules, modules, parent_students, students, users CASCADE;
```
then run `npm start` again.

**If you already hit `null value in column "phone" ... violates not-null
constraint`:** that happened because a `users` table already existed in
your Supabase project from an earlier version of this project (back when
phone was required) — `CREATE TABLE IF NOT EXISTS` protects existing data
but can't update an old table's structure by itself. This is now fixed:
`schema.sql` automatically relaxes that old constraint the next time it
runs, and looks up parent-student links by email instead of assuming fixed
ID numbers — so this fixes itself on your very next `npm start`, no manual
SQL needed. Verified by intentionally reproducing your exact error against
a real local Postgres and confirming `npm start` heals it automatically.

### Verify real email sending works
Log in as `studentservice444@gmail.com` (staff) and compose a notice
targeted at `STU005` with "Mark as urgent" checked — it looks up Sijan's
real linked parent (jaybirmalla@gmail.com) and emails them. Check your
terminal for either:
- `[notify:EMAIL] Sent to jaybirmalla@gmail.com (messageId: ...)` — it worked
- `[notify:EMAIL] Failed to send to ...` — something's wrong with the Gmail
  app password or Google's security settings blocked it; the printed error
  says why

### Twilio (SMS) — credentials complete, one manual step left before real texts go out
Two parents have a real phone number set in the database, ready to receive
SMS:

| Parent | Phone |
|---|---|
| workprakriti11@gmail.com | +9779812382020 |
| garimadangol012@gmail.com | +9779768445687 |

Every other parent still has no phone number (SMS is skipped for them,
email still goes out normally).

**Messages are now batched per student, not per module.** If a student has
several modules drop into amber/red in the same sync, their parent gets
**one** combined text listing all of them (e.g. "4 modules need
attention: Web Application Development: RED (50%); Database Systems: RED
(37.5%); ..."), not one text per module. This was specifically requested
to conserve limited trial SMS credit, and applies to both the automated
sync and staff-composed notices.

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are all
filled in — real SMS sending is fully wired and active. **However, I tried
a real send while testing this and it failed with an HTTP 403.** This is
almost certainly because those two phone numbers haven't been added as
**Verified Caller IDs** in your Twilio trial account yet — trial accounts
can only text numbers you've explicitly verified there first (Console →
search "Verified Caller IDs" → Add a new Caller ID → verify each of the two
numbers above by SMS code). Once both are verified, texts should go
through with no further changes.

**Also fixed while testing this:** a real send failure used to crash the
entire server on startup (no error handling existed around the Twilio
call) — reproduced this deliberately, then fixed it so a failed
text/email is now logged clearly and the server keeps running normally.
Email sending also had no connection timeout, meaning a real network
problem could hang the whole sync indefinitely; it now fails after 15
seconds instead.

**Where this fires:** SMS is sent (or logged, until verification is
complete) from the exact same two places email already fires from — the
automated attendance-risk sync (whenever a linked student's risk level
gets worse) and a staff-composed urgent notice targeted at a specific
student.

## 6. Project structure

```
schema.sql              Database schema + seed data
.env.example             Copy to .env to go from demo mode to real Postgres/Twilio/email
src/
  index.js                Server entry point (serves frontend + mounts API)
  config/                 Environment config + Postgres connection
  middleware/auth.js       JWT verification + role-based access control
  services/
    otp.js                 OTP generation/verification (always random, one-time-use)
    riskEngine.js           The attendance automation logic (Phase D, embedded)
    notify.js               Real SMS/email sending (Twilio + Nodemailer)
    attendanceGenerator.js  Shared realistic sample-data generator (attendance,
                            clearance, AND fees — used by demo mode AND real-
                            Postgres seeding, so they always match)
    batchInsert.js           Efficient multi-row INSERT helper (avoids hundreds
                            of one-row-at-a-time database round trips)
  demo/store.js             In-memory seed data + automation, used when no DATABASE_URL
  repositories.js           The ONE place that switches between demo mode and real Postgres
  routes/                   auth / parent / staff API routes
  seed.js                   Applies schema.sql + seeds attendance data (npm run seed)
public/
  index.html                 Main login gate — role picker + email/OTP, redirects by role
  parent.html, js/app.js     Parent portal
  staff.html, js/staff.js    Staff portal
  css/styles.css             Shared design system (blue theme) — used by both portals
  css/staff-extra.css        Staff-only components (attendance grid, search bar, etc.)
test-api.sh                  Full API test suite (npm test)
tests/                        Real-DOM + real-email-delivery tests (need `npm install` first)
.env                          Real credentials (Supabase, Gmail, partial Twilio) — DO NOT COMMIT
.gitignore                    Keeps .env and node_modules out of version control
```
Ai tools used: Claude, chatgpt, opencode, github copilot
