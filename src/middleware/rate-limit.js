import { config } from "../config/env.js";
import { createHash } from "node:crypto";
import { sendError } from "../http/responses.js";
import { createSharedRateLimiter } from "./shared-rate-limit.js";

export function createRateLimiter({
  windowMs = 60_000,
  requestLimit = 120,
  now = Date.now,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || "unknown",
  maxEntries = 10_000,
} = {}) {
  const windows = new Map();
  let nextSweepAt = 0;
  return (req, res, next) => {
    const timestamp = now();
    // Expire inactive clients too, so a long-running process does not retain
    // every IP address it has ever served.
    if (timestamp >= nextSweepAt) {
      for (const [key, window] of windows)
        if (window.resetAt <= timestamp) windows.delete(key);
      nextSweepAt = timestamp + windowMs;
    }
    const key = keyGenerator(req);
    let current = windows.get(key);
    if (!current || current.resetAt <= timestamp) {
      // Fail closed at capacity instead of letting random identities exhaust memory.
      if (!current && windows.size >= maxEntries) {
        res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
        return sendError(res, {
          status: 429,
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        });
      }
      current = { count: 0, resetAt: timestamp + windowMs };
      windows.set(key, current);
    }
    current.count += 1;
    res.set(
      "RateLimit-Remaining",
      String(Math.max(0, requestLimit - current.count)),
    );
    res.set("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));
    if (current.count > requestLimit) {
      res.set(
        "Retry-After",
        String(Math.ceil((current.resetAt - timestamp) / 1000)),
      );
      return sendError(res, {
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
      });
    }
    return next();
  };
}

export function createAuthRateLimiter(options = {}) {
  return createRateLimiter({
    windowMs: 15 * 60_000,
    requestLimit: 10,
    keyGenerator(req) {
      const email =
        typeof req.body?.email === "string"
          ? req.body.email.trim().toLowerCase().slice(0, 320)
          : "";
      const identity = email || req.ip || "unknown";
      return `${req.path}:${createHash("sha256").update(identity).digest("hex")}`;
    },
    ...options,
  });
}

// Account-based limits still work when all browser traffic comes through the BFF.
function withSharedLimit(local, options) {
  const shared = createSharedRateLimiter(options);
  return (req, res, next) => local(req, res, () => shared(req, res, next));
}

export const authRateLimit = withSharedLimit(createAuthRateLimiter(), {
  namespace: "auth",
  windowMs: 15 * 60_000,
  requestLimit: 10,
  keyGenerator: (req) =>
    `${req.path}:${typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 320) : req.ip}`,
});
const mutationOptions = {
  namespace: "mutation",
  windowMs: 60_000,
  requestLimit: 30,
  keyGenerator: (req) => req.user.id,
};
export const mutationRateLimit = withSharedLimit(
  createRateLimiter(mutationOptions),
  mutationOptions,
);
const uploadOptions = {
  namespace: "upload",
  windowMs: 60_000,
  requestLimit: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
};
export const uploadRateLimit = withSharedLimit(
  createRateLimiter(uploadOptions),
  uploadOptions,
);

const limiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  requestLimit: config.rateLimitMax,
});
export function rateLimit(req, res, next) {
  if (config.nodeEnv === "test") return next();
  return limiter(req, res, next);
}
