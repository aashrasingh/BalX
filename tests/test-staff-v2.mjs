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
  if (!login.success) throw new Error("login failed: " + JSON.stringify(login));
  console.log("Logged in as:", login.user.name);

  const html = await (await fetch(`${BASE}/staff.html`)).text();
  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (path, opts) => fetch(new URL(path, BASE), opts);
  window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
  window.localStorage.setItem("balx_staff_token", login.token);
  window.localStorage.setItem("balx_staff_user", JSON.stringify(login.user));

  const staffJs = fs.readFileSync("./public/js/staff.js", "utf-8");
  window.eval(staffJs);

  const doc = window.document;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (doc.querySelector(".topbar-left h1")?.textContent.includes("Welcome")) break;
  }

  const results = [];
  function check(label, condition) { results.push({ label, pass: !!condition }); }

  check("greeting shows real staff name", doc.querySelector(".topbar-left h1").textContent.includes(login.user.name));
  check("no hardcoded 'Rina' text anywhere", !doc.body.textContent.includes("Rina Marlow") && !doc.body.textContent.includes("Good morning, Rina"));
  check("stat cards show real numbers (not hardcoded 42/24/9)", document_realStats(doc));
  check("Quick Actions section removed from Overview", !doc.getElementById("quick-actions"));
  check("Fee Log lookup search removed", !doc.getElementById("feeSearch"));
  check("Fee leaderboard still present", doc.querySelectorAll("#feeLeaderboard .fee-leader-row").length === 5);
  check("staff directory shows real account count, not fake names", !doc.body.textContent.includes("55 cases this week"));
  check("no dummy person names anywhere (Ibarra/Osei/Karimi/Bhatt/Weiss/Turner)", !/Ibarra|Osei|Karimi|Bhatt|Weiss|Turner/.test(doc.body.textContent));

  // Attendance log lookup — real search
  doc.getElementById("attendanceSearch").value = "Sijan";
  doc.getElementById("attendanceSearch").dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  check("attendance search finds Sijan Thapa", doc.getElementById("attendanceResult").textContent.includes("Sijan Thapa"));
  check("attendance grid shows a clickable flagged cell", !!doc.querySelector(".grid-cell.clickable"));

  // Fee leaderboard populated with real data
  check("fee leaderboard populated", doc.querySelectorAll("#feeLeaderboard .fee-leader-row").length === 5);

  // Parent Messages — real ticket flow
  const beforeMsgCount = doc.querySelectorAll("#messagesTable .msg-item").length;
  const newTicket = await (await fetch(`${BASE}/api/parent/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await parentToken()}` },
    body: JSON.stringify({ studentId: "STU001", category: "Attendance concern", message: "staff v2 test message" }),
  })).json();
  await window.refreshTicketsData();
  check("new real ticket appears in Parent Messages", doc.querySelectorAll("#messagesTable .msg-item").length > beforeMsgCount);
  check("message shows the real parent's name (Prakriti)", doc.getElementById("messagesTable").textContent.includes("Prakriti"));

  // Reply via message detail modal — using the real inline textarea now,
  // not a browser prompt() popup (which doesn't behave reliably deployed).
  window.openMessageDetail(newTicket.data.id);
  check("reply textarea exists in the modal (no prompt() popup)", !!doc.getElementById("mdmReplyText"));
  doc.getElementById("mdmReplyText").value = "test reply from staff";
  doc.getElementById("mdmReply").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  const afterReply = await (await fetch(`${BASE}/api/staff/tickets`, { headers: { Authorization: `Bearer ${login.token}` } })).json();
  const repliedTicket = afterReply.data.find((t) => t.id === newTicket.data.id);
  check("replying via the inline textarea actually saves server-side", repliedTicket?.staff_reply === "test reply from staff");

  // Confirm the reply actually reaches the parent portal — the real point of this feature.
  const parentTicketsRes = await (await fetch(`${BASE}/api/parent/students/STU001/tickets`, {
    headers: { Authorization: `Bearer ${await parentToken()}` },
  })).json();
  const parentSeesReply = parentTicketsRes.data.find((t) => t.id === newTicket.data.id)?.staff_reply === "test reply from staff";
  check("the reply is visible from the PARENT portal's own ticket data", parentSeesReply);

  // Appointments — real creation
  const beforeAppt = doc.querySelectorAll("#page-appointments .appt-item").length;
  window.openApptModal();
  doc.getElementById("apptParentInput").value = "Test Parent";
  doc.getElementById("apptType").value = "Video";
  doc.getElementById("apptDate").value = "2026-12-01";
  doc.getElementById("apptTime").value = "14:00";
  doc.getElementById("apptSave").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  check("creating an appointment actually persists and renders", doc.querySelectorAll("#page-appointments .appt-item").length > beforeAppt);

  // Alerts page — real, sourced from attendance risk engine, red for critical
  check("alerts page shows real attendance-derived alerts", doc.querySelector(".alert-groups").textContent.includes("Attendance"));
  const critIcon = doc.querySelector(".alert-icon.crit");
  check("a critical (red-risk) alert has the red 'crit' icon class", !!critIcon);
  check("a critical alert shows the red 'Critical' severity tag", !!doc.querySelector(".sev-tag.crit") && doc.querySelector(".sev-tag.crit").textContent === "Critical");

  // Fee leaderboard row opens the fee detail modal (replaces the removed lookup)
  doc.querySelector("#feeLeaderboard .fee-leader-row")?.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  check("clicking a leaderboard row opens the fee detail modal", doc.getElementById("feeDetailModal").classList.contains("open"));
  check("fee detail modal shows a real student name", doc.getElementById("feeDetailTitle").textContent.length > 0 && !doc.getElementById("feeDetailTitle").textContent.includes("Student fee record"));

  console.log("\n--- Results ---");
  let fail = 0;
  for (const r of results) {
    console.log(`${r.pass ? "OK  " : "FAIL"} ${r.label}`);
    if (!r.pass) fail++;
  }
  process.exit(fail ? 1 : 0);
}

function document_realStats(doc) {
  const vals = [...doc.querySelectorAll("#statsGrid .stat-value")].map((el) => el.textContent);
  return !(vals[0] === "42" && vals[1] === "24" && vals[2] === "9");
}

async function parentToken() {
  const otp = await (await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com" }),
  })).json();
  const login = await (await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "workprakriti11@gmail.com", code: otp.demoCode }),
  })).json();
  return login.token;
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
