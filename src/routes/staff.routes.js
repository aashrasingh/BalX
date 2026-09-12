// src/routes/staff.routes.js
import { Router } from "express";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { sendUrgentNotice } from "../services/notify.js";
import {
  getAllStudentsWithRisk,
  searchStudentsByName,
  getStudentById,
  getAttendanceRowsForStudent,
  getModuleSummaryForStudent,
  getFlaggedSummaries,
  getAllTickets,
  updateTicket,
  createNotice,
  runAttendanceSync,
  getParentContactsForStudent,
} from "../repositories.js";

const router = Router();
router.use(requireAuth, allowRoles("ssd_staff"));

router.get("/students", async (req, res) => {
  const rows = await getAllStudentsWithRisk();
  res.json({ success: true, data: rows });
});

router.get("/students/search", async (req, res) => {
  const q = req.query.name || "";
  const rows = await searchStudentsByName(String(q));
  res.json({ success: true, data: rows });
});

router.get("/students/:studentId/attendance", async (req, res) => {
  const { studentId } = req.params;
  const student = await getStudentById(studentId);
  if (!student) return res.status(404).json({ success: false, message: "Student not found." });
  const rows = await getAttendanceRowsForStudent(studentId);
  res.json({ success: true, data: { student, attendance: rows } });
});

router.get("/students/:studentId/summary", async (req, res) => {
  const { studentId } = req.params;
  const rows = await getModuleSummaryForStudent(studentId);
  res.json({ success: true, data: rows });
});

router.get("/attendance-summary", async (req, res) => {
  const riskParam = req.query.risk; // e.g. "amber,red"
  const riskLevels = riskParam ? String(riskParam).split(",") : ["amber", "red"];
  const rows = await getFlaggedSummaries(riskLevels);
  res.json({ success: true, data: rows });
});

// The manual trigger for the automation — same logic that runs at startup,
// callable on demand so staff (or a cron job later) can force a refresh.
router.post("/sync-attendance", async (req, res) => {
  const newAlerts = await runAttendanceSync(req.user.id);
  res.json({ success: true, message: `Sync complete. ${newAlerts.length} new alert(s) created.`, data: newAlerts });
});

router.get("/tickets", async (req, res) => {
  const { status, priority } = req.query;
  const rows = await getAllTickets({ status, priority });
  res.json({ success: true, data: rows });
});

router.patch("/tickets/:id", async (req, res) => {
  const { status, assignedTo, cleared } = req.body || {};
  const updated = await updateTicket(req.params.id, { status, assignedTo, cleared });
  if (!updated) return res.status(404).json({ success: false, message: "Ticket not found." });
  if (updated.error === "NOT_RESOLVED") {
    return res.status(400).json({ success: false, message: updated.message });
  }
  res.json({ success: true, data: updated });
});

// Staff composes a notice. studentId omitted/null = broadcast to everyone.
// If isUrgent AND a studentId is given, this looks up that student's real
// linked parent(s) and actually emails/texts them — that's the
// "Improve High-Priority Communication" workflow from the brief.
router.post("/notices", async (req, res) => {
  const { title, body, isUrgent, studentId, category } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ success: false, message: "title and body are required." });
  }

  const notice = await createNotice({ studentId: studentId || null, title, body, category, isUrgent, createdBy: req.user.id });

  let dispatch = null;
  if (isUrgent) {
    if (studentId) {
      // Targeted notice: find every parent actually linked to this student
      // and send to their real contact info.
      const contacts = await getParentContactsForStudent(studentId);
      if (contacts.length === 0) {
        dispatch = { warning: `No parent is linked to student ${studentId} — notice was saved but nobody was contacted.` };
      } else {
        dispatch = [];
        for (const contact of contacts) {
          const result = await sendUrgentNotice({ phone: contact.phone, email: contact.email, title, body });
          dispatch.push({ sentTo: contact.name, email: contact.email, ...result });
        }
      }
    } else {
      // Broadcast notice: no single recipient to look up — logged here so
      // it's visible in the terminal; a real broadcast would loop every
      // parent the same way the targeted branch does above.
      console.log(`[notify:BROADCAST] Urgent notice created but not individually dispatched (no studentId given): "${title}"`);
      dispatch = { note: "Broadcast notices are saved and shown in every portal, but are not individually emailed/texted to each parent in this build." };
    }
  }

  res.status(201).json({ success: true, data: notice, dispatch });
});

export default router;
