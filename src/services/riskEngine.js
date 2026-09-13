// src/services/riskEngine.js
// ----------
// This is the same logic validated in the Phase D automation sandbox,
// now embedded directly in the backend. It mirrors Islington's real
// attendance report rules:
//   - punch in BEFORE the scheduled start           -> absent (early punch-in)
//   - punch in 10-14 min after the scheduled start    -> late
//   - punch in 15+ min after the scheduled start       -> absent (very-late)
//   - two "late" markings are summed up to one "absent" when computing %

const COOLDOWN_HOURS = 48; // don't re-alert the same student+module too often
const LEVEL_ORDER = { green: 0, amber: 1, red: 2 };

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

/** Turns one raw punch-in time into 'present' | 'late' | 'absent'. */
export function deriveStatus(punchInTime, scheduledStart, classDurationMinutes = 60) {
  if (!punchInTime) return "absent"; // never punched in

  const punchMin = timeToMinutes(punchInTime);
  const startMin = timeToMinutes(scheduledStart);
  const endMin = startMin + classDurationMinutes;

  if (punchMin < startMin) return "absent"; // early punch-in
  if (punchMin > endMin) return "absent"; // punched in long after class ended

  const minutesLate = punchMin - startMin;
  if (minutesLate >= 15) return "absent"; // very-late, treated as absent
  if (minutesLate >= 10) return "late";
  return "present";
}

/**
 * Takes ALL attendance rows for one student in one module and works out
 * their attendance percentage, applying the "two Late = one Absent" rule.
 * @param {{status:string}[]} rows
 */
export function calculateModuleAttendance(rows) {
  let present = 0, late = 0, absent = 0;
  for (const r of rows) {
    if (r.status === "present") present++;
    else if (r.status === "late") late++;
    else absent++;
  }
  const lateAsAbsent = Math.floor(late / 2);
  const effectiveAbsent = absent + lateAsAbsent;
  const total = rows.length;
  const percentage = total > 0
    ? Math.round(((total - effectiveAbsent) / total) * 1000) / 10
    : null;
  return { total, present, late, absent, percentage };
}

/** Turns a percentage into a simple traffic-light level. */
export function getRiskLevel(percentage) {
  if (percentage === null || percentage === undefined) return "unknown";
  if (percentage >= 85) return "green";
  if (percentage >= 75) return "amber";
  return "red";
}

/**
 * Decides whether a NEW alert should fire, given the previous summary row.
 * Mirrors Phase D exactly: alert only on a downward transition, respecting
 * a cooldown so the same student+module isn't re-alerted every sync.
 */
export function shouldAlert(newRiskLevel, previousSummary) {
  if (newRiskLevel === "green") return false;
  const previousLevel = previousSummary ? previousSummary.risk_level : null;

  const gotWorse = previousLevel === null
    ? newRiskLevel === "amber" || newRiskLevel === "red"
    : LEVEL_ORDER[newRiskLevel] > LEVEL_ORDER[previousLevel];

  if (!gotWorse) return false;

  const lastAlertAt = previousSummary?.last_alert_at;
  if (!lastAlertAt) return true;
  const hoursSince = (Date.now() - new Date(lastAlertAt).getTime()) / 36e5;
  return hoursSince >= COOLDOWN_HOURS;
}
