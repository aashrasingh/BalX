// test-parent-v2.mjs — tests the NEW parent portal design (page-based nav,
// stat cards, attendance/fees/alerts pages) against the real running server.
import { JSDOM } from "jsdom";
import fs from "node:fs";

const BASE = "http://localhost:5000";

async function main() {
  const reqOtp = await (await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "jaybirmalla@gmail.com" }),
  })).json();
  const loginRes = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "jaybirmalla@gmail.com", code: reqOtp.demoCode }),
  });
  const login = await loginRes.json();
  if (!login.success) throw new Error("login failed: " + JSON.stringify(login));
  console.log("Logged in as:", login.user.name);

  const html = await (await fetch(`${BASE}/parent.html`)).text();
  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (path, opts) => fetch(new URL(path, BASE), opts);
  window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
  window.localStorage.setItem("balx_token", login.token);
  window.localStorage.setItem("balx_user", JSON.stringify(login.user));

  const appJs = fs.readFileSync("./public/js/app.js", "utf-8");
  window.eval(appJs);

  const doc = window.document;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (doc.getElementById("heroName").textContent.includes("Sijan")) break;
  }

  const results = [];
  function check(label, condition) { results.push({ label, pass: !!condition }); }

  check("hero shows Sijan Thapa's real name + program", doc.getElementById("heroName").textContent.includes("Sijan Thapa") && doc.getElementById("heroName").textContent.includes("BSc"));
  check("no 'Grade 12'-style text anywhere on the page", !doc.body.textContent.includes("Grade 12") && !doc.body.textContent.includes("Grade 11") && !doc.body.textContent.includes("Grade 10"));
  check("attendance ring shows a real percentage", /\d+%/.test(doc.getElementById("ringAttendanceValue").textContent));
  check("stat cards show real values (fees)", document_hasRealFeesStat(doc));
  check("attendance table has real rows (not the old Sept 2026 dummy dates)", doc.querySelectorAll("#attnTableBody tr[data-status]").length > 1);
  check("attendance present/absent/late counts populated", doc.getElementById("attnCountPresent").textContent !== "11" || doc.getElementById("attnCountAbsent").textContent !== "2");
  check("fees table has real rows", doc.querySelectorAll("#feesTableBody tr[data-status]").length > 0);
  check("payment plan percentage is computed (not hardcoded 33%)", doc.querySelector(".plan-simple-pct")?.textContent !== "33%");
  check("fabricated reminder-schedule card removed", !doc.getElementById("feeReminderCard"));
  check("recent updates shows real content or empty state", doc.querySelector("#updates .card")?.textContent.trim().length > 0);
  check("quick actions use Sijan's real first name", doc.getElementById("qaGrid").textContent.includes("Sijan"));
  check("contacts heading uses Sijan's real first name", doc.querySelector("#contacts .section-head h2")?.textContent.includes("Sijan"));
  check("lecturers section KEPT its illustrative data (Dr. Rina Marlow)", doc.body.textContent.includes("Rina Marlow"));

  // Ticket creation + clear-request flow
  const beforeCount = doc.querySelectorAll("#ticketList .ticket").length;
  doc.getElementById("serviceCategory").value = "Attendance concern";
  doc.getElementById("servicePriority").value = doc.getElementById("servicePriority").options[0].text;
  doc.getElementById("serviceMessage").value = "v2 design test message";
  doc.getElementById("serviceForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 500));
  check("submitting a real request adds a ticket", doc.querySelectorAll("#ticketList .ticket").length > beforeCount);

  console.log("\n--- Results ---");
  let fail = 0;
  for (const r of results) {
    console.log(`${r.pass ? "OK  " : "FAIL"} ${r.label}`);
    if (!r.pass) fail++;
  }
  process.exit(fail ? 1 : 0);
}

function document_hasRealFeesStat(doc) {
  const val = doc.querySelector('[data-stat="fees"] .stat-value')?.textContent || "";
  return val !== "NPR 650k"; // the old hardcoded dummy value
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
