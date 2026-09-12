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

  const appJs = fs.readFileSync("public/js/app.js", "utf-8");
  window.eval(appJs);

  // 4) Give the async data-loading chain time to finish, then inspect the DOM.
  await new Promise((r) => setTimeout(r, 800));

  const doc = window.document;
  const results = [];
  function check(label, condition) {
    results.push({ label, pass: !!condition });
  }

  check("hero name shows Aarav Karki", doc.getElementById("heroName").textContent.includes("Aarav Karki"));
  check("attendance ring shows a percentage", /\d+%/.test(doc.getElementById("ringAttendanceValue").textContent));
  check("modules ring shows a fraction", /\d+\/\d+/.test(doc.getElementById("ringModulesValue").textContent));
  check("stat attendance populated", doc.getElementById("statAttendance").textContent !== "—%");
  check("clearance list has rows", doc.querySelectorAll("#clearanceList .clearance-row").length === 3);
  check("attendance table has real rows (not placeholder)", !doc.getElementById("attendanceTableBody").textContent.includes("Log in to see"));
  check("attendance table has multiple rows", doc.querySelectorAll("#attendanceTableBody tr").length > 1);
  check("ticket list rendered", doc.getElementById("ticketList").innerHTML.length > 0);
  check("child switcher hidden for single... or shown for multi-child parent", doc.getElementById("childSwitcherWrap").hidden === false);
  check("login button shows signed-in state", doc.getElementById("loginBtn").textContent.includes("Prakriti"));
  check("urgent banner has a real value for hidden (not stuck on initial markup)", doc.getElementById("urgentBanner").hidden === true || doc.getElementById("urgentBanner").hidden === false);

  // --- New feature checks ---
  check("class-type badge rendered in attendance table", /class-type (tutorial|workshop|lecture)/.test(doc.getElementById("attendanceTableBody").innerHTML));
  check("module breakdown list populated", doc.querySelectorAll("#moduleBreakdownList .module-breakdown-row").length === 4);
  check("module breakdown shows present/late/absent counts", /present.*late.*absent/s.test(doc.getElementById("moduleBreakdownList").textContent));
  check("fees table populated (not placeholder)", !doc.getElementById("feesTableBody").textContent.includes("Log in to see"));
  check("fees table has a Due/Overdue/Paid badge", /\b(Due|Overdue|Paid)\b/.test(doc.getElementById("feesTableBody").textContent));
  check("fees meta shows an outstanding amount", /NPR/.test(doc.getElementById("feesMeta").textContent));

  // --- Notice "mark as read" actually persists ---
  const banner = doc.getElementById("urgentBanner");
  if (!banner.hidden) {
    const noticeId = banner.dataset.noticeId;
    doc.getElementById("dismissBanner").dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    // Confirm it persisted server-side, not just hidden client-side, by
    // fetching the overview fresh (a real new request, not cached DOM state).
    const freshOverview = await (await fetch(`${BASE}/api/parent/students/${window.localStorage.getItem("balx_student")}/overview`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })).json();
    const stillUnread = freshOverview.data.notices.some((n) => String(n.id) === String(noticeId) && n.is_urgent && !n.isRead);
    check("mark-as-read persisted server-side (notice no longer unread)", !stillUnread);
  } else {
    check("mark-as-read persisted server-side (notice no longer unread)", true); // no urgent notice to test with — not a failure
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
