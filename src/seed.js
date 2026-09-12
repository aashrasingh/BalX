// src/seed.js
// ----------
// Run with: npm run seed
// Only does anything once DATABASE_URL is set in .env. Does two things,
// both safe to run any number of times (nothing gets duplicated):
//   1. Applies schema.sql (tables + login/student/module seed rows)
//   2. Generates realistic attendance + clearance data (same generator
//      demo mode uses) and inserts it, then runs the risk-engine sync so
//      attendance_summary is populated too — otherwise the tables would
//      exist but every student would show up with zero attendance history.
//
// In demo mode there's nothing to seed; the in-memory data in
// src/demo/store.js is already there the moment the server starts.

import { isDemoMode } from "./config/index.js";
import { runMigrations, closePool, query } from "./config/db.js";
import { generateAttendanceAndClearance } from "./services/attendanceGenerator.js";
import { runAttendanceSync } from "./repositories.js";
import { batchInsert } from "./services/batchInsert.js";

// Bump this whenever the sample-data generator changes (new students, changed
// attendance probabilities, etc.) — the attendance tables are wiped and
// regenerated ONCE, then app_meta remembers the version so re-running seed
// never destroys existing production data.
const ATTENDANCE_SEED_VERSION = "5stu-2";

async function seedAttendanceAndClearanceIntoPostgres() {
  const { rows: students } = await query("SELECT student_id FROM students");
  if (students.length === 0) {
    console.log("[seed] No students found — skipping attendance/clearance generation.");
    return;
  }

  const { rows: metaRows } = await query(
    "SELECT value FROM app_meta WHERE key = 'attendance_seed_version'"
  );
  if (metaRows[0]?.value === ATTENDANCE_SEED_VERSION) {
    console.log(`[seed] attendance already seeded with version ${ATTENDANCE_SEED_VERSION} — skipping.`);
    return;
  }

  const { rows: existing } = await query("SELECT count(*) FROM attendance");
  if (Number(existing[0].count) > 0) {
    console.log(`[seed] clearing ${existing[0].count} stale attendance rows (seed version changed)...`);
    await query("DELETE FROM attendance");
    await query("DELETE FROM attendance_summary");
    await query("DELETE FROM clearance_items");
    await query("DELETE FROM fees");
  }

  console.log("[seed] Generating realistic attendance + clearance + fee data...");
  const { attendanceRows, clearanceRows, feeRows } = generateAttendanceAndClearance(students);

  await batchInsert(
    "attendance",
    ["student_id", "module_id", "date", "class_type", "punch_in_time", "status"],
    attendanceRows,
    "ON CONFLICT (student_id, module_id, date) DO NOTHING"
  );
  console.log(`[seed] Inserted ${attendanceRows.length} attendance rows.`);

  await batchInsert(
    "clearance_items",
    ["student_id", "item", "status", "detail"],
    clearanceRows,
    "ON CONFLICT (student_id, item) DO NOTHING"
  );
  console.log(`[seed] Inserted ${clearanceRows.length} clearance rows.`);

  await batchInsert(
    "fees",
    ["student_id", "description", "amount", "due_date", "status", "paid_at"],
    feeRows
  );
  console.log(`[seed] Inserted ${feeRows.length} fee rows.`);

  console.log("[seed] Running the attendance risk-engine sync (populates attendance_summary)...");
  const alerts = await runAttendanceSync(null);
  console.log(`[seed] Sync complete — ${alerts.length} initial alert(s) created for already-at-risk students.`);

  await query(
    `INSERT INTO app_meta (key, value) VALUES ('attendance_seed_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [ATTENDANCE_SEED_VERSION]
  );
}

async function main() {
  if (isDemoMode) {
    console.log("[seed] No DATABASE_URL set — nothing to do. Demo mode seeds itself in memory on server start.");
    return;
  }
  console.log("[seed] Applying schema.sql to the database at DATABASE_URL...");
  await runMigrations();
  console.log("[seed] Tables created and login/student/module seed data inserted.");

  await seedAttendanceAndClearanceIntoPostgres();
  console.log("[seed] Done.");
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
