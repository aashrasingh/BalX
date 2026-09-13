// src/demo/store.js
// ----------
// HOW IT WORKS (plain words):
//   When there's no DATABASE_URL, the whole app runs off these in-memory
//   JS arrays instead of Postgres. Every function here has the exact same
//   name and return shape as its real-database counterpart would, so the
//   route files never need to know which mode they're in — see
//   src/repositories.js, which is the ONLY place that branches on
//   isDemoMode.
//
//   The attendance data is generated with a SEEDED random number generator,
//   so you get the same "random" numbers every time the server restarts —
//   important so a demo doesn't look different every time you run it.

import { calculateModuleAttendance, getRiskLevel, shouldAlert } from "../services/riskEngine.js";
import { MODULES, generateAttendanceAndClearance } from "../services/attendanceGenerator.js";
import { sendUrgentNotice } from "../services/notify.js";

// ---------- static seed data (mirrors schema.sql) ----------
export const users = [
  { id: 1, phone: "+9779812382020", email: "workprakriti11@gmail.com", name: "Prakriti (Parent)", role: "parent" },
  { id: 2, phone: null, email: "aashrasingh282@gmail.com", name: "Aashra (Parent)", role: "parent" },
  { id: 3, phone: null, email: "jaybirmalla@gmail.com", name: "Jaybir (Parent)", role: "parent" },
  { id: 4, phone: null, email: "swornim1029@gmail.com", name: "Swornim (Parent)", role: "parent" },
  { id: 5, phone: "+9779768445687", email: "garimadangol012@gmail.com", name: "Garima (Parent)", role: "parent" },
  { id: 6, phone: null, email: "studentservice444@gmail.com", name: "Student Services", role: "ssd_staff" },
];

export const students = [
  { student_id: "STU001", name: "Aarav Karki", grade: "BSc (Hons) Computing with Artificial Intelligence", section: "L3AI1" },
  { student_id: "STU004", name: "Nisha Sharma", grade: "BA (Hons) Business Management", section: "L2BM1" },
  { student_id: "STU005", name: "Sijan Thapa", grade: "BSc (Hons) Computing with Artificial Intelligence", section: "L1AI1" },
  { student_id: "STU006", name: "Kavi Gurung", grade: "BSc (Hons) Computing with Artificial Intelligence", section: "L3AI2" },
  { student_id: "STU007", name: "Laxmi Gurung", grade: "BA (Hons) Business Management", section: "L2BM2" },
];

// IMPORTANT: exactly ONE unique parent email per student — no parent email is
// shared, so an attendance alert always goes to the correct parent and nobody
// else. Sijan (STU005) and Laxmi (STU007) both sit in the lowest (red) zone.
export const parentStudents = [
  { parent_id: 1, student_id: "STU001" }, // workprakriti11   -> Aarav
  { parent_id: 2, student_id: "STU004" }, // aashrasingh282   -> Nisha
  { parent_id: 3, student_id: "STU005" }, // jaybirmalla      -> Sijan (low attendance, demo at-risk)
  { parent_id: 4, student_id: "STU006" }, // swornim1029      -> Kavi
  { parent_id: 5, student_id: "STU007" }, // garimadangol012  -> Laxmi (low attendance, demo at-risk)
];

export const modules = MODULES;

export const studentModules = [];
for (const s of students) for (const m of modules) studentModules.push({ student_id: s.student_id, module_id: m.module_id });

let nextAttendanceId = 1;

export const attendance = [];
export const attendanceSummary = []; // populated by runAttendanceSync() below
export const notices = [];
export const noticeReads = []; // { notice_id, user_id, read_at }
export const tickets = [];
export const clearanceItems = [];
export const fees = [];
export const appointments = []; // starts genuinely empty — no seeded fake appointments

function seedAttendanceAndClearance() {
  const { attendanceRows, clearanceRows, feeRows } = generateAttendanceAndClearance(students);
  for (const row of attendanceRows) attendance.push({ ...row, id: nextAttendanceId++ });
  for (const row of clearanceRows) clearanceItems.push({ id: clearanceItems.length + 1, ...row });
  for (const row of feeRows) fees.push({ id: fees.length + 1, ...row });
}

