// src/repositories.js
// ----------
// Every route file calls FUNCTIONS FROM HERE, never the database directly.
// This file is the ONLY place that checks isDemoMode. That means:
//   - In demo mode, everything reads/writes the in-memory arrays in
//     src/demo/store.js (already seeded with realistic data).
//   - Once DATABASE_URL is set in .env, every function below automatically
//     switches to real SQL against Postgres — nothing else in the app changes.
//
// The real-SQL branches are written and ready, but (since this project has
// no live Supabase credentials yet) they've only been exercised in demo
// mode. Test them against a real database before relying on them in
// production — see README "Going from demo mode to a real database".

import { isDemoMode } from "./config/index.js";
import { query } from "./config/db.js";
import * as demo from "./demo/store.js";
import { calculateModuleAttendance, getRiskLevel, shouldAlert } from "./services/riskEngine.js";
import { sendUrgentNotice } from "./services/notify.js";

// ---------------- users / auth ----------------
export async function findUserByPhone(phone) {
  if (isDemoMode) return demo.findUserByPhone(phone);
  const { rows } = await query("SELECT * FROM users WHERE phone = $1", [phone]);
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  if (isDemoMode) return demo.findUserByEmail(email);
  const { rows } = await query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
  return rows[0] || null;
}

/** Accepts either a phone number or an email — whichever the login form sent. */
export async function findUserByIdentifier(identifier) {
  if (isDemoMode) return demo.findUserByIdentifier(identifier);
  const byEmail = await findUserByEmail(identifier);
  if (byEmail) return byEmail;
  return findUserByPhone(identifier);
}

// ---------------- students / parents ----------------
export async function getStudentsForParent(parentId) {
  if (isDemoMode) return demo.getStudentsForParent(parentId);
  const { rows } = await query(
    `SELECT s.* FROM students s
     JOIN parent_students ps ON ps.student_id = s.student_id
     WHERE ps.parent_id = $1`,
    [parentId]
  );
  return rows;
}

/** All parent contacts linked to a student — used so a targeted urgent
 *  notice can actually be emailed to a real address. */
