import { getUserFromAccessToken } from "../services/auth.service.js";
import { parseBearerToken } from "../validators/auth.validator.js";
import { sendError } from "../http/responses.js";
import { mutationRateLimit } from "./rate-limit.js";

function sendUnauthorized(res, code, message) {
  return sendError(res, { status: 401, code, message });
}

export async function authenticate(req, res, next) {
  const { token, error: headerError } = parseBearerToken(
    req.get("authorization"),
  );

  if (headerError === "missing") {
    return sendUnauthorized(
      res,
      "AUTH_TOKEN_MISSING",
      "A bearer access token is required.",
    );
  }

  if (headerError === "malformed") {
    return sendUnauthorized(
      res,
      "AUTH_TOKEN_MALFORMED",
      "The Authorization header must use the Bearer scheme.",
    );
  }

  try {
    const { user, error } = await getUserFromAccessToken(token);

    if (error?.code === "ACCOUNT_SUSPENDED") {
      return sendError(res, {
        status: 403,
        code: error.code,
        message: error.message,
      });
    }
    if (error || !user) {
      return sendUnauthorized(
        res,
        "AUTH_TOKEN_INVALID",
        "The access token is invalid or expired.",
      );
    }

    req.user = user;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
      return mutationRateLimit(req, res, next);
    return next();
  } catch {
    return sendError(res, {
      status: 503,
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Authentication is temporarily unavailable.",
    });
  }
}