function seedNotices() {
  notices.push({
    id: 1,
    student_id: null, // broadcast
    title: "Student Services office hours changed",
    body: "The office will close at 3:00 PM on Monday for staff training. Online support remains available.",
    category: "urgent",
    is_urgent: true,
    created_by: 6, // studentservice444@gmail.com (Student Services)
    created_at: new Date().toISOString(),
  });
}

// NOTE: tickets start genuinely empty — no seeded fake ticket. Every ticket
// that appears anywhere in either portal is one a parent actually submitted
// through "Message Student Services," nothing pre-populated.

/**
 * The actual automation step (same logic proven in Phase D): recompute
 * every student x module attendance percentage and risk level, and create
 * a notice (an "alert") wherever risk just got worse. Returns the list of
 * new alerts created, so callers (routes, startup) can report on it.
 */
export async function runAttendanceSync(createdBy = null) {
  const summaryByKey = new Map(attendanceSummary.map((s) => [`${s.student_id}::${s.module_id}`, s]));
  const newAlerts = [];

  for (const student of students) {
    const studentAlertsThisRun = []; // collect this student's alerts, so we send ONE combined message instead of one per module

    for (const mod of modules) {
      const rows = attendance.filter((a) => a.student_id === student.student_id && a.module_id === mod.module_id);
      if (rows.length === 0) continue;

      const { total, present, late, absent, percentage } = calculateModuleAttendance(rows);
      const riskLevel = getRiskLevel(percentage);
      const key = `${student.student_id}::${mod.module_id}`;
      const previous = summaryByKey.get(key);

      const willAlert = shouldAlert(riskLevel, previous);
      const nowIso = new Date().toISOString();

      const updated = {
        student_id: student.student_id,
        module_id: mod.module_id,
        total_classes: total,
        present_count: present,
        late_count: late,
        absent_count: absent,
        attendance_percentage: percentage,
        risk_level: riskLevel,
        last_synced_at: nowIso,
        last_alert_at: willAlert ? nowIso : previous?.last_alert_at ?? null,
      };
      summaryByKey.set(key, updated);

      if (willAlert) {
        const title = `Attendance alert: ${mod.name}`;
        const body = `${student.name}'s attendance in "${mod.name}" dropped to ${riskLevel.toUpperCase()} (${percentage}%). Please contact Student Services if you have any questions.`;
        const alertNotice = {
          id: notices.length + newAlerts.length + 1,
          student_id: student.student_id,
          title,
          body,
          category: "attendance_alert",
          is_urgent: riskLevel === "red",
          created_by: createdBy,
          created_at: nowIso,
        };
        notices.push(alertNotice);
        newAlerts.push({ ...updated, moduleName: mod.name, studentName: student.name });
        studentAlertsThisRun.push({ moduleName: mod.name, riskLevel, percentage });
      }
    }

    // One combined SMS/email per student per sync — never one message per
    // module. A parent with 4 modules all dropping at once gets a single
    // text listing all 4, not 4 separate texts (SMS credits are limited).
    if (studentAlertsThisRun.length > 0) {
      const contacts = getParentContactsForStudent(student.student_id);
      if (contacts.length > 0) {
        const title = studentAlertsThisRun.length === 1
          ? `Attendance alert: ${studentAlertsThisRun[0].moduleName}`
          : `Attendance alert: ${studentAlertsThisRun.length} modules need attention`;
        const lines = studentAlertsThisRun.map((a) => `${a.moduleName}: ${a.riskLevel.toUpperCase()} (${a.percentage}%)`).join("; ");
        const body = `${student.name}'s attendance needs attention — ${lines}. Please contact Student Services if you have any questions.`;
        for (const contact of contacts) {
          await sendUrgentNotice({ phone: contact.phone, email: contact.email, title, body });
        }
      }
    }
  }

  attendanceSummary.length = 0;
  attendanceSummary.push(...summaryByKey.values());
  return newAlerts;
}

// ---------- seed the raw data (cheap, no side effects) ----------
seedAttendanceAndClearance();
seedNotices();
// (tickets intentionally start empty — see note above)
// NOTE: the initial attendance-risk sync (which can send REAL emails to
// already-at-risk students) is deliberately NOT run here automatically.
// It's triggered explicitly from src/index.js, and ONLY when the app is
// actually running in demo mode — otherwise, simply importing this file
// (which repositories.js always does, even in real-Postgres mode) would
// silently send duplicate real emails every time the server starts,
// regardless of which mode is actually in use.

// ================================================================
// Repository-style read/write functions used by src/repositories.js
// ================================================================

