// src/services/notify.js
// ----------
// Sends SMS + email for urgent notices and attendance alerts.
//
// Email is fully wired to real Gmail via Nodemailer (see .env / SMTP_* vars).
// SMS needs a Twilio Auth Token + phone number to go live — see the TODO
// block below. Until then, SMS just logs to the console.

import nodemailer from "nodemailer";

function hasEmailConfigured() {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
}
const hasTwilio = () => !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER;

/** Exported so routes (like OTP delivery) can decide whether to fall back
 *  to showing a code on screen instead of pretending it was emailed. */
export function isEmailConfigured() {
  return hasEmailConfigured();
}

let emailTransport = null;
let emailTransportKey = null;
function getEmailTransport() {
  // Rebuild the transport if the SMTP_* env vars changed since last time
  // (matters for the local test harness, which points these at a fake
  // SMTP server — in normal operation this only ever builds once).
  const key = `${process.env.SMTP_HOST}:${process.env.SMTP_PORT}:${process.env.SMTP_USER}`;
  if (!emailTransport || emailTransportKey !== key) {
    emailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Fail fast instead of hanging forever if the network can't reach the
      // SMTP server at all (e.g. a restrictive firewall) — 15s is generous
      // for a real connection, but won't block the whole sync indefinitely.
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });
    emailTransportKey = key;
  }
  return emailTransport;
}

export async function sendSMS(toPhone, message) {
  if (!hasTwilio()) {
    console.log(`[notify:SMS-DEMO] to ${toPhone}: ${message}`);
    return { sent: false, demo: true, reason: !process.env.TWILIO_ACCOUNT_SID
      ? "TWILIO_NOT_CONFIGURED"
      : "MISSING_TWILIO_AUTH_TOKEN_OR_FROM_NUMBER" };
  }

  // ===== Real Twilio integration =====
  // A send failure here (unverified number, rate limit, network blip, etc.)
  // must NEVER crash the caller — this is wrapped in try/catch specifically
  // because an early version of this code let a single failed text take
  // down the entire server on startup.
  try {
    const twilioModule = await import("twilio").catch(() => null);
    if (!twilioModule) {
      console.log(`[notify:SMS] Twilio credentials found but the "twilio" package isn't installed yet. Run: npm install twilio`);
      return { sent: false, demo: false, reason: "TWILIO_PACKAGE_NOT_INSTALLED" };
    }
    const client = twilioModule.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const result = await client.messages.create({
      to: toPhone,
      from: process.env.TWILIO_FROM_NUMBER,
      body: message,
    });
    console.log(`[notify:SMS] Sent to ${toPhone} (sid: ${result.sid})`);
    return { sent: true, sid: result.sid };
  } catch (err) {
    // Twilio trial accounts can ONLY send to Verified Caller IDs — this is
    // the most common reason this fails, so surface it clearly.
    const hint = err.status === 403 || err.code === 21608
      ? " (trial accounts can only text numbers verified as a Caller ID in the Twilio console)"
      : "";
    console.error(`[notify:SMS] Failed to send to ${toPhone}:`, err.message + hint);
    return { sent: false, demo: false, error: err.message, status: err.status };
  }
}

export async function sendEmail(toEmail, subject, body) {
  if (!hasEmailConfigured()) {
    console.log(`[notify:EMAIL-DEMO] to ${toEmail} | ${subject}: ${body}`);
    return { sent: false, demo: true };
  }

  try {
    const transport = getEmailTransport();
    const info = await transport.sendMail({
      from: `"Islington Student Services" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      text: body,
    });
    console.log(`[notify:EMAIL] Sent to ${toEmail} (messageId: ${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[notify:EMAIL] Failed to send to ${toEmail}:`, err.message);
    return { sent: false, demo: false, error: err.message };
  }
}

/** Convenience wrapper used by the notices route for an urgent notice. */
export async function sendUrgentNotice({ phone, email, title, body }) {
  const results = {};
  if (phone) results.sms = await sendSMS(phone, `${title}: ${body}`);
  if (email) results.email = await sendEmail(email, title, body);
  return results;
}
