// test-login-gate.mjs — loads the REAL index.html (main login portal) in a
// DOM, against the REAL running server, and confirms the email-based login
// + role-based redirect logic actually works. Uses manual script extraction
// (not runScripts:"dangerously") so jsdom never tries to fetch the external
// Google Fonts <link> itself.
import { JSDOM } from "jsdom";

const BASE = "http://localhost:5000";

function buildDom(html) {
  const dom = new JSDOM(html, { url: `${BASE}/`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (path, opts) => fetch(new URL(path, BASE), opts);
  window.matchMedia = window.matchMedia || (() => ({ matches: false }));
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  window.eval(scriptMatch[1]);
  return dom;
}

async function testLogin(label, email, roleToPick, expectedRedirect, expectedLocalStorageKey) {
  const html = await (await fetch(`${BASE}/index.html`)).text();
  const dom = buildDom(html);
  const { window } = dom;
  const doc = window.document;

  const card = doc.querySelector(`.role-card[data-role="${roleToPick}"]`);
  card.dispatchEvent(new window.Event("click", { bubbles: true }));

  doc.getElementById("email").value = email;
  doc.getElementById("sendCodeLink").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400)); // real request-otp round trip

  const statusAfterSend = doc.getElementById("authStatus").textContent;
  console.log(`[${label}] status after sending code: "${statusAfterSend}"`);
  const realCode = statusAfterSend.match(/\b(\d{6})\b/)?.[1];

  doc.getElementById("otp").value = realCode;
  doc.querySelector("#loginPanel form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 500)); // real verify-otp round trip

  const finalStatus = doc.getElementById("authStatus").textContent;
  console.log(`[${label}] final status: "${finalStatus}"`);

  // jsdom deliberately doesn't implement real page navigation (it logs
  // "Not implemented: navigation to another Document" and stops there), so
  // we can't observe the final URL. Instead we confirm the code reached the
  // redirect branch: it said "redirecting", and it stored the token under
  // the role-specific key that only that branch writes to.
  return {
    reachedRedirectStep: finalStatus.toLowerCase().includes("redirecting"),
    tokenStored: !!window.localStorage.getItem(expectedLocalStorageKey),
  };
}

async function testMismatch() {
  // Pick "staff" tile but log in with a PARENT email — should error, not redirect.
  const html = await (await fetch(`${BASE}/index.html`)).text();
  const dom = buildDom(html);
  const { window } = dom;
  const doc = window.document;

  doc.querySelector('.role-card[data-role="staff"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  doc.getElementById("email").value = "workprakriti11@gmail.com"; // a PARENT account
  doc.getElementById("sendCodeLink").dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const sentStatus = doc.getElementById("authStatus").textContent;
  const realCode = sentStatus.match(/\b(\d{6})\b/)?.[1];
  doc.getElementById("otp").value = realCode;
  doc.querySelector("#loginPanel form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 500));

  const status = doc.getElementById("authStatus").textContent;
  console.log(`[mismatch test] status: "${status}"`);
  return {
    showedMismatchError: status.toLowerCase().includes("parent"),
    didNotStoreStaffToken: !window.localStorage.getItem("balx_staff_token"),
  };
}

async function main() {
  const results = [];
  function check(label, condition) { results.push({ label, pass: !!condition }); }

  const parentResult = await testLogin("parent login", "workprakriti11@gmail.com", "parent", "parent.html", "balx_token");
  check("parent login reaches redirect step", parentResult.reachedRedirectStep);
  check("parent token stored under correct key", parentResult.tokenStored);

  const staffResult = await testLogin("staff login", "studentservice444@gmail.com", "staff", "staff.html", "balx_staff_token");
  check("staff login reaches redirect step", staffResult.reachedRedirectStep);
  check("staff token stored under correct key", staffResult.tokenStored);

  const mismatch = await testMismatch();
  check("role mismatch shows a clear error", mismatch.showedMismatchError);
  check("role mismatch does not store a staff token", mismatch.didNotStoreStaffToken);

  console.log("\n--- Results ---");
  let fail = 0;
  for (const r of results) {
    console.log(`${r.pass ? "OK  " : "FAIL"} ${r.label}`);
    if (!r.pass) fail++;
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
