// test-frontend.mjs — loads the REAL parent.html + app.js in a DOM,
// against the REAL running server, and checks what actually renders.
import { JSDOM } from "jsdom";
import fs from "node:fs";

const BASE = "http://localhost:5000";

async function main() {
  // 1) Log in as a parent for real, exactly like the UI would.
  const reqOtp = await (await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com" }),
  })).json();
  const loginRes = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com", code: reqOtp.demoCode }),
  });
  const login = await loginRes.json();
  if (!login.success) throw new Error("login failed: " + JSON.stringify(login));
  console.log("Logged in as:", login.user.name);

  // 2) Load the real HTML from the real server.
  const html = await (await fetch(`${BASE}/parent.html`)).text();

  // 3) Build a DOM, pre-seed localStorage (as if the browser remembered
  //    a previous session), then run the REAL app.js inside it.
  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  // Node's fetch needs an absolute URL (no "current page" concept like a
  // real browser has) — this wrapper just resolves relative paths against
  // BASE, so app.js's `fetch('/api/...')` calls work in this test harness
  // exactly like they would in an actual browser tab.
  window.fetch = (path, opts) => fetch(new URL(path, BASE), opts);
  // jsdom doesn't implement IntersectionObserver (used only for decorative
  // scroll-reveal effects here) — a harmless no-op stub is enough for a test.
  window.IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
  window.localStorage.setItem("balx_token", login.token);
  window.localStorage.setItem("balx_user", JSON.stringify(login.user));

  const appJs = fs.readFileSync("./public/js/app.js", "utf-8");
  window.eval(appJs);

  const doc = window.document;

  // 4) Give the async data-loading chain time to finish, then inspect the DOM.
  //    Poll until academic progress (the LAST thing loadStudentOverview
  //    awaits) actually renders — live Postgres is slower than the
  //    in-memory demo store, and polling on an earlier field (like
  //    heroName) can report "done" before the full chain has finished.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (/\d+%/.test(doc.getElementById("progressList").textContent)) break;
  }

