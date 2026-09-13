-- =====================================================
-- BalX — Database Schema (PostgreSQL / Supabase)
-- Scope: LOGIN SYSTEM only (parents + SSD staff)
-- Run this whole file in the Supabase SQL Editor.
-- =====================================================
-- DESIGN RULES
--   - Every login account has an internal serial `id`.
--   - Email is the real login identifier and is UNIQUE (not the PK). Phone
--     is optional now — kept only for backward compatibility, not required.
--   - Role decides access:
--       parent     -> sees ONLY linked children (junction table)
--       ssd_staff  -> sees ALL students (no links, access from role)
--   - parent_students is the junction for the many-to-many link.

-- =====================================================
-- TABLE 1: users  (every person who can log in)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,          -- internal stable id (PK)
  phone      TEXT UNIQUE,                 -- optional now; email is the real login identifier
  email      TEXT UNIQUE NOT NULL,        -- login identifier — the main login portal uses this
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('parent', 'ssd_staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- SELF-HEALING: if this table already existed from an earlier version of
-- this project (back when phone was required), relax that constraint so
-- the new email-only seed data can insert cleanly. Safe to run any number
-- of times — a no-op once phone is already nullable.
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email') THEN
    ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
  END IF;
END $$;

-- =====================================================
-- TABLE 2: students  (the children)
-- =====================================================
CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,            -- e.g. 'STU001' (PK)
  name       TEXT NOT NULL,
  grade      TEXT,
  section    TEXT
);

