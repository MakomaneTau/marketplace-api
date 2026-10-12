import { config } from "../config/env.js";
import { sendError } from "../http/responses.js";

export function createRateLimiter({
  windowMs = 60_000,
  requestLimit = 120,
  now = Date.now,
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
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let current = windows.get(key);
    if (!current || current.resetAt <= timestamp) {
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

const limiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  requestLimit: config.rateLimitMax,
});
export function rateLimit(req, res, next) {
  if (config.nodeEnv === "test") return next();
  return limiter(req, res, next);
}
