// src/services/attendanceGenerator.js
// ----------
// The realistic sample attendance + clearance data, extracted into one
// shared place so BOTH demo mode (src/demo/store.js, in-memory) and real
// Postgres seeding (src/seed.js) generate the exact same data the exact
// same way — instead of maintaining two copies that could drift apart.
//
// Uses a SEEDED random number generator, so the "random" data is identical
// every time this runs — important so demos are reproducible.

import { deriveStatus } from "./riskEngine.js";

export const MODULES = [
  { module_id: "MOD1", name: "Web Application Development", class_type: "Tutorial/Workshop", instructor: "Dr. R. Marlow", scheduled_start: "08:00:00",
    sessions: [{ weekday: 1, classType: "Tutorial", scheduledStart: "08:00:00" }, { weekday: 3, classType: "Workshop", scheduledStart: "12:00:00" }] },
  { module_id: "MOD2", name: "Database Systems", class_type: "Tutorial/Workshop", instructor: "Dr. N. Alvarez", scheduled_start: "07:00:00",
    sessions: [{ weekday: 2, classType: "Tutorial", scheduledStart: "07:00:00" }, { weekday: 4, classType: "Workshop", scheduledStart: "09:00:00" }] },
  { module_id: "MOD3", name: "Professional Practice", class_type: "Lecture", instructor: "Ms. D. Cole", scheduled_start: "10:00:00",
    sessions: [{ weekday: 5, classType: "Lecture", scheduledStart: "10:00:00" }] },
  { module_id: "MOD4", name: "Studio Art", class_type: "Tutorial/Workshop", instructor: "Prof. S. Park", scheduled_start: "08:00:00",
    sessions: [{ weekday: 0, classType: "Tutorial", scheduledStart: "08:00:00" }, { weekday: 4, classType: "Workshop", scheduledStart: "14:00:00" }] },
];

// How reliably each student shows up at all (before punch-in timing matters)
// Attendance zones thresholds (see riskEngine.js): green >= 85% | amber >= 75% | red < 75%.
// The system runs on EXACTLY 5 students. Sijan (STU005) and Laxmi (STU007) are
// deliberately low so the low-attendance alert automation has real cases to fire on.
export const PRESENT_PROBABILITY = {
  STU001: 0.95, // Aarav Karki — high zone (green)
  STU004: 0.85, // Nisha Sharma — mid zone (amber)
  STU005: 0.65, // Sijan Thapa — LOWEST zone (red), deliberately at-risk
  STU006: 0.97, // Kavi Gurung — high zone (green)
  STU007: 0.45, // Laxmi Gurung — LOWEST zone (red), deliberately at-risk
};

const NUM_WEEKS = 8;

function seededRandom(seed) {
  let state = seed;
  return function () {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function addMinutes(timeStr, minsToAdd) {
  const [h, m] = timeStr.split(":").map(Number);
  let total = h * 60 + m + minsToAdd;
  total = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

function generatePunchIn(scheduledStart, showUpProbability, random) {
  if (random() > showUpProbability) return null;
  const roll = random();
  if (roll < 0.02) return addMinutes(scheduledStart, -Math.ceil(random() * 5));
  if (roll < 0.90) return addMinutes(scheduledStart, Math.floor(random() * 9));
  if (roll < 0.97) return addMinutes(scheduledStart, 10 + Math.floor(random() * 5));
  return addMinutes(scheduledStart, 15 + Math.floor(random() * 15));
}

function generateSessionDates(weekday, numWeeks) {
  const dates = [];
  const cur = new Date();
  cur.setDate(cur.getDate() - numWeeks * 7);
  while (dates.length < numWeeks) {
    if (cur.getDay() === weekday) dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Generates realistic fee records for a student: one paid installment,
 * one currently due, and one overdue — enough variety to show all three
 * states in the parent portal.
 */
function generateFees(student, random) {
  const today = new Date();
  const daysFromToday = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };

  const baseAmount = 200000 + Math.floor(random() * 300000); // NPR, varies per student

  return [
    { student_id: student.student_id, description: "Tuition Installment 1", amount: baseAmount, due_date: daysFromToday(-60), status: "paid", paid_at: new Date(today.getTime() - 55 * 86400000).toISOString() },
    { student_id: student.student_id, description: "Tuition Installment 2", amount: baseAmount, due_date: daysFromToday(10), status: "due", paid_at: null },
    { student_id: student.student_id, description: "Library Fine", amount: 500 + Math.floor(random() * 1500), due_date: daysFromToday(-15), status: "overdue", paid_at: null },
  ];
}

/**
 * Generates realistic attendance rows + clearance rows + fee rows for a
 * list of students. Returns plain objects matching the `attendance`,
 * `clearance_items`, and `fees` table columns — ready to insert into
 * Postgres, or to push into the demo in-memory arrays.
 */
export function generateAttendanceAndClearance(students, { seed = 42 } = {}) {
  const random = seededRandom(seed);
  const attendanceRows = [];
  const clearanceRows = [];
  const feeRows = [];
  let nextId = 1;

  for (const student of students) {
    const showUpProb = PRESENT_PROBABILITY[student.student_id] ?? 0.9;
    for (const mod of MODULES) {
      for (const session of mod.sessions) {
        for (const date of generateSessionDates(session.weekday, NUM_WEEKS)) {
          const punchInTime = generatePunchIn(session.scheduledStart, showUpProb, random);
          const status = deriveStatus(punchInTime, session.scheduledStart);
          attendanceRows.push({
            id: nextId++,
            student_id: student.student_id,
            module_id: mod.module_id,
            date: date.toISOString().split("T")[0],
            class_type: session.classType,
            punch_in_time: punchInTime,
            status,
          });
        }
      }
    }

    clearanceRows.push(
      { student_id: student.student_id, item: "Library account", status: "clear", detail: "No outstanding items" },
      { student_id: student.student_id, item: "Finance office", status: "pending", detail: "Balance review in progress" },
      { student_id: student.student_id, item: "Student records", status: "clear", detail: "Documents up to date" }
    );

    feeRows.push(...generateFees(student, random));
  }

  return { attendanceRows, clearanceRows, feeRows };
}