export async function getParentContactsForStudent(studentId) {
  if (isDemoMode) return demo.getParentContactsForStudent(studentId);
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone FROM users u
     JOIN parent_students ps ON ps.parent_id = u.id
     WHERE ps.student_id = $1`,
    [studentId]
  );
  return rows;
}

export async function isParentOfStudent(parentId, studentId) {
  if (isDemoMode) return demo.isParentOfStudent(parentId, studentId);
  const { rows } = await query(
    "SELECT 1 FROM parent_students WHERE parent_id = $1 AND student_id = $2",
    [parentId, studentId]
  );
  return rows.length > 0;
}

export async function getStudentById(studentId) {
  if (isDemoMode) return demo.getStudentById(studentId);
  const { rows } = await query("SELECT * FROM students WHERE student_id = $1", [studentId]);
  return rows[0] || null;
}

export async function searchStudentsByName(nameQuery) {
  if (isDemoMode) return demo.searchStudentsByName(nameQuery);
  const { rows } = await query("SELECT * FROM students WHERE name ILIKE $1", [`%${nameQuery}%`]);
  return rows;
}

export async function getAllStudentsWithRisk() {
  if (isDemoMode) return demo.getAllStudentsWithRisk();
  const { rows } = await query(
    `SELECT s.*,
            COALESCE(MIN(
              CASE a.risk_level WHEN 'red' THEN 0 WHEN 'amber' THEN 1 WHEN 'green' THEN 2 ELSE 3 END
            ), 3) AS risk_rank
     FROM students s
     LEFT JOIN attendance_summary a ON a.student_id = s.student_id
     GROUP BY s.student_id`
  );
  const rankToLevel = { 0: "red", 1: "amber", 2: "green", 3: "unknown" };
  return rows.map((r) => ({ ...r, worstRiskLevel: rankToLevel[r.risk_rank] }));
}

// ---------------- attendance ----------------
export async function getModuleSummaryForStudent(studentId) {
  if (isDemoMode) return demo.getModuleSummaryForStudent(studentId);
  const { rows } = await query(
    `SELECT a.*, a.attendance_percentage::float AS attendance_percentage, m.name AS "moduleName"
     FROM attendance_summary a JOIN modules m ON m.module_id = a.module_id
     WHERE a.student_id = $1`,
    [studentId]
  );
  return rows;
}

export async function getAttendanceRowsForStudent(studentId) {
  if (isDemoMode) return demo.getAttendanceRowsForStudent(studentId);
  const { rows } = await query(
    `SELECT a.*, m.name AS "moduleName", m.instructor
     FROM attendance a JOIN modules m ON m.module_id = a.module_id
     WHERE a.student_id = $1
     ORDER BY a.date DESC`,
    [studentId]
  );
  return rows;
}

export async function getFlaggedSummaries(riskLevels = ["amber", "red"]) {
  if (isDemoMode) return demo.getFlaggedSummaries(riskLevels);
  const { rows } = await query(
    `SELECT a.*, a.attendance_percentage::float AS attendance_percentage,
            s.name AS "studentName", m.name AS "moduleName"
     FROM attendance_summary a
     JOIN students s ON s.student_id = a.student_id
     JOIN modules m ON m.module_id = a.module_id
     WHERE a.risk_level = ANY($1::text[])`,
    [riskLevels]
  );
  return rows;
}

/**
 * The automation sync: recompute every student x module attendance %,
 * update attendance_summary, and create a "notices" row (an alert) wherever
 * risk just got worse. Mirrors the Phase D sandbox logic exactly.
 */
export async function runAttendanceSync(createdBy = null) {
  if (isDemoMode) return demo.runAttendanceSync(createdBy);

  const { rows: studentModuleRows } = await query(
    `SELECT DISTINCT student_id, module_id FROM attendance`
  );
  // Group by student so we can batch each student's alerts into ONE
  // combined SMS/email instead of one message per module.
  const modulesByStudent = new Map();
  for (const { student_id, module_id } of studentModuleRows) {
    if (!modulesByStudent.has(student_id)) modulesByStudent.set(student_id, []);
    modulesByStudent.get(student_id).push(module_id);
  }

  const newAlerts = [];

  for (const [student_id, moduleIds] of modulesByStudent) {
    const studentAlertsThisRun = [];

    for (const module_id of moduleIds) {
      const { rows: attendanceRows } = await query(
        "SELECT status FROM attendance WHERE student_id = $1 AND module_id = $2",
        [student_id, module_id]
      );
      const { total, present, late, absent, percentage } = calculateModuleAttendance(attendanceRows);
      const riskLevel = getRiskLevel(percentage);

      const { rows: prevRows } = await query(
        "SELECT * FROM attendance_summary WHERE student_id = $1 AND module_id = $2",
        [student_id, module_id]
      );
      const previous = prevRows[0] || null;
      const willAlert = shouldAlert(riskLevel, previous);

      await query(
        `INSERT INTO attendance_summary
           (student_id, module_id, total_classes, present_count, late_count, absent_count,
            attendance_percentage, risk_level, last_synced_at, last_alert_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), CASE WHEN $9 THEN NOW() ELSE $10 END)
         ON CONFLICT (student_id, module_id) DO UPDATE SET
           total_classes = EXCLUDED.total_classes, present_count = EXCLUDED.present_count,
           late_count = EXCLUDED.late_count, absent_count = EXCLUDED.absent_count,
           attendance_percentage = EXCLUDED.attendance_percentage, risk_level = EXCLUDED.risk_level,
           last_synced_at = NOW(),
           last_alert_at = CASE WHEN $9 THEN NOW() ELSE attendance_summary.last_alert_at END`,
        [student_id, module_id, total, present, late, absent, percentage, riskLevel, willAlert, previous?.last_alert_at ?? null]
      );

      if (willAlert) {
        const { rows: studentRows } = await query("SELECT name FROM students WHERE student_id = $1", [student_id]);
        const { rows: moduleRows } = await query("SELECT name FROM modules WHERE module_id = $1", [module_id]);
        const studentName = studentRows[0]?.name ?? student_id;
        const moduleName = moduleRows[0]?.name ?? module_id;
        const title = `Attendance alert: ${moduleName}`;
        const body = `${studentName}'s attendance in "${moduleName}" dropped to ${riskLevel.toUpperCase()} (${percentage}%). Please contact Student Services if you have any questions.`;
        await query(
          `INSERT INTO notices (student_id, title, body, category, is_urgent, created_by)
           VALUES ($1,$2,$3,'attendance_alert',$4,$5)`,
          [student_id, title, body, riskLevel === "red", createdBy]
        );
        newAlerts.push({ student_id, module_id, moduleName, studentName, risk_level: riskLevel, attendance_percentage: percentage });
        studentAlertsThisRun.push({ moduleName, riskLevel, percentage, studentName });
      }
    }

    // One combined SMS/email per student per sync — never one message per
    // module. A parent with 4 modules all dropping at once gets a single
    // text listing all 4, not 4 separate texts (SMS credits are limited).
    if (studentAlertsThisRun.length > 0) {
      const contacts = await getParentContactsForStudent(student_id);
      if (contacts.length > 0) {
        const studentName = studentAlertsThisRun[0].studentName;
        const title = studentAlertsThisRun.length === 1
          ? `Attendance alert: ${studentAlertsThisRun[0].moduleName}`
          : `Attendance alert: ${studentAlertsThisRun.length} modules need attention`;
        const lines = studentAlertsThisRun.map((a) => `${a.moduleName}: ${a.riskLevel.toUpperCase()} (${a.percentage}%)`).join("; ");
        const body = `${studentName}'s attendance needs attention — ${lines}. Please contact Student Services if you have any questions.`;
        for (const contact of contacts) {
          await sendUrgentNotice({ phone: contact.phone, email: contact.email, title, body });
        }
      }
    }
  }
  return newAlerts;
}

