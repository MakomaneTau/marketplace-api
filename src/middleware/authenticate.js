import { getUserFromAccessToken } from "../services/auth.service.js";
import { parseBearerToken } from "../validators/auth.validator.js";

function sendUnauthorized(res, code, message) {
  return res.status(401).json({
    error: {
      code,
      message,
    },
  });
}

export async function authenticate(req, res, next) {
  const { token, error: headerError } = parseBearerToken(
    req.get("authorization")
  );

  if (headerError === "missing") {
    return sendUnauthorized(
      res,
      "AUTH_TOKEN_MISSING",
      "A bearer access token is required."
    );
  }

  if (headerError === "malformed") {
    return sendUnauthorized(
      res,
      "AUTH_TOKEN_MALFORMED",
      "The Authorization header must use the Bearer scheme."
    );
  }

  try {
    const { user, error } = await getUserFromAccessToken(token);

    if (error || !user) {
      return sendUnauthorized(
        res,
        "AUTH_TOKEN_INVALID",
        "The access token is invalid or expired."
      );
    }

    req.user = user;
    return next();
  } catch {
    return res.status(503).json({
      error: {
        code: "AUTH_SERVICE_UNAVAILABLE",
        message: "Authentication is temporarily unavailable.",
      },
    });
  }
}
