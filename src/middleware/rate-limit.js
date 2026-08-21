const windows = new Map();

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const windowMs = positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
const requestLimit = positiveInteger(process.env.RATE_LIMIT_MAX, 120);

export function rateLimit(req, res, next) {
  if (process.env.NODE_ENV === "test") return next();

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    res.set("RateLimit-Remaining", String(requestLimit - 1));
    res.set("RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
    return next();
  }

  current.count += 1;
  const remaining = Math.max(0, requestLimit - current.count);
  res.set("RateLimit-Remaining", String(remaining));
  res.set("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));

  if (current.count > requestLimit) {
    res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
    return res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
        request_id: res.locals.requestId,
      },
    });
  }

  return next();
}
