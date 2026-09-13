// src/routes/parent.routes.js
import { Router } from "express";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import {
  getStudentsForParent,
  isParentOfStudent,
  getStudentById,
  getModuleSummaryForStudent,
  getAttendanceRowsForStudent,
  getClearanceForStudent,
  getFeesForStudent,
  getNoticesForStudent,
  markNoticeRead,
  createTicket,
  getTicketsForStudent,
  getTicketById,
  updateTicket,
  getAcademicProgress,
} from "../repositories.js";

const router = Router();
router.use(requireAuth, allowRoles("parent"));

/** Every route below checks this before touching a student's data — this
 *  is the whole "a parent can't see another family's data" guarantee. */
async function assertOwnsStudent(req, res, studentId) {
  const owns = await isParentOfStudent(req.user.id, studentId);
  if (!owns) {
    res.status(403).json({ success: false, message: "This student is not linked to your account.", code: "NOT_YOUR_CHILD" });
    return false;
  }
  return true;
}

router.get("/children", async (req, res) => {
  const children = await getStudentsForParent(req.user.id);
  res.json({ success: true, data: children });
});

router.get("/students/:studentId/overview", async (req, res) => {
  const { studentId } = req.params;
  if (!(await assertOwnsStudent(req, res, studentId))) return;

  const student = await getStudentById(studentId);
  const modules = await getModuleSummaryForStudent(studentId);
  const clearance = await getClearanceForStudent(studentId);
  const fees = await getFeesForStudent(studentId);
  const notices = await getNoticesForStudent(studentId, req.user.id);

  const order = { red: 0, amber: 1, green: 2, unknown: 3 };
  const worst = modules.reduce((worst, m) => (!worst || order[m.risk_level] < order[worst.risk_level] ? m : worst), null);

  res.json({
    success: true,
    data: {
      student,
      attendanceOverall: worst
        ? { pct: worst.attendance_percentage, riskLevel: worst.risk_level, worstModule: worst.moduleName }
        : { pct: null, riskLevel: "unknown", worstModule: null },
      modules,
      clearance,
      fees,
      notices,
    },
  });
});

router.get("/students/:studentId/attendance", async (req, res) => {
  const { studentId } = req.params;
  if (!(await assertOwnsStudent(req, res, studentId))) return;
  const rows = await getAttendanceRowsForStudent(studentId);
  res.json({ success: true, data: rows });
});

router.get("/students/:studentId/tickets", async (req, res) => {
  const { studentId } = req.params;
  if (!(await assertOwnsStudent(req, res, studentId))) return;
  const rows = await getTicketsForStudent(studentId);
  res.json({ success: true, data: rows });
});

router.get("/students/:studentId/fees", async (req, res) => {
  const { studentId } = req.params;
  if (!(await assertOwnsStudent(req, res, studentId))) return;
  const rows = await getFeesForStudent(studentId);
  res.json({ success: true, data: rows });
});

router.get("/students/:studentId/academic-progress", async (req, res) => {
  const { studentId } = req.params;
  if (!(await assertOwnsStudent(req, res, studentId))) return;
  const data = await getAcademicProgress(studentId);
  res.json({ success: true, data });
});

router.post("/students/:studentId/notices/:noticeId/read", async (req, res) => {
  const { studentId, noticeId } = req.params;
  if (!(await assertOwnsStudent(req, res, studentId))) return;
  await markNoticeRead(req.user.id, Number(noticeId));
  res.json({ success: true });
});

router.post("/tickets", async (req, res) => {
  const { studentId, category, message, priority } = req.body || {};
  if (!studentId || !category || !message) {
    return res.status(400).json({ success: false, message: "studentId, category, and message are required." });
  }
  if (!(await assertOwnsStudent(req, res, studentId))) return;

  const ticket = await createTicket({ studentId, createdBy: req.user.id, category, message, priority });
  res.status(201).json({ success: true, data: ticket });
});

// A parent can only CLEAR (hide) their own resolved requests — never
// change the status itself, and never clear one that isn't resolved yet.
router.patch("/tickets/:id/clear", async (req, res) => {
  const ticket = await getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ success: false, message: "Request not found." });
  if (!(await assertOwnsStudent(req, res, ticket.student_id))) return;

  const result = await updateTicket(req.params.id, { cleared: true });
  if (result?.error === "NOT_RESOLVED") {
    return res.status(400).json({ success: false, message: result.message });
  }
  res.json({ success: true, data: result });
});

export default router;