export function findUserByPhone(phone) {
  return users.find((u) => u.phone === phone) || null;
}

export function findUserByEmail(email) {
  return users.find((u) => u.email && u.email.toLowerCase() === String(email).toLowerCase()) || null;
}

/** Accepts either a phone number or an email — whichever the login form sent. */
export function findUserByIdentifier(identifier) {
  return findUserByEmail(identifier) || findUserByPhone(identifier);
}

export function getStudentsForParent(parentId) {
  const ids = parentStudents.filter((ps) => ps.parent_id === parentId).map((ps) => ps.student_id);
  return students.filter((s) => ids.includes(s.student_id));
}

/** All parent contacts (email/phone) linked to a given student — used when
 *  sending a targeted urgent notice, so it goes to a real address. */
export function getParentContactsForStudent(studentId) {
  const parentIds = parentStudents.filter((ps) => ps.student_id === studentId).map((ps) => ps.parent_id);
  return users.filter((u) => parentIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone }));
}

export function isParentOfStudent(parentId, studentId) {
  return parentStudents.some((ps) => ps.parent_id === parentId && ps.student_id === studentId);
}

export function getStudentById(studentId) {
  return students.find((s) => s.student_id === studentId) || null;
}

export function searchStudentsByName(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return students.filter((s) => s.name.toLowerCase().includes(q));
}

export function getAllStudentsWithRisk() {
  return students.map((s) => {
    const rows = attendanceSummary.filter((a) => a.student_id === s.student_id);
    const worst = rows.reduce((worst, r) => {
      const order = { red: 0, amber: 1, green: 2, unknown: 3 };
      return !worst || order[r.risk_level] < order[worst.risk_level] ? r : worst;
    }, null);
    return { ...s, worstRiskLevel: worst?.risk_level ?? "unknown" };
  });
}

export function getModuleSummaryForStudent(studentId) {
  return attendanceSummary
    .filter((a) => a.student_id === studentId)
    .map((a) => ({ ...a, moduleName: modules.find((m) => m.module_id === a.module_id)?.name ?? a.module_id }));
}

