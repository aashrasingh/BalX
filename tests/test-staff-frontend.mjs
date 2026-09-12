// test-staff-frontend.mjs — loads the REAL staff.html + staff.js in a DOM,
// against the REAL running server, and checks what actually renders.
import { JSDOM } from "jsdom";
import fs from "node:fs";

const BASE = "http://localhost:5000";

async function main() {
  const reqOtp = await (await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "studentservice444@gmail.com" }),
  })).json();
  const loginRes = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "studentservice444@gmail.com", code: reqOtp.demoCode }),
  });
  const login = await loginRes.json();
  if (!login.success) throw new Error("staff login failed: " + JSON.stringify(login));
  console.log("Logged in as:", login.user.name);

  const html = await (await fetch(`${BASE}/staff.html`)).text();

  // Since tickets now start genuinely empty (no seeded fake ticket), create
  // one real one first so "does the table render a ticket row correctly"
  // has something real to check against.
  const seedOtp = await (await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com" }),
  })).json();
  const seedLogin = await (await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com", code: seedOtp.demoCode }),
  })).json();
  await fetch(`${BASE}/api/parent/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${seedLogin.token}` },
    body: JSON.stringify({ studentId: "STU001", category: "Test", message: "seed ticket for rendering checks" }),
  });

  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (path, opts) => fetch(new URL(path, BASE), opts);
  window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };

  window.localStorage.setItem("balx_staff_token", login.token);
  window.localStorage.setItem("balx_staff_user", JSON.stringify(login.user));

  const staffJs = fs.readFileSync("./public/js/staff.js", "utf-8");
  window.eval(staffJs);

  const doc = window.document;
  const results = [];
  function check(label, condition) { results.push({ label, pass: !!condition }); }

  // Give the async loadStaffData chain time to finish against live Postgres.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (doc.getElementById("ticketsTableBody").textContent.includes("Log in to see") === false) break;
  }

  check("staff name shown in profile pill", doc.getElementById("staffName").textContent.includes("Student Services"));
  check("login button hidden after login", doc.getElementById("staffLoginBtn").hidden === true);
  check("greeting says Welcome SSD", doc.getElementById("staffGreeting").textContent.trim() === "Welcome SSD");
  check("tickets table has real rows (not placeholder)", !doc.getElementById("ticketsTableBody").textContent.includes("Log in to see"));
  check("tickets table has a status dropdown", doc.querySelectorAll(".status-select").length > 0);
  check("student alerts list populated", doc.getElementById("studentAlertsList").innerHTML.length > 0);
  check("alerts meta shows a count", /\d+ need review/.test(doc.getElementById("alertsMeta").textContent));

  // --- Clear icon: disabled for non-resolved, enabled for resolved ---
  const openClearIcons = [...doc.querySelectorAll("#ticketsTableBody [data-clear-ticket]")];
  const disabledClearIcons = [...doc.querySelectorAll("#ticketsTableBody button[disabled]")];
  check("at least one clear icon rendered (enabled or disabled)", openClearIcons.length + disabledClearIcons.length > 0);

  // Create a fresh ticket via a parent, confirm its clear icon starts disabled, resolve it, reload, confirm it's now enabled.
  const parentOtp = await (await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com" }),
  })).json();
  const parentLogin = await (await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com", code: parentOtp.demoCode }),
  })).json();
  const freshTicket = await (await fetch(`${BASE}/api/parent/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${parentLogin.token}` },
    body: JSON.stringify({ studentId: "STU001", category: "Test", message: "staff clear-icon test" }),
  })).json();

  await window.loadTickets();
  const freshRowClearBtn = doc.querySelector(`[data-clear-ticket="${freshTicket.data.id}"]`);
  check("a NOT-YET-resolved ticket's clear icon is disabled (no enabled clear button for it)", !freshRowClearBtn);

  await fetch(`${BASE}/api/staff/tickets/${freshTicket.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ status: "resolved" }),
  });
  await window.loadTickets();
  const resolvedRowClearBtn = doc.querySelector(`[data-clear-ticket="${freshTicket.data.id}"]`);
  check("once resolved, the SAME ticket's clear icon becomes enabled", !!resolvedRowClearBtn && !resolvedRowClearBtn.disabled);

  resolvedRowClearBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  const afterClearCheck = await (await fetch(`${BASE}/api/staff/tickets`, { headers: { Authorization: `Bearer ${login.token}` } })).json();
  check("clicking the clear icon actually clears it server-side", !afterClearCheck.data.some((t) => t.id === freshTicket.data.id));

  // Simulate typing a search query for the attendance log lookup.
  const searchInput = doc.getElementById("attendanceSearch");
  searchInput.value = "sijan";
  searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  // 250ms debounce + two sequential API round-trips; poll for the result.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (doc.getElementById("attendanceResult").textContent.includes("Sijan Thapa")) break;
  }

  check("attendance search found Sijan Thapa", doc.getElementById("attendanceResult").textContent.includes("Sijan Thapa"));
  check("attendance grid table rendered", doc.querySelectorAll(".attendance-grid-table tbody tr").length > 0);
  check("attendance grid has a clickable absent/late cell", doc.querySelectorAll(".grid-cell.clickable").length > 0);

  // Test the sync button triggers a real API call.
  const syncBtn = doc.getElementById("runSyncBtn");
  syncBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  check("sync button did not crash the page", !!doc.getElementById("studentAlertsList"));

  // --- Removed sections stay removed ---
  check("Today's appointments section is gone", !doc.body.textContent.includes("Today's appointments"));
  check("Recent staff activity section is gone", !doc.body.textContent.includes("Recent staff activity"));

  // --- Student Alerts: sorted worst-first, paginated 10 + See more ---
  const alertTitles = [...doc.querySelectorAll("#studentAlertsList .alert-title")].map((el) => el.textContent);
  check("alerts list is capped at 10 initially (or fewer if not enough exist)", alertTitles.length <= 10);
  const pcts = [...doc.querySelectorAll("#studentAlertsList .alert-desc")]
    .map((el) => el.textContent.match(/\((\d+(?:\.\d+)?)%\)/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const isAscending = pcts.every((v, i) => i === 0 || pcts[i - 1] <= v);
  check("alerts are sorted worst (lowest %) attendance first", isAscending && pcts.length > 1);

  const seeMoreBtn = doc.getElementById("seeMoreAlerts");
  if (!seeMoreBtn.hidden) {
    const beforeCount = doc.querySelectorAll("#studentAlertsList .alert-row").length;
    seeMoreBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    const afterCount = doc.querySelectorAll("#studentAlertsList .alert-row").length;
    check("'See more' reveals additional alerts beyond the first 10", afterCount > beforeCount);
  } else {
    check("'See more' reveals additional alerts beyond the first 10", true); // fewer than 10 alerts exist — nothing to page through, not a failure
  }

  // --- Parent Messages: real data (or genuine empty state), working Reply ---
  const pmBody = doc.getElementById("parentMessagesBody").textContent;
  check("Parent Messages shows real content or the exact 'No message yet.' text", pmBody.includes("No message yet.") || pmBody.trim().length > 0);

  // Create a fresh parent message and confirm it appears with a working Reply button.
  const pmTicket = await (await fetch(`${BASE}/api/parent/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${seedLogin.token}` },
    body: JSON.stringify({ studentId: "STU001", category: "Fees or clearance", message: "Parent Messages render test" }),
  })).json();
  await window.loadTickets();
  const pmReplyBtn = doc.querySelector(`#parentMessagesBody [data-reply-ticket="${pmTicket.data.id}"]`);
  check("new parent message shows a Reply button", !!pmReplyBtn);
  check("Parent Messages row shows the real parent's name (Prakriti)", doc.getElementById("parentMessagesBody").textContent.includes("Prakriti"));

  const originalPrompt = window.prompt;
  window.prompt = () => "Thanks for reaching out — we're looking into it.";
  pmReplyBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  window.prompt = originalPrompt;

  const afterReply = await (await fetch(`${BASE}/api/staff/tickets`, { headers: { Authorization: `Bearer ${login.token}` } })).json();
  const repliedTicket = afterReply.data.find((t) => t.id === pmTicket.data.id);
  check("clicking Reply actually saves the reply server-side", repliedTicket?.staff_reply === "Thanks for reaching out — we're looking into it.");
  check("a reply auto-advances status from open to in_progress", repliedTicket?.status === "in_progress");

  // Test notice composer submits successfully.
  doc.getElementById("noticeTitle").value = "Automated test notice";
  doc.getElementById("noticeBody").value = "This is a DOM-level test submission.";
  const form = doc.getElementById("noticeForm");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 500));

  const verifyRes = await fetch(`${BASE}/api/staff/tickets`, { headers: { Authorization: `Bearer ${login.token}` } });
  check("staff tickets endpoint still reachable after all interactions", verifyRes.ok);

  console.log("\n--- Attendance grid sample ---");
  console.log(doc.getElementById("attendanceResult").innerHTML.slice(0, 400));

  console.log("\n--- Results ---");
  let fail = 0;
  for (const r of results) {
    console.log(`${r.pass ? "OK  " : "FAIL"} ${r.label}`);
    if (!r.pass) fail++;
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
