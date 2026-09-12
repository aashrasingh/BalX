// test-real-otp-flow.mjs — the most important test in this project.
// Proves the ACTUAL bug report is fixed: request an OTP for a real parent
// email, confirm the API response does NOT show the code (real-email mode),
// confirm the fake SMTP server actually received an email containing a
// 6-digit code, then use THAT exact code (extracted from the email) to log
// in successfully.
//
// Uses a local fake SMTP server (not real Gmail) so it runs without
// external network access, but every other part of the flow — the real
// Express server, the real routes, the real OTP store — is 100% real.

process.env.DATABASE_URL = "";           // force demo-mode data (no real Postgres needed for this test)
process.env.PORT = "5099";               // isolated port so this never clashes with anything else
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "2526";
process.env.SMTP_USER = "test-sender@example.com";
process.env.SMTP_PASS = "unused-for-fake-server";

import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

const receivedEmails = [];
const smtpFake = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS", "AUTH"],
  onData(stream, session, callback) {
    simpleParser(stream, {}, (err, parsed) => {
      if (!err) receivedEmails.push({ to: parsed.to?.text, subject: parsed.subject, text: parsed.text });
      callback();
    });
  },
});

async function main() {
  await new Promise((resolve) => smtpFake.listen(2526, "127.0.0.1", resolve));
  console.log("Fake local SMTP server listening on 127.0.0.1:2526\n");

  await import("../src/index.js"); // starts the REAL server on port 5099
  await new Promise((r) => setTimeout(r, 3000));

  const BASE = "http://localhost:5099";
  const results = [];
  function check(label, condition) { results.push({ label, pass: !!condition }); }

  console.log("=== Requesting OTP for a real parent email (jaybirmalla@gmail.com) ===");
  const reqRes = await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "jaybirmalla@gmail.com" }),
  });
  const reqData = await reqRes.json();
  console.log("API response:", reqData);

  check("request-otp succeeds", reqData.success === true);
  check("response does NOT contain the code (real-email mode)", reqData.demoCode === undefined);
  check("response message mentions email delivery", reqData.message.toLowerCase().includes("email"));

  await new Promise((r) => setTimeout(r, 400)); // let the fake SMTP server finish parsing

  console.log("\n=== What the fake SMTP server actually received ===");
  console.log(receivedEmails);
  // NOTE: jaybirmalla@gmail.com may already have received a few
  // ATTENDANCE ALERT emails during the server's initial startup sync
  // (Sijan, their linked student, is deliberately at-risk). We need the
  // specific verification-code email, not just any email to this address.
  const matchingEmail = receivedEmails.find(
    (e) => e.to?.includes("jaybirmalla@gmail.com") && e.subject === "Your Islington Student Services verification code"
  );
  check("an email was actually sent to jaybirmalla@gmail.com", !!matchingEmail);

  const codeMatch = matchingEmail?.text.match(/\b(\d{6})\b/);
  check("the email body contains a 6-digit code", !!codeMatch);
  const realCode = codeMatch ? codeMatch[1] : null;
  console.log("\nExtracted real code from the email body:", realCode);

  console.log("\n=== Verifying with the WRONG code first (should fail) ===");
  const wrongRes = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "jaybirmalla@gmail.com", code: "000000" }),
  });
  const wrongData = await wrongRes.json();
  console.log("Wrong-code response:", wrongData);
  check("wrong code is correctly rejected", wrongData.success === false);

  console.log("\n=== Verifying with the REAL code extracted from the email (should succeed) ===");
  const verifyRes = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "jaybirmalla@gmail.com", code: realCode }),
  });
  const verifyData = await verifyRes.json();
  console.log("Real-code response:", verifyData);
  check("real code from the email logs in successfully", verifyData.success === true);
  check("logged-in user has the correct role (parent)", verifyData.user?.role === "parent");
  check("logged-in user is Jaybir", verifyData.user?.name === "Jaybir (Parent)");

  console.log("\n=== Confirming the code cannot be reused (one-time use) ===");
  const reuseRes = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "jaybirmalla@gmail.com", code: realCode }),
  });
  const reuseData = await reuseRes.json();
  console.log("Reuse attempt response:", reuseData);
  check("the same code cannot be used twice", reuseData.success === false);

  console.log("\n--- Results ---");
  let fail = 0;
  for (const r of results) {
    console.log(`${r.pass ? "OK  " : "FAIL"} ${r.label}`);
    if (!r.pass) fail++;
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
