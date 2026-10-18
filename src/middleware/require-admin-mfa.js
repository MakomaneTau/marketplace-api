import { sendError } from "../http/responses.js";

export function requireAdminMfa(req, res, next) {
  if (
    req.authAssurance === "aal2" &&
    (req.user.factors || []).some(
      (factor) => factor.factor_type === "totp" && factor.status === "verified",
    )
  )
    return next();
  return sendError(res, {
    status: 403,
    code: "ADMIN_MFA_REQUIRED",
    message: "Verify your authenticator code to use admin tools.",
  });
}
