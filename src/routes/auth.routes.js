// src/routes/auth.routes.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import { config, isDemoMode } from "../config/index.js";
import { createOtp, verifyOtp } from "../services/otp.js";
import { sendEmail, isEmailConfigured } from "../services/notify.js";
import { findUserByIdentifier } from "../repositories.js";

const router = Router();

function looksLikeEmail(identifier) {
  return /\S+@\S+\.\S+/.test(identifier);
}

// POST /api/auth/request-otp   { identifier }  (identifier = email OR phone)
router.post("/request-otp", async (req, res) => {
  const identifier = req.body?.identifier || req.body?.email || req.body?.phone;
  if (!identifier) {
    return res.status(400).json({ success: false, message: "Email (or phone number) is required." });
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    // Don't reveal whether an identifier is registered in a real system, but for
    // this hackathon demo a clear message is more useful than a fake success.
    return res.status(404).json({ success: false, message: "No account found for that email or phone number." });
  }

  const { code } = createOtp(identifier, config);

  // Try to actually deliver the code by email. If the identifier isn't an
  // email, or SMTP isn't configured, or the send fails for any reason, we
  // fall through to showing the code directly in the response instead —
  // that's what keeps this working with zero setup (pure demo mode).
  let delivered = false;
  if (looksLikeEmail(identifier) && isEmailConfigured()) {
    const result = await sendEmail(
      identifier,
      "Your Islington Student Services verification code",
      `Your verification code is ${code}.\n\nThis code expires in ${config.otpTtlMinutes} minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore this email.`
    );
    delivered = result.sent;
  }

  res.json({
    success: true,
    message: delivered
      ? "A verification code has been sent to your email. Check your inbox (and spam folder)."
      : `Demo mode: use ${code} as the verification code.`,
    // Only ever included when we could NOT actually deliver the code —
    // once real email is confirmed working, this is never sent to the browser.
    demoCode: delivered ? undefined : code,
  });
});

// POST /api/auth/verify-otp   { identifier, code }
router.post("/verify-otp", async (req, res) => {
  const identifier = req.body?.identifier || req.body?.email || req.body?.phone;
  const { code } = req.body || {};
  if (!identifier || !code) {
    return res.status(400).json({ success: false, message: "Email (or phone number) and code are required." });
  }

  const result = verifyOtp(identifier, code, config);
  if (!result.ok) {
    return res.status(401).json({ success: false, message: result.reason });
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    return res.status(404).json({ success: false, message: "No account found for that email or phone number." });
  }

  const token = jwt.sign({ sub: user.id, phone: user.phone, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  res.json({
    success: true,
    token,
    user: { id: user.id, name: user.name, role: user.role, phone: user.phone, email: user.email },
    demoMode: isDemoMode,
  });
});

export default router;
