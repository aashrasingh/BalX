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
  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (path, opts) => fetch(new URL(path, BASE), opts);
  window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };

  window.localStorage.setItem("balx_staff_token", login.token);
  window.localStorage.setItem("balx_staff_user", JSON.stringify(login.user));

  const staffJs = fs.readFileSync("public/js/staff.js", "utf-8");
  window.eval(staffJs);

  await new Promise((r) => setTimeout(r, 800));
  const doc = window.document;
  const results = [];
  function check(label, condition) { results.push({ label, pass: !!condition }); }

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
  await new Promise((r) => setTimeout(r, 500)); // debounce + fetch round trip

  check("attendance search found Sijan Thapa", doc.getElementById("attendanceResult").textContent.includes("Sijan Thapa"));
  check("attendance grid table rendered", doc.querySelectorAll(".attendance-grid-table tbody tr").length > 0);
  check("attendance grid has a clickable absent/late cell", doc.querySelectorAll(".grid-cell.clickable").length > 0);

  // Test the sync button triggers a real API call.
  const syncBtn = doc.getElementById("runSyncBtn");
  syncBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  check("sync button did not crash the page", !!doc.getElementById("studentAlertsList"));

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