-- =====================================================
-- TABLE 3: parent_students  (junction: parent <-> child)
-- =====================================================
CREATE TABLE IF NOT EXISTS parent_students (
  parent_id  INTEGER NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  student_id TEXT    NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)     -- composite PK = no duplicate links
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_parent_students_parent  ON parent_students (parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student ON parent_students (student_id);

-- =====================================================
-- SEED DATA
-- =====================================================
-- Real test accounts (real Gmail addresses) — OTPs are actually emailed to
-- these when SMTP is configured in .env. Two parents also have a real
-- phone number set, for real SMS delivery when Twilio is configured.
INSERT INTO users (email, name, role, phone) VALUES
  ('workprakriti11@gmail.com',    'Prakriti (Parent)', 'parent', '+9779812382020'),
  ('aashrasingh282@gmail.com',    'Aashra (Parent)',    'parent', NULL),
  ('jaybirmalla@gmail.com',       'Jaybir (Parent)',    'parent', NULL),
  ('swornim1029@gmail.com',       'Swornim (Parent)',   'parent', NULL),
  ('garimadangol012@gmail.com',  'Garima (Parent)',    'parent', '+9779768445687'),
  ('studentservice444@gmail.com', 'Student Services',   'ssd_staff', NULL)
ON CONFLICT (email) DO NOTHING;

-- Self-healing: if these two rows already existed from an earlier run
-- (before phone numbers were added), ON CONFLICT DO NOTHING above wouldn't
-- retroactively set them — so fix them explicitly, every time.
UPDATE users SET phone = '+9779812382020' WHERE email = 'workprakriti11@gmail.com';
UPDATE users SET phone = '+9779768445687' WHERE email = 'garimadangol012@gmail.com';

-- SELF-HEALING: this system uses EXACTLY 5 students for its parent-email /
-- attendance automation. Any extra students left over from an earlier
-- version must be removed (their attendance/notices/tickets rows cascade).
DELETE FROM parent_students;                              -- wipe old links first so
                                                          -- the cleanup below is exact
DELETE FROM students WHERE student_id IN ('STU002', 'STU003');

INSERT INTO students (student_id, name, grade, section) VALUES
  ('STU001', 'Aarav Karki',   'BSc (Hons) Computing with Artificial Intelligence', 'L3AI1'),
  ('STU004', 'Nisha Sharma',  'BA (Hons) Business Management', 'L2BM1'),
  ('STU005', 'Sijan Thapa',   'BSc (Hons) Computing with Artificial Intelligence', 'L1AI1'),
  ('STU006', 'Kavi Gurung',   'BSc (Hons) Computing with Artificial Intelligence', 'L3AI2'),
  ('STU007', 'Laxmi Gurung',  'BA (Hons) Business Management', 'L2BM2')
ON CONFLICT (student_id) DO NOTHING;

-- Self-healing: update anyone still showing the old "Grade 12"-style
-- school-grade values from an earlier version of this project — Islington
-- is a college, so students are described by degree program + group, not
-- a school grade.
UPDATE students SET grade = 'BSc (Hons) Computing with Artificial Intelligence', section = 'L3AI1' WHERE student_id = 'STU001';
UPDATE students SET grade = 'BA (Hons) Business Management',                     section = 'L2BM1' WHERE student_id = 'STU004';
UPDATE students SET grade = 'BSc (Hons) Computing with Artificial Intelligence', section = 'L1AI1' WHERE student_id = 'STU005';
UPDATE students SET grade = 'BSc (Hons) Computing with Artificial Intelligence', section = 'L3AI2' WHERE student_id = 'STU006';
UPDATE students SET grade = 'BA (Hons) Business Management',                     section = 'L2BM2' WHERE student_id = 'STU007';

-- Each of the 5 students is linked to EXACTLY ONE unique parent email:
--   Aarav -> workprakriti11@gmail.com   (Prakriti)
--   Nisha -> aashrasingh282@gmail.com   (Aashra)
--   Sijan -> jaybirmalla@gmail.com      (Jaybir)  — deliberately low attendance
--   Kavi  -> swornim1029@gmail.com      (Swornim)
--   Laxmi -> garimadangol012@gmail.com  (Garima)  — deliberately low attendance
-- No parent email is shared between students, so an attendance alert always
-- lands with the correct parent and nobody else. Looked up BY EMAIL (not
-- hardcoded IDs) so this works even if this table got extra rows before.
INSERT INTO parent_students (parent_id, student_id)
SELECT u.id, x.student_id FROM (VALUES
  ('workprakriti11@gmail.com',   'STU001'),
  ('aashrasingh282@gmail.com',   'STU004'),
  ('jaybirmalla@gmail.com',      'STU005'),
  ('swornim1029@gmail.com',      'STU006'),
  ('garimadangol012@gmail.com',  'STU007')
) AS x(email, student_id)
JOIN users u ON u.email = x.email
ON CONFLICT (parent_id, student_id) DO NOTHING;
-- (studentservice444@gmail.com is role ssd_staff — no student links needed)

-- NOTE: SSD staff (users 5 and 6) have NO junction rows on purpose.
--       Their access to ALL students comes from role = 'ssd_staff'.

-- =====================================================
-- USEFUL QUERIES
-- =====================================================
-- All children of the logged-in parent (parent_id = 1):
--   SELECT s.* FROM students s
--   JOIN parent_students ps ON ps.student_id = s.student_id
--   WHERE ps.parent_id = 1;

-- SSD staff sees everything (no join needed):
--   SELECT * FROM students;

-- =====================================================
-- EXPANSION: attendance automation, notices, tickets, clearance
-- =====================================================
-- DESIGN NOTE (why per-module, not one attendance number):
--   Islington's real attendance report tracks each MODULE separately, and
--   Present/Late/Absent is DERIVED from a punch-in timestamp compared to
--   the module's scheduled start time — not typed in by a teacher. These
--   tables mirror that, so the automation logic matches the real system:
--     - punch-in before the scheduled start           -> absent (early punch-in)
--     - punch-in 10-14 min after the scheduled start   -> late
--     - punch-in 15+ min after the scheduled start      -> absent (very-late)
--     - two "late" markings are summed up to one absent (applied when the
--       automation computes attendance_summary, not stored per-row)

-- TABLE 4: modules  (subjects a student attends)
CREATE TABLE IF NOT EXISTS modules (
  module_id      TEXT PRIMARY KEY,          -- e.g. 'MOD1'
  name           TEXT NOT NULL,
  class_type     TEXT,                      -- Tutorial / Workshop / Lecture (informational)
  instructor     TEXT,
  scheduled_start TIME NOT NULL             -- used by the risk engine to derive Present/Late/Absent
);

-- TABLE 5: student_modules  (enrollment junction)
CREATE TABLE IF NOT EXISTS student_modules (
  student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  module_id  TEXT NOT NULL REFERENCES modules(module_id)   ON DELETE CASCADE,
  PRIMARY KEY (student_id, module_id)
);

-- TABLE 6: attendance  (one row per student, per module, per class session)
CREATE TABLE IF NOT EXISTS attendance (
  id            SERIAL PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  module_id     TEXT NOT NULL REFERENCES modules(module_id)   ON DELETE CASCADE,
  date          DATE NOT NULL,
  class_type    TEXT,
  punch_in_time TIME,                        -- NULL = never punched in that session
  status        TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent')),
  UNIQUE (student_id, module_id, date)
);

-- TABLE 7: attendance_summary  (recalculated by the automation sync job,
--                                one row per student PER MODULE)
CREATE TABLE IF NOT EXISTS attendance_summary (
  student_id             TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  module_id              TEXT NOT NULL REFERENCES modules(module_id)   ON DELETE CASCADE,
  total_classes          INTEGER,
  present_count          INTEGER,
  late_count             INTEGER,
  absent_count           INTEGER,
  attendance_percentage  NUMERIC(5,2),
  risk_level             TEXT CHECK (risk_level IN ('green', 'amber', 'red')),
  last_synced_at         TIMESTAMPTZ DEFAULT NOW(),
  last_alert_at          TIMESTAMPTZ,        -- used to enforce a 48h alert cooldown
  PRIMARY KEY (student_id, module_id)
);

-- TABLE 8: notices  (both broadcast announcements AND targeted attendance alerts)
--   student_id NULL  -> broadcast to everyone (e.g. "office hours changed")
--   student_id SET   -> targeted at one student/parent (e.g. an attendance alert)
CREATE TABLE IF NOT EXISTS notices (
  id         SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(student_id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  category   TEXT DEFAULT 'general' CHECK (category IN ('general', 'attendance_alert', 'fee', 'urgent')),
  is_urgent  BOOLEAN DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 9: tickets  ("Message Student Services")
CREATE TABLE IF NOT EXISTS tickets (
  id          SERIAL PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  created_by  INTEGER REFERENCES users(id),   -- the parent who raised it
  category    TEXT NOT NULL,
  message     TEXT NOT NULL,
  priority    TEXT DEFAULT 'standard' CHECK (priority IN ('standard', 'urgent')),
  status      TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  assigned_to TEXT,
  cleared     BOOLEAN DEFAULT FALSE,          -- hidden from the active list once cleared
  staff_reply    TEXT,                        -- staff's written reply, shown to the parent
  staff_reply_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Self-healing: add columns if this table already existed from an earlier
-- version of the project, without them.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cleared BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS staff_reply TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS staff_reply_at TIMESTAMPTZ;

-- TABLE 11: notice_reads  (tracks which logged-in user has "read"/dismissed
--                          which notice — separate from the notice itself,
--                          since a broadcast notice has many possible readers)
CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  read_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (notice_id, user_id)
);

-- TABLE 12: fees  (Fees & Payments shown on the parent portal)
CREATE TABLE IF NOT EXISTS fees (
  id          SERIAL PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  description TEXT NOT NULL,                  -- e.g. 'Tuition Installment 2'
  amount      NUMERIC(10,2) NOT NULL,
  due_date    DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('due', 'overdue', 'paid')),
  paid_at     TIMESTAMPTZ
);

-- TABLE 13: appointments  (staff-scheduled meetings — real, starts empty)
CREATE TABLE IF NOT EXISTS appointments (
  id           SERIAL PRIMARY KEY,
  student_id   TEXT REFERENCES students(student_id) ON DELETE CASCADE,
  parent_name  TEXT NOT NULL,                    -- who's actually meeting (may not always match a linked parent)
  type         TEXT NOT NULL CHECK (type IN ('In-person', 'Video')),
  appt_date    DATE NOT NULL,
  appt_time    TIME,                             -- nullable: "time to be decided" is valid
  notes        TEXT,
  status       TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointments_student ON appointments (student_id);

-- TABLE 10: clearance_items  (exam/records clearance shown on the parent portal)
CREATE TABLE IF NOT EXISTS clearance_items (
  id         SERIAL PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  item       TEXT NOT NULL,                   -- 'Library account', 'Finance office', 'Student records'
  status     TEXT DEFAULT 'pending' CHECK (status IN ('clear', 'pending')),
  detail     TEXT,
  UNIQUE (student_id, item)
);

-- TABLE 13: app_meta  (tiny key/value store used by the seed so sample data
-- is only regenerated when the generator changes — never on every restart)
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_module ON attendance (student_id, module_id);
CREATE INDEX IF NOT EXISTS idx_notices_student            ON notices (student_id);
CREATE INDEX IF NOT EXISTS idx_tickets_student             ON tickets (student_id);
CREATE INDEX IF NOT EXISTS idx_notice_reads_user           ON notice_reads (user_id);
CREATE INDEX IF NOT EXISTS idx_fees_student                ON fees (student_id);

-- =====================================================
-- SEED: modules + enrollment (all 7 students take all 4 modules —
-- a simplification worth calling out in your solution documentation)
-- =====================================================
INSERT INTO modules (module_id, name, class_type, instructor, scheduled_start) VALUES
  ('MOD1', 'Web Application Development', 'Tutorial/Workshop', 'Dr. R. Marlow', '08:00:00'),
  ('MOD2', 'Database Systems',            'Tutorial/Workshop', 'Dr. N. Alvarez', '07:00:00'),
  ('MOD3', 'Professional Practice',       'Lecture',           'Ms. D. Cole',    '10:00:00'),
  ('MOD4', 'Studio Art',                  'Tutorial/Workshop', 'Prof. S. Park',  '08:00:00')
ON CONFLICT (module_id) DO NOTHING;

INSERT INTO student_modules (student_id, module_id)
SELECT s.student_id, m.module_id FROM students s CROSS JOIN modules m
ON CONFLICT (student_id, module_id) DO NOTHING;

-- Attendance rows, attendance_summary, clearance_items, AND fees are seeded
-- by the Node app at startup (src/demo/store.js) in demo mode, or
-- automatically by `npm start` / `npm run seed` against a real Supabase
-- database — see src/services/attendanceGenerator.js and src/seed.js. That
-- keeps the randomized-but-realistic generation logic in one place instead
-- of duplicating it in raw SQL.

-- =====================================================
-- USEFUL QUERIES
-- =====================================================
-- A student's per-module attendance:
--   SELECT * FROM attendance_summary WHERE student_id = 'STU001';
--
-- Everyone currently flagged amber/red (for the staff "alerts" panel):
--   SELECT * FROM attendance_summary WHERE risk_level IN ('amber','red');
--
-- All open tickets, most recent first:
--   SELECT * FROM tickets WHERE status != 'resolved' ORDER BY created_at DESC;