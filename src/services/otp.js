// otp.js — in-memory OTP storage + helpers
// ----------
// WHY A MAP AND NOT A TABLE?
//   OTP codes are tiny, short-lived (5 min), and useless forever after.
//   Storing them in Postgres is like keeping every grocery receipt you've
//   ever had — a lot of work for no future value. A Map is just a box
//   in the server's memory that forgets things automatically.
//
// NOTE: this file only generates/stores/checks codes. Whether a code gets
// emailed to the person or shown on screen is decided by the route that
// calls this (src/routes/auth.routes.js) — that decision depends on
// whether real email sending is configured, not on anything in here.

// identifier -> { code, expiresAt }
const store = new Map();

/**
 * Create a fresh 6-digit code for an identifier (email or phone).
 * Always random — never a fixed/predictable value.
 *
 * @param {string} identifier
 * @returns {{ code: string }}
 */
export function createOtp(identifier, config) {
  const code = String(Math.floor(100000 + Math.random() * 900000));

  store.set(identifier, {
    code,
    expiresAt: Date.now() + config.otpTtlMinutes * 60 * 1000,
  });

  return { code };
}

/**
 * Check a submitted code against the stored one.
 * Deletes the entry on success (OTP are one-time-use) AND on expiry, so a
 * stale code can never be replayed either way.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyOtp(identifier, submittedCode, config) {
  const entry = store.get(identifier);
  if (!entry) return { ok: false, reason: "No code was requested for this email/phone. Click \"Send code\" first." };

  if (Date.now() > entry.expiresAt) {
    store.delete(identifier);
    return { ok: false, reason: "This code has expired. Request a new one." };
  }

  if (entry.code !== submittedCode) {
    return { ok: false, reason: "That code is incorrect. Try again." };
  }

  store.delete(identifier); // one-time use — burn the receipt
  return { ok: true };
}