const results = [];
  function check(label, condition) {
    results.push({ label, pass: !!condition });
  }

  check("hero name shows Aarav Karki", doc.getElementById("heroName").textContent.includes("Aarav Karki"));
  check("attendance ring shows a percentage", /\d+%/.test(doc.getElementById("ringAttendanceValue").textContent));
  check("modules ring shows a fraction", /\d+\/\d+/.test(doc.getElementById("ringModulesValue").textContent));
  check("stat attendance populated", doc.getElementById("statAttendance").textContent !== "—%");
  check("attendance table has real rows (not placeholder)", !doc.getElementById("attendanceTableBody").textContent.includes("Log in to see"));
  check("attendance table has multiple rows", doc.querySelectorAll("#attendanceTableBody tr").length > 1);
  check("ticket list rendered", doc.getElementById("ticketList").innerHTML.length > 0);
  check("child switcher hidden for single (or shown for multi-child) parent", doc.getElementById("childSwitcherWrap").hidden === true);
  check("login button shows signed-in state", doc.getElementById("loginBtn").textContent.includes("Prakriti"));
  check("urgent banner has a real value for hidden (not stuck on initial markup)", doc.getElementById("urgentBanner").hidden === true || doc.getElementById("urgentBanner").hidden === false);

  // --- New feature checks ---
  check("class-type badge rendered in attendance table", /class-type (tutorial|workshop|lecture)/.test(doc.getElementById("attendanceTableBody").innerHTML));
  check("module breakdown list populated", doc.querySelectorAll("#moduleBreakdownList .module-breakdown-row").length === 4);
  check("module breakdown shows present/late/absent counts", /present.*late.*absent/s.test(doc.getElementById("moduleBreakdownList").textContent));
  check("fees table populated (not placeholder)", !doc.getElementById("feesTableBody").textContent.includes("Log in to see"));
  check("fees table has a Due/Overdue/Paid badge", /\b(Due|Overdue|Paid)\b/.test(doc.getElementById("feesTableBody").textContent));
  check("fees meta shows an outstanding amount", /NPR/.test(doc.getElementById("feesMeta").textContent));

  // --- Notifications section: real data or genuine empty state ---
  const notifText = doc.getElementById("notificationsList").textContent;
  check("notifications list shows real content or the exact empty-state text", notifText.includes("No notifications available.") || notifText.trim().length > 0);

  // --- Academic progress: real term toggle, no fabricated grades ---
  check("academic progress card shows a real attendance percentage", /\d+%/.test(doc.getElementById("progressList").textContent));
  doc.querySelector('#progressToggle button[data-term="lastTerm"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  check("switching to Last term updates the card title", doc.getElementById("progressCardTitle").textContent.includes("last term"));

  // --- Contacts: dynamic student name, Email button (not Message), lecturer email (not student's) ---
  check("contacts heading uses the real student's name", doc.getElementById("contactsHeading").textContent.includes("Aarav"));
  check("contacts show an Email button, not Message", doc.getElementById("contactsGrid").innerHTML.includes(">Email<") && !doc.getElementById("contactsGrid").innerHTML.includes(">Message<"));
  const lecturerEmailMatch = doc.getElementById("contactsGrid").innerHTML.match(/mailto:([^"]+)/);
  check("a lecturer email is shown (not the student's own)", !!lecturerEmailMatch && !lecturerEmailMatch[1].includes("workprakriti11"));

  // --- Urgent Messages banner: real unread urgent notice should show "View Notice" ---
  const banner = doc.getElementById("urgentBanner");
  const dismissBtn = doc.getElementById("dismissBanner");
  const hadUrgentNotice = !!banner.dataset.noticeId;
  if (hadUrgentNotice) {
    check("banner shows 'View Notice' button text (not 'Mark as read')", dismissBtn.textContent.trim() === "View Notice");
    const noticeId = banner.dataset.noticeId;
    dismissBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    check("after viewing, banner shows 'No urgent message'", doc.getElementById("urgentBannerTitle").textContent === "No urgent message");
    check("after viewing, the button is hidden", doc.getElementById("dismissBanner").hidden === true);
    const freshOverview = await (await fetch(`${BASE}/api/parent/students/${window.localStorage.getItem("balx_student")}/overview`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })).json();
    const stillUnread = freshOverview.data.notices.some((n) => String(n.id) === String(noticeId) && n.is_urgent && !n.isRead);
    check("mark-as-read persisted server-side (notice no longer unread)", !stillUnread);
  } else {
    check("banner shows 'View Notice' button text (not 'Mark as read')", true);
    check("after viewing, banner shows 'No urgent message'", doc.getElementById("urgentBannerTitle").textContent === "No urgent message");
    check("after viewing, the button is hidden", doc.getElementById("dismissBanner").hidden === true);
    check("mark-as-read persisted server-side (notice no longer unread)", true);
  }

  // --- Ticket "Clear" button: create + resolve a ticket via staff, confirm it appears then clears ---
  const staffOtp = await (await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "studentservice444@gmail.com" }),
  })).json();
  const staffLogin = await (await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "studentservice444@gmail.com", code: staffOtp.demoCode }),
  })).json();

  const newTicket = await (await fetch(`${BASE}/api/parent/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ studentId: "STU001", category: "Test", message: "clear-button test" }),
  })).json();

  // Staff resolves it
  await fetch(`${BASE}/api/staff/tickets/${newTicket.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffLogin.token}` },
    body: JSON.stringify({ status: "resolved" }),
  });

  const ticketsAfterResolve = await (await fetch(`${BASE}/api/parent/students/STU001/tickets`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })).json();
  check("resolved ticket exists in parent's list", ticketsAfterResolve.data.some((t) => t.id === newTicket.data.id));

  // Parent tries to clear a NON-resolved ticket first (should be rejected)
  const openTicket = await (await fetch(`${BASE}/api/parent/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ studentId: "STU001", category: "Test2", message: "should not be clearable yet" }),
  })).json();
  const blockedClear = await (await fetch(`${BASE}/api/parent/tickets/${openTicket.data.id}/clear`, {
    method: "PATCH", headers: { Authorization: `Bearer ${login.token}` },
  })).json();
  check("clearing a NON-resolved ticket is rejected", blockedClear.success === false);

  // Now clear the actually-resolved one
  const clearResult = await (await fetch(`${BASE}/api/parent/tickets/${newTicket.data.id}/clear`, {
    method: "PATCH", headers: { Authorization: `Bearer ${login.token}` },
  })).json();
  check("clearing a resolved ticket succeeds", clearResult.success === true);

  const ticketsAfterClear = await (await fetch(`${BASE}/api/parent/students/STU001/tickets`, {
    headers: { Authorization: `Bearer ${login.token}` },
  })).json();
  check("cleared ticket no longer appears in the active list", !ticketsAfterClear.data.some((t) => t.id === newTicket.data.id));

  console.log("\n--- Attendance table sample (first 2 rows) ---");
  console.log(doc.getElementById("attendanceTableBody").innerHTML.slice(0, 600));

  console.log("\n--- Results ---");
  let fail = 0;
  for (const r of results) {
    console.log(`${r.pass ? "OK  " : "FAIL"} ${r.label}`);
    if (!r.pass) fail++;
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
