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
  { id: 1, phone: null, email: "workprakriti11@gmail.com", name: "Prakriti (Parent)", role: "parent" },
  { id: 2, phone: null, email: "aashrasingh282@gmail.com", name: "Aashra (Parent)", role: "parent" },
  { id: 3, phone: null, email: "jaybirmalla@gmail.com", name: "Jaybir (Parent)", role: "parent" },
  { id: 4, phone: null, email: "swornim1029@gmail.com", name: "Swornim (Parent)", role: "parent" },
  { id: 5, phone: null, email: "garimadangol012@gmail.com", name: "Garima (Parent)", role: "parent" },
  { id: 6, phone: null, email: "studentservice444@gmail.com", name: "Student Services", role: "ssd_staff" },
];

export const students = [
  { student_id: "STU001", name: "Aarav Karki", grade: "Grade 12", section: "A" },
  { student_id: "STU002", name: "Maya Karki", grade: "Grade 11", section: "B" },
  { student_id: "STU003", name: "Rohan Sharma", grade: "Grade 12", section: "C" },
  { student_id: "STU004", name: "Nisha Sharma", grade: "Grade 11", section: "A" },
  { student_id: "STU005", name: "Sijan Thapa", grade: "Grade 10", section: "A" },
  { student_id: "STU006", name: "Kavi Gurung", grade: "Grade 12", section: "B" },
  { student_id: "STU007", name: "Laxmi Gurung", grade: "Grade 11", section: "C" },
];

export const parentStudents = [
  { parent_id: 1, student_id: "STU001" }, // workprakriti11 -> Aarav
  { parent_id: 1, student_id: "STU002" }, // workprakriti11 -> Maya
  { parent_id: 2, student_id: "STU003" }, // aashrasingh282 -> Rohan
  { parent_id: 2, student_id: "STU004" }, // aashrasingh282 -> Nisha
  { parent_id: 3, student_id: "STU005" }, // jaybirmalla -> Sijan (our at-risk demo student)
  { parent_id: 4, student_id: "STU006" }, // swornim1029 -> Kavi
  { parent_id: 5, student_id: "STU007" }, // garimadangol012 -> Laxmi
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

function seedTickets() {
  tickets.push({
    id: 1,
    student_id: "STU001",
    created_by: 1,
    category: "Attendance concern",
    message: "Can someone confirm whether Aarav's Professional Practice absence was excused?",
    priority: "standard",
    status: "in_progress",
    assigned_to: "D. Cole",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}

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

        // Actually notify the real linked parent(s) — this is the fix for
        // "attendance goes red but the parent is never told."
        const contacts = getParentContactsForStudent(student.student_id);
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
seedTickets();
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
    .map((t) => ({ ...t, studentName: students.find((s) => s.student_id === t.student_id)?.name ?? t.student_id }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function updateTicket(id, { status, assignedTo, cleared }) {
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
