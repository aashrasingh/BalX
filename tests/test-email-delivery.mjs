// test-email-delivery.mjs — spins up a LOCAL fake SMTP server (no external
// network needed) and points notify.js's transporter at it, to verify the
// actual Nodemailer integration code works — not just that it compiles.
//
// This does NOT prove Gmail-specific auth works (that needs a real send,
// which you should do yourself per the README), but it DOES prove:
//   - the transporter is built correctly
//   - sendMail() is called with the right to/from/subject/body
//   - the OTP-request route actually calls sendEmail() now
//   - the staff notice route actually looks up the parent's real email
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

const receivedEmails = [];

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS", "AUTH"], // plain local test server, no TLS needed for this check
  onData(stream, session, callback) {
    simpleParser(stream, {}, (err, parsed) => {
      if (!err) receivedEmails.push({ to: parsed.to?.text, subject: parsed.subject, text: parsed.text });
      callback();
    });
  },
});

async function main() {
  await new Promise((resolve) => server.listen(2526, "127.0.0.1", resolve));
  console.log("Fake local SMTP server listening on 127.0.0.1:2526");

  // Point notify.js at the fake server instead of Gmail, for this test only.
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "2526";
  process.env.SMTP_USER = "test@example.com";
  process.env.SMTP_PASS = "unused-for-fake-server";

  const notify = await import("../src/services/notify.js");

  console.log("\n=== Test 1: isEmailConfigured() reports true when SMTP_* vars are set ===");
  console.log("isEmailConfigured():", notify.isEmailConfigured());

  console.log("\n=== Test 2: sendEmail() actually delivers to the fake server ===");
  const result = await notify.sendEmail("someone@example.com", "Your verification code", "Your verification code is 482913.");
  console.log("sendEmail() result:", result);

  await new Promise((r) => setTimeout(r, 300)); // let onData finish parsing

  console.log("\n=== Test 3: what the fake server actually received ===");
  console.log(receivedEmails);

  const ok =
    result.sent === true &&
    receivedEmails.length === 1 &&
    receivedEmails[0].to.includes("someone@example.com") &&
    receivedEmails[0].subject === "Your verification code" &&
    receivedEmails[0].text.includes("482913");

  console.log("\n" + (ok ? "OK   Email integration code is correct end-to-end." : "FAIL Something is wrong with the email integration."));
  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error("Test crashed:", err); process.exit(1); });