// ---------------- clearance ----------------
export async function getClearanceForStudent(studentId) {
  if (isDemoMode) return demo.getClearanceForStudent(studentId);
  const { rows } = await query("SELECT * FROM clearance_items WHERE student_id = $1", [studentId]);
  return rows;
}

/**
 * "Academic progress" = REAL attendance data split into two time halves per
 * module (older half = "last term", newer half = "this term"). No grades
 * exist in this system, so none are invented here — same math as the risk
 * engine, just applied to two date ranges instead of the whole history.
 */
export async function getAcademicProgress(studentId) {
  if (isDemoMode) return demo.getAcademicProgress(studentId);

  const { rows } = await query(
    `SELECT a.module_id, a.status, a.date, m.name AS module_name
     FROM attendance a JOIN modules m ON m.module_id = a.module_id
     WHERE a.student_id = $1 ORDER BY a.date ASC`,
    [studentId]
  );

  const rowsByModule = new Map();
  for (const row of rows) {
    if (!rowsByModule.has(row.module_id)) rowsByModule.set(row.module_id, { name: row.module_name, rows: [] });
    rowsByModule.get(row.module_id).rows.push(row);
  }

  const thisTerm = [];
  const lastTerm = [];
  for (const [moduleId, { name, rows: moduleRows }] of rowsByModule) {
    const midpoint = Math.ceil(moduleRows.length / 2);
    const lastTermRows = moduleRows.slice(0, midpoint);
    const thisTermRows = moduleRows.slice(midpoint);

    if (lastTermRows.length) {
      const calc = calculateModuleAttendance(lastTermRows);
      lastTerm.push({ moduleId, moduleName: name, attendancePct: calc.percentage, riskLevel: getRiskLevel(calc.percentage) });
    }
    if (thisTermRows.length) {
      const calc = calculateModuleAttendance(thisTermRows);
      thisTerm.push({ moduleId, moduleName: name, attendancePct: calc.percentage, riskLevel: getRiskLevel(calc.percentage) });
    }
  }

  return { thisTerm, lastTerm };
}

// ---------------- staff dashboard statistics (real data only) ----------------
/** Live counts for the staff portal dashboard — every number is computed
 *  straight from the actual tables, never hardcoded or randomized. */
export async function getStaffStats() {
  if (isDemoMode) return demo.getStaffStats();
  const [students, summaries, tickets, users, modules, appts] = await Promise.all([
    query("SELECT student_id FROM students"),
    query("SELECT student_id, risk_level FROM attendance_summary"),
    query("SELECT status, cleared, updated_at FROM tickets"),
    query("SELECT role FROM users WHERE role IN ('parent','ssd_staff')"),
    query("SELECT module_id FROM modules"),
    query("SELECT status, appt_date FROM appointments"),
  ]);

  const totalStudents = students.rows.length;
  const totalModules = modules.rows.length;

  const allTickets = tickets.rows.filter((t) => !t.cleared);
  const totalTickets = allTickets.length;
  const openTickets = allTickets.filter((t) => t.status !== "resolved").length;
  const resolvedTickets = allTickets.filter((t) => t.status === "resolved").length;
  const resolutionRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : null;

  const todayStr = new Date().toISOString().split("T")[0];
  const resolvedToday = allTickets.filter((t) => t.status === "resolved" && t.updated_at && new Date(t.updated_at).toISOString().startsWith(todayStr)).length;

  const activeAlerts = summaries.rows.filter((r) => r.risk_level === "amber" || r.risk_level === "red").length;
  const upcomingAppointments = appts.rows.filter((a) => a.status === "scheduled" && a.appt_date >= todayStr).length;

  const order = { red: 0, amber: 1, green: 2, unknown: 3 };
  const worstMap = new Map();
  for (const r of summaries.rows) {
    const current = worstMap.get(r.student_id);
    if (!current || order[r.risk_level] < order[current]) worstMap.set(r.student_id, r.risk_level);
  }
  const byRisk = { red: 0, amber: 0, green: 0, unknown: 0 };
  for (const s of students.rows) byRisk[worstMap.get(s.student_id) ?? "unknown"]++;
  const studentsNotFlagged = byRisk.green + byRisk.unknown;
  const goodStandingRate = totalStudents > 0 ? Math.round((studentsNotFlagged / totalStudents) * 100) : null;

  const parentAccounts = users.rows.filter((u) => u.role === "parent").length;
  const staffAccounts = users.rows.filter((u) => u.role === "ssd_staff").length;

  return {
    totalStudents, totalModules, totalTickets, openTickets, resolvedTickets, resolvedToday,
    resolutionRate, goodStandingRate, activeAlerts, upcomingAppointments, byRisk, parentAccounts, staffAccounts,
  };
}

