// auth.js — the "bouncer" middleware for JWT
// ----------
// HOW IT WORKS (plain words):
//   A parent logs in by phone + OTP. The server checks that and hands back a
//   JWT — think of it as a stamped ticket. For the rest of the session the
//   parent sends that ticket in the `Authorization` header with every
//   request:  Authorization: Bearer <the-stamp>
//
//   This file is the BOUNCER at the club door. Every request passes through
//   `requireAuth` first, which:
//     1. Looks for the ticket in the header.
//     2. Verifies the stamp is authentic (not forged) using the secret.
//     3. Reads who it belongs to (user id + role) and sticks them on
//        req.user so the rest of the app knows "who is asking".
//
//   If any of that fails -> 401 "you're not logged in" and we turn them away.

import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

/**
 * Bouncer #1: "Are you even holding a valid ticket?"
 * Runs BEFORE every protected route.
 *
 * On success it sets req.user = { id, phone, role } and calls next().
 * On failure it sends 401 and STOPS here (route never runs).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";

  // Expected format: "Bearer eyJhbGciOi..." — if there's no space,
  // there's no token, so no ticket = no entry. Turn them away politely.
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "You are not logged in. Add Authorization: Bearer <token>",
      code: "NO_TOKEN",
    });
  }

  try {
    // Verify = check the signature + expiry with our secret. If someone
    // forged the token, or it's expired, this throws and we catch it below.
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.sub,
      phone: payload.phone,
      role: payload.role,
    };
    next();
  } catch (err) {
    const expired = err.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      message: expired
        ? "Your session has expired. Please log in again."
        : "This login token is not valid.",
      code: expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
}

/**
 * Bouncer #2: "You have a ticket — but do you have the RIGHT kind?"
 *
 * Usage:  router.get("/clearance", requireAuth, allowRoles("parent"), handler)
 * Rules:
 *   - 'parent'    -> can ONLY see children they are linked to (self-only)
 *   - 'ssd_staff' -> sees ALL students (no links needed, role is enough)
 *
 * If the user's role isn't in the allowed list -> 403 "not allowed".
 */
export function allowRoles(...roles) {
  return function rbac(req, res, next) {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Your role is not allowed to do this.",
        code: "ROLE_FORBIDDEN",
        data: { yourRole: req.user.role, allowedRoles: roles },
      });
    }
    next();
  };
}