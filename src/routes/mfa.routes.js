import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireAdmin } from "../services/admin.service.js";
import { authApiRequest } from "../services/auth.service.js";
import { sendData, sendError } from "../http/responses.js";

const router = Router();
router.use(authenticate, async (req, _res, next) => {
  await requireAdmin(req.user.id);
  next();
});
const token = (req) => req.get("authorization").slice(7).trim();
const verifiedFactors = (req) =>
  (req.user.factors || []).filter(
    (factor) => factor.status === "verified" && factor.factor_type === "totp",
  );

router.get("/status", (req, res) =>
  sendData(res, {
    verified: req.authAssurance === "aal2",
    factors: verifiedFactors(req).map(({ id, friendly_name }) => ({
      id,
      name: friendly_name || "Authenticator",
    })),
  }),
);

router.post("/enroll", async (req, res) => {
  if (verifiedFactors(req).length)
    return sendError(res, {
      status: 409,
      code: "MFA_ALREADY_ENROLLED",
      message:
        "Use your existing authenticator. Contact the account owner if you have lost access.",
    });
  // Restarting incomplete setup cannot delete a verified factor.
  for (const factor of req.user.factors || []) {
    if (factor.status === "unverified" && factor.factor_type === "totp")
      await authApiRequest(`/factors/${encodeURIComponent(factor.id)}`, {
        token: token(req),
        method: "DELETE",
      });
  }
  const factor = await authApiRequest("/factors", {
    token: token(req),
    body: {
      factor_type: "totp",
      friendly_name: "MarketPal admin",
      issuer: "MarketPal",
    },
  });
  return sendData(res, { id: factor.id, secret: factor.totp.secret });
});

router.post("/verify", async (req, res) => {
  const { factorId, code } = req.body || {};
  if (
    typeof factorId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(factorId) ||
    typeof code !== "string" ||
    !/^\d{6}$/.test(code)
  )
    return sendError(res, {
      status: 400,
      code: "MFA_INPUT_INVALID",
      message: "Enter the six-digit code from your authenticator.",
    });
  if (
    !(req.user.factors || []).some(
      (factor) => factor.id === factorId && factor.factor_type === "totp",
    )
  )
    return sendError(res, {
      status: 403,
      code: "MFA_FACTOR_FORBIDDEN",
      message: "This authenticator does not belong to your account.",
    });
  const challenge = await authApiRequest(`/factors/${factorId}/challenge`, {
    token: token(req),
    body: {},
  });
  const session = await authApiRequest(`/factors/${factorId}/verify`, {
    token: token(req),
    body: { challenge_id: challenge.id, code },
  });
  return sendData(res, {
    session: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      expiresAt: Math.floor(Date.now() / 1000) + session.expires_in,
      tokenType: session.token_type,
    },
  });
});

export default router;
