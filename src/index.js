// src/index.js — the actual server entry point
// ----------
// HOW IT WORKS (plain words):
//   1. Serves the frontend (public/) as plain static files:
//        /            -> index.html   (the main login gate — pick a role, sign in)
//        /parent.html -> parent portal
//        /staff.html  -> staff portal
//      This also means there's no CORS to fight with: everything is one
//      server, one origin.
//   2. Mounts the API under /api/* (auth, parent, staff).
//   3. In demo mode (no DATABASE_URL in .env) it needs nothing else — the
//      in-memory data in src/demo/store.js is already seeded and synced.
//   4. In real mode, it applies schema.sql to Postgres on startup.

import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isDemoMode } from "./config/index.js";
import { runMigrations } from "./config/db.js";
import { query } from "./config/db.js";
import { generateAttendanceAndClearance } from "./services/attendanceGenerator.js";
import { runAttendanceSync } from "./repositories.js";
import { batchInsert } from "./services/batchInsert.js";

import authRoutes from "./routes/auth.routes.js";
import parentRoutes from "./routes/parent.routes.js";
import staffRoutes from "./routes/staff.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json());

// ---------- API ----------
app.get("/api/health", (req, res) => {
  res.json({ success: true, mode: isDemoMode ? "demo" : "live", time: new Date().toISOString() });
});
app.use("/api/auth", authRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/staff", staffRoutes);

// ---------- Frontend (static files) ----------
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
// Any unrecognized non-API route falls back to the login gate (index.html),
// which auto-redirects anyone already signed in to their portal.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ---------- Error handler (last resort, keeps failures readable) ----------
app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ success: false, message: "Something went wrong on the server." });
});

// Bump this whenever the sample-data generator changes (new students, changed
// attendance probabilities, etc.) — the attendance tables are wiped and
// regenerated ONCE, then app_meta remembers the version so restarting the
// server never destroys data.
const ATTENDANCE_SEED_VERSION = "5stu-2";

async function seedAttendanceIfEmpty() {
  const { rows: students } = await query("SELECT student_id FROM students");
  if (students.length === 0) return; // nothing to seed

  // Already seeded with the CURRENT generator? Skip — don't wipe real data on
  // every restart. Only regenerate when the seed version is missing/stale.
  const { rows: metaRows } = await query(
    "SELECT value FROM app_meta WHERE key = 'attendance_seed_version'"
  );
  if (metaRows[0]?.value === ATTENDANCE_SEED_VERSION) return;

  console.log("[server] attendance seed version changed — regenerating sample data (one-time)...");

  const { rows: existing } = await query("SELECT count(*) FROM attendance");
  const existingCount = Number(existing[0].count);

  if (existingCount > 0) {
    console.log(`[server] clearing ${existingCount} stale attendance row(s) and related records...`);
    await query("DELETE FROM attendance");
    await query("DELETE FROM attendance_summary");
    await query("DELETE FROM clearance_items");
    await query("DELETE FROM fees");
  }

  const { attendanceRows, clearanceRows, feeRows } = generateAttendanceAndClearance(students);

  await batchInsert(
    "attendance",
    ["student_id", "module_id", "date", "class_type", "punch_in_time", "status"],
    attendanceRows,
    "ON CONFLICT (student_id, module_id, date) DO NOTHING"
  );
  await batchInsert(
    "clearance_items",
    ["student_id", "item", "status", "detail"],
    clearanceRows,
    "ON CONFLICT (student_id, item) DO NOTHING"
  );
  await batchInsert(
    "fees",
    ["student_id", "description", "amount", "due_date", "status", "paid_at"],
    feeRows
  );

  await runAttendanceSync(null);

  // Remember the version we seeded with, so the next start is a no-op.
  await query(
    `INSERT INTO app_meta (key, value) VALUES ('attendance_seed_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [ATTENDANCE_SEED_VERSION]
  );

  console.log(`[server] Generated ${attendanceRows.length} attendance rows and ran the initial risk sync.`);
}

async function start() {
  if (isDemoMode) {
    console.log("[server] Running in DEMO MODE — no DATABASE_URL set, using in-memory sample data.");
    // Run the initial risk sync explicitly, here, and only here — this is
    // what flags already-at-risk students and (if email is configured)
    // actually sends their parents an alert. It deliberately does NOT run
    // automatically just from importing src/demo/store.js, so that real
    // Postgres mode never accidentally triggers this in-memory path too.
    const initialAlerts = await runAttendanceSync(null);
    console.log(`[server] Initial sync complete — ${initialAlerts.length} student(s) already flagged amber/red.`);
  } else {
    console.log("[server] DATABASE_URL found — applying schema.sql to Postgres...");
    await runMigrations();
    await seedAttendanceIfEmpty();
  }

  app.listen(config.port, () => {
    console.log(`[server] Listening on http://localhost:${config.port}`);
    console.log(`[server] Login gate:    http://localhost:${config.port}/`);
    console.log(`[server] Parent portal: http://localhost:${config.port}/parent.html`);
    console.log(`[server] Staff portal:  http://localhost:${config.port}/staff.html`);
  });
}

start().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
