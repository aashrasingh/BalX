// test-notice-email.mjs — confirms the staff "compose urgent notice" flow
// actually looks up the real linked parent and emails them, instead of
// silently doing nothing (the bug the README flagged).
process.env.DATABASE_URL = "";
process.env.PORT = "5098";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "2527";
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
  await new Promise((resolve) => smtpFake.listen(2527, "127.0.0.1", resolve));
  await import("../src/index.js");
  await new Promise((r) => setTimeout(r, 3000));

  const BASE = "http://localhost:5098";
  const results = [];
  function check(label, condition) { results.push({ label, pass: !!condition }); }

  // Log in as staff (studentservice444@gmail.com) to get a token.
  await fetch(`${BASE}/api/auth/request-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "studentservice444@gmail.com" }),
  });
  await new Promise((r) => setTimeout(r, 300));
  const staffLoginCode = receivedEmails.find((e) => e.to?.includes("studentservice444"))?.text.match(/\b(\d{6})\b/)?.[1];
  const staffLogin = await (await fetch(`${BASE}/api/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "studentservice444@gmail.com", code: staffLoginCode }),
  })).json();
  check("staff login succeeded", staffLogin.success === true);

  receivedEmails.length = 0; // reset so we only look at the notice email below

  console.log("=== Composing an urgent notice targeted at STU005 (Sijan, linked to jaybirmalla@gmail.com) ===");
  const noticeRes = await fetch(`${BASE}/api/staff/notices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffLogin.token}` },
    body: JSON.stringify({
      title: "Attendance concern",
      body: "Please contact Student Services about Sijan's recent absences.",
      isUrgent: true,
      studentId: "STU005",
    }),
  });
  const noticeData = await noticeRes.json();
  console.log("API response:", JSON.stringify(noticeData, null, 2));

  await new Promise((r) => setTimeout(r, 400));
  console.log("\n=== What the fake SMTP server received ===");
  console.log(receivedEmails);

  const parentEmail = receivedEmails.find((e) => e.to?.includes("jaybirmalla@gmail.com"));
  check("notice creation succeeded", noticeData.success === true);
  check("dispatch identifies the correct parent (Jaybir)", JSON.stringify(noticeData.dispatch).includes("Jaybir"));
  check("an email was actually sent to the linked parent's real address", !!parentEmail);
  check("the email contains the notice title", parentEmail?.subject === "Attendance concern");

  console.log("\n--- Results ---");
  let fail = 0;
  for (const r of results) {
    console.log(`${r.pass ? "OK  " : "FAIL"} ${r.label}`);
    if (!r.pass) fail++;
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