// ---------------- appointments (real, starts empty) ----------------
export async function getAppointments() {
  if (isDemoMode) return demo.getAppointments();
  const { rows } = await query(
    `SELECT a.*, s.name AS "studentName" FROM appointments a
     LEFT JOIN students s ON s.student_id = a.student_id
     ORDER BY a.appt_date, a.appt_time`
  );
  return rows;
}

export async function createAppointment({ studentId, parentName, type, apptDate, apptTime, notes, createdBy }) {
  if (isDemoMode) return demo.createAppointment({ studentId, parentName, type, apptDate, apptTime, notes, createdBy });
  const { rows } = await query(
    `INSERT INTO appointments (student_id, parent_name, type, appt_date, appt_time, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [studentId || null, parentName, type, apptDate, apptTime || null, notes || null, createdBy]
  );
  return rows[0];
}

export async function updateAppointment(id, { status, apptDate, apptTime, notes }) {
  if (isDemoMode) return demo.updateAppointment(id, { status, apptDate, apptTime, notes });
  const { rows } = await query(
    `UPDATE appointments SET
       status = COALESCE($2, status), appt_date = COALESCE($3, appt_date),
       appt_time = COALESCE($4, appt_time), notes = COALESCE($5, notes)
     WHERE id = $1 RETURNING *`,
    [id, status || null, apptDate || null, apptTime === undefined ? null : apptTime, notes === undefined ? null : notes]
  );
  return rows[0] || null;
}

// ---------------- fee leaderboard ----------------
export async function getFeeLeaderboard() {
  if (isDemoMode) return demo.getFeeLeaderboard();
  const { rows } = await query(
    `SELECT s.student_id AS "studentId", s.name AS "studentName", s.grade,
            COALESCE(SUM(f.amount) FILTER (WHERE f.status != 'paid'), 0)::float AS outstanding,
            COUNT(*) FILTER (WHERE f.status = 'overdue')::int AS "overdueCount"
     FROM students s LEFT JOIN fees f ON f.student_id = s.student_id
     GROUP BY s.student_id, s.name, s.grade
     ORDER BY outstanding DESC`
  );
  return rows;
}

// ---------------- staff activity feed (real events only) ----------------
export async function getStaffActivityFeed(limit = 10) {
  if (isDemoMode) return demo.getStaffActivityFeed(limit);
  const { rows } = await query(
    `(SELECT t.staff_reply_at AS time, 'Replied to a request from <b>' || COALESCE(u.name, 'a parent') || '</b> about "' || t.category || '"' AS text
       FROM tickets t LEFT JOIN users u ON u.id = t.created_by WHERE t.staff_reply IS NOT NULL)
     UNION ALL
     (SELECT t.updated_at AS time, 'Marked a "' || t.category || '" request as resolved' AS text
       FROM tickets t WHERE t.status = 'resolved')
     UNION ALL
     (SELECT created_at AS time, 'Posted a notice: "' || title || '"' AS text
       FROM notices WHERE category != 'attendance_alert')
     UNION ALL
     (SELECT created_at AS time, 'Scheduled a ' || lower(type) || ' appointment with ' || parent_name AS text
       FROM appointments)
     ORDER BY time DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

// ---------------- fees ----------------
export async function getFeesForStudent(studentId) {
  if (isDemoMode) return demo.getFeesForStudent(studentId);
  const { rows } = await query(
    "SELECT *, amount::float AS amount FROM fees WHERE student_id = $1 ORDER BY due_date DESC",
    [studentId]
  );
  return rows;
}

// ---------------- notices ----------------
/** `userId` is the logged-in parent viewing their notices — used to mark
 *  which ones they've already read. */
export async function getNoticesForStudent(studentId, userId = null) {
  if (isDemoMode) return demo.getNoticesForStudent(studentId, userId);
  const { rows } = await query(
    `SELECT n.*, (nr.notice_id IS NOT NULL) AS "isRead"
     FROM notices n
     LEFT JOIN notice_reads nr ON nr.notice_id = n.id AND nr.user_id = $2
     WHERE n.student_id = $1 OR n.student_id IS NULL
     ORDER BY n.created_at DESC`,
    [studentId, userId]
  );
  return rows;
}

export async function markNoticeRead(userId, noticeId) {
  if (isDemoMode) return demo.markNoticeRead(userId, noticeId);
  await query(
    `INSERT INTO notice_reads (notice_id, user_id) VALUES ($1,$2) ON CONFLICT (notice_id, user_id) DO NOTHING`,
    [noticeId, userId]
  );
  return { notice_id: noticeId, user_id: userId };
}

export async function createNotice({ studentId, title, body, category, isUrgent, createdBy }) {
  if (isDemoMode) return demo.createNotice({ studentId, title, body, category, isUrgent, createdBy });
  const { rows } = await query(
    `INSERT INTO notices (student_id, title, body, category, is_urgent, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [studentId || null, title, body, category || (isUrgent ? "urgent" : "general"), !!isUrgent, createdBy]
  );
  return rows[0];
}

// ---------------- tickets ----------------
export async function createTicket({ studentId, createdBy, category, message, priority }) {
  if (isDemoMode) return demo.createTicket({ studentId, createdBy, category, message, priority });
  const { rows } = await query(
    `INSERT INTO tickets (student_id, created_by, category, message, priority)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [studentId, createdBy, category, message, priority || "standard"]
  );
  return rows[0];
}

export async function getTicketsForStudent(studentId, { includeCleared = false } = {}) {
  if (isDemoMode) return demo.getTicketsForStudent(studentId, { includeCleared });
  const clearedClause = includeCleared ? "" : "AND cleared = FALSE";
  const { rows } = await query(
    `SELECT * FROM tickets WHERE student_id = $1 ${clearedClause} ORDER BY created_at DESC`,
    [studentId]
  );
  return rows;
}

export async function getTicketById(id) {
  if (isDemoMode) return demo.getTicketById(id);
  const { rows } = await query("SELECT * FROM tickets WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function getAllTickets({ status, priority, includeCleared = false } = {}) {
  if (isDemoMode) return demo.getAllTickets({ status, priority, includeCleared });
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`t.status = $${params.length}`); }
  if (priority) { params.push(priority); conditions.push(`t.priority = $${params.length}`); }
  if (!includeCleared) conditions.push("t.cleared = FALSE");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT t.*, s.name AS "studentName", u.name AS "parentName" FROM tickets t
     JOIN students s ON s.student_id = t.student_id
     LEFT JOIN users u ON u.id = t.created_by
     ${where} ORDER BY t.created_at DESC`,
    params
  );
  return rows;
}

export async function updateTicket(id, { status, assignedTo, cleared, reply }) {
  if (isDemoMode) return demo.updateTicket(id, { status, assignedTo, cleared, reply });

  const { rows: currentRows } = await query("SELECT * FROM tickets WHERE id = $1", [id]);
  const current = currentRows[0];
  if (!current) return null;

  if (cleared !== undefined && cleared && current.status !== "resolved") {
    return { error: "NOT_RESOLVED", message: "This request can't be cleared until it's marked resolved." };
  }

  // A reply is a meaningful response — move a fresh "open" request along
  // automatically, the same way a human clicking "In progress" would,
  // unless the caller is explicitly setting a different status too.
  const effectiveStatus = status || (reply && current.status === "open" ? "in_progress" : null);

  const { rows } = await query(
    `UPDATE tickets SET
       status = COALESCE($2, status),
       assigned_to = COALESCE($3, assigned_to),
       cleared = COALESCE($4, cleared),
       staff_reply = COALESCE($5, staff_reply),
       staff_reply_at = CASE WHEN $5 IS NOT NULL THEN NOW() ELSE staff_reply_at END,
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, effectiveStatus, assignedTo || null, cleared === undefined ? null : cleared, reply || null]
  );
  return rows[0] || null;
}