export function getAttendanceRowsForStudent(studentId) {
  return attendance
    .filter((a) => a.student_id === studentId)
    .map((a) => ({ ...a, moduleName: modules.find((m) => m.module_id === a.module_id)?.name ?? a.module_id,
                   instructor: modules.find((m) => m.module_id === a.module_id)?.instructor ?? "" }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getClearanceForStudent(studentId) {
  return clearanceItems.filter((c) => c.student_id === studentId);
}

/**
 * "Academic progress" here means REAL attendance data, split into two time
 * halves per module — the older half is "last term," the newer half is
 * "this term." No grades exist in this system, so we never invent them;
 * this reuses the exact same present/late/absent math as the risk engine.
 */
export function getAcademicProgress(studentId) {
  const rowsByModule = new Map();
  for (const row of attendance) {
    if (row.student_id !== studentId) continue;
    if (!rowsByModule.has(row.module_id)) rowsByModule.set(row.module_id, []);
    rowsByModule.get(row.module_id).push(row);
  }

  const thisTerm = [];
  const lastTerm = [];
  for (const [moduleId, rows] of rowsByModule) {
    const sorted = rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const midpoint = Math.ceil(sorted.length / 2);
    const lastTermRows = sorted.slice(0, midpoint);
    const thisTermRows = sorted.slice(midpoint);
    const moduleName = modules.find((m) => m.module_id === moduleId)?.name ?? moduleId;

    if (lastTermRows.length) {
      const calc = calculateModuleAttendance(lastTermRows);
      lastTerm.push({ moduleId, moduleName, attendancePct: calc.percentage, riskLevel: getRiskLevel(calc.percentage) });
    }
    if (thisTermRows.length) {
      const calc = calculateModuleAttendance(thisTermRows);
      thisTerm.push({ moduleId, moduleName, attendancePct: calc.percentage, riskLevel: getRiskLevel(calc.percentage) });
    }
  }

  return { thisTerm, lastTerm };
}

export function getFeesForStudent(studentId) {
  return fees.filter((f) => f.student_id === studentId).sort((a, b) => (a.due_date < b.due_date ? 1 : -1));
}

/** `userId` is the logged-in parent viewing their notices — used to mark
 *  which ones they've already read (broadcast notices are shared, but
 *  "read" status is personal to each viewer). */
export function getNoticesForStudent(studentId, userId = null) {
  return notices
    .filter((n) => n.student_id === studentId || n.student_id === null)
    .map((n) => ({ ...n, isRead: userId ? noticeReads.some((r) => r.notice_id === n.id && r.user_id === userId) : false }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function markNoticeRead(userId, noticeId) {
  const already = noticeReads.some((r) => r.notice_id === noticeId && r.user_id === userId);
  if (!already) noticeReads.push({ notice_id: noticeId, user_id: userId, read_at: new Date().toISOString() });
  return { notice_id: noticeId, user_id: userId };
}

export function getFlaggedSummaries(riskLevels = ["amber", "red"]) {
  return attendanceSummary
    .filter((a) => riskLevels.includes(a.risk_level))
    .map((a) => ({
      ...a,
      studentName: students.find((s) => s.student_id === a.student_id)?.name ?? a.student_id,
      moduleName: modules.find((m) => m.module_id === a.module_id)?.name ?? a.module_id,
    }));
}

export function createTicket({ studentId, createdBy, category, message, priority }) {
  const ticket = {
    id: tickets.length ? Math.max(...tickets.map((t) => t.id)) + 1 : 1,
    student_id: studentId,
    created_by: createdBy,
    category,
    message,
    priority: priority || "standard",
    status: "open",
    assigned_to: null,
    cleared: false,
    staff_reply: null,
    staff_reply_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  tickets.push(ticket);
  return ticket;
}

// By default, cleared tickets are hidden — that's the whole point of
// clearing one. Pass includeCleared:true to see everything anyway.
export function getTicketsForStudent(studentId, { includeCleared = false } = {}) {
  return tickets
    .filter((t) => t.student_id === studentId)
    .filter((t) => includeCleared || !t.cleared)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function getTicketById(id) {
  return tickets.find((t) => t.id === Number(id)) || null;
}

export function getAllTickets({ status, priority, includeCleared = false } = {}) {
  return tickets
    .filter((t) => (status ? t.status === status : true))
    .filter((t) => (priority ? t.priority === priority : true))
    .filter((t) => includeCleared || !t.cleared)
    .map((t) => ({
      ...t,
      studentName: students.find((s) => s.student_id === t.student_id)?.name ?? t.student_id,
      parentName: users.find((u) => u.id === t.created_by)?.name ?? "Unknown parent",
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function updateTicket(id, { status, assignedTo, cleared, reply }) {
  const ticket = tickets.find((t) => t.id === Number(id));
  if (!ticket) return null;

  if (cleared !== undefined) {
    // The whole point of this guard: you can only clear a request once
    // it's actually resolved — never hide an open/in-progress one.
    if (cleared && ticket.status !== "resolved") {
      return { error: "NOT_RESOLVED", message: "This request can't be cleared until it's marked resolved." };
    }
    ticket.cleared = !!cleared;
  }
  if (status) ticket.status = status;
  if (assignedTo) ticket.assigned_to = assignedTo;
  if (reply) {
    ticket.staff_reply = reply;
    ticket.staff_reply_at = new Date().toISOString();
    // A reply is a meaningful response — move a fresh "open" request along
    // automatically, the same way a human clicking "In progress" would.
    if (ticket.status === "open") ticket.status = "in_progress";
  }
  ticket.updated_at = new Date().toISOString();
  return ticket;
}

export function createNotice({ studentId, title, body, category, isUrgent, createdBy }) {
  const notice = {
    id: notices.length ? Math.max(...notices.map((n) => n.id)) + 1 : 1,
    student_id: studentId || null,
    title,
    body,
    category: category || (isUrgent ? "urgent" : "general"),
    is_urgent: !!isUrgent,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  notices.push(notice);
  return notice;
}

/** Staff dashboard stats — same shape as the real-database version in
 *  src/repositories.js. Every number is computed from the in-memory arrays,
 *  never hardcoded. */
export function getStaffStats() {
  const totalStudents = students.length;
  const totalModules = modules.length;

  const activeTickets = tickets.filter((t) => !t.cleared);
  const totalTickets = activeTickets.length;
  const openTickets = activeTickets.filter((t) => t.status !== "resolved").length;
  const resolvedTickets = activeTickets.filter((t) => t.status === "resolved").length;
  const resolutionRate = totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : null;

  const todayStr = new Date().toISOString().split("T")[0];
  const resolvedToday = activeTickets.filter((t) => t.status === "resolved" && (t.updated_at || "").startsWith(todayStr)).length;

  const activeAlerts = attendanceSummary.filter((a) => a.risk_level === "amber" || a.risk_level === "red").length;
  const upcomingAppointments = appointments.filter((a) => a.status === "scheduled" && a.appt_date >= todayStr).length;

  const order = { red: 0, amber: 1, green: 2, unknown: 3 };
  const byRisk = { red: 0, amber: 0, green: 0, unknown: 0 };
  for (const s of students) {
    const rows = attendanceSummary.filter((a) => a.student_id === s.student_id);
    const worst = rows.reduce((w, r) => (!w || order[r.risk_level] < order[w.risk_level] ? r : w), null);
    byRisk[worst?.risk_level ?? "unknown"]++;
  }
  const studentsNotFlagged = byRisk.green + byRisk.unknown;
  const goodStandingRate = totalStudents > 0 ? Math.round((studentsNotFlagged / totalStudents) * 100) : null;

  const parentAccounts = users.filter((u) => u.role === "parent").length;
  const staffAccounts = users.filter((u) => u.role === "ssd_staff").length;

  return {
    totalStudents, totalModules, totalTickets, openTickets, resolvedTickets, resolvedToday,
    resolutionRate, goodStandingRate, activeAlerts, upcomingAppointments, byRisk, parentAccounts, staffAccounts,
  };
}

export function getAppointments() {
  return appointments
    .map((a) => ({ ...a, studentName: students.find((s) => s.student_id === a.student_id)?.name ?? a.student_id }))
    .sort((a, b) => (a.appt_date + (a.appt_time || "")).localeCompare(b.appt_date + (b.appt_time || "")));
}

export function createAppointment({ studentId, parentName, type, apptDate, apptTime, notes, createdBy }) {
  const appt = {
    id: appointments.length ? Math.max(...appointments.map((a) => a.id)) + 1 : 1,
    student_id: studentId || null,
    parent_name: parentName,
    type,
    appt_date: apptDate,
    appt_time: apptTime || null,
    notes: notes || null,
    status: "scheduled",
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  appointments.push(appt);
  return appt;
}

export function updateAppointment(id, { status, apptDate, apptTime, notes }) {
  const appt = appointments.find((a) => a.id === Number(id));
  if (!appt) return null;
  if (status) appt.status = status;
  if (apptDate) appt.appt_date = apptDate;
  if (apptTime !== undefined) appt.appt_time = apptTime;
  if (notes !== undefined) appt.notes = notes;
  return appt;
}

/** Every student's total unpaid balance, highest first — the fee leaderboard. */
export function getFeeLeaderboard() {
  return students.map((s) => {
    const studentFees = fees.filter((f) => f.student_id === s.student_id);
    const outstanding = studentFees.filter((f) => f.status !== "paid").reduce((sum, f) => sum + Number(f.amount), 0);
    const overdueCount = studentFees.filter((f) => f.status === "overdue").length;
    return { studentId: s.student_id, studentName: s.name, grade: s.grade, outstanding, overdueCount };
  }).sort((a, b) => b.outstanding - a.outstanding);
}

/** A real staff activity feed built from actual events: ticket replies/
 *  resolutions, notices created, and appointments booked. No fabricated
 *  entries — genuinely empty if nothing has happened yet. */
export function getStaffActivityFeed(limit = 10) {
  const events = [];
  for (const t of tickets) {
    const parentName = users.find((u) => u.id === t.created_by)?.name ?? "a parent";
    if (t.staff_reply && t.staff_reply_at) {
      events.push({ time: t.staff_reply_at, text: `Replied to a request from <b>${parentName}</b> about "${t.category}"` });
    }
    if (t.status === "resolved") {
      events.push({ time: t.updated_at, text: `Marked a "${t.category}" request as resolved` });
    }
  }
  for (const n of notices) {
    if (n.category === "attendance_alert") continue; // automated, not a staff action
    events.push({ time: n.created_at, text: `Posted a notice: "${n.title}"` });
  }
  for (const a of appointments) {
    events.push({ time: a.created_at, text: `Scheduled a ${a.type.toLowerCase()} appointment with ${a.parent_name}` });
  }
  return events.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, limit);
}
