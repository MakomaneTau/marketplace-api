import { createHash } from "node:crypto";
import { config } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import { sendError } from "../http/responses.js";

export function createSharedRateLimiter({
  namespace,
  windowMs,
  requestLimit,
  keyGenerator,
  consume,
}) {
  const request =
    consume || ((args) => supabaseAdmin.rpc("consume_security_limit", args));
  return async (req, res, next) => {
    if (config.nodeEnv !== "production" && !consume) return next();
    try {
      const identity = String(keyGenerator(req));
      const { data, error } = await request({
        p_bucket: `${namespace}:${createHash("sha256").update(identity).digest("hex")}`,
        p_window_ms: windowMs,
        p_limit: requestLimit,
      });
      if (error || !data || typeof data.allowed !== "boolean")
        throw new Error("Limit store unavailable");
      res.set("RateLimit-Remaining", String(data.remaining));
      if (!data.allowed) {
        res.set("Retry-After", String(data.retryAfter));
        return sendError(res, {
          status: 429,
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        });
      }
      return next();
    } catch {
      return sendError(res, {
        status: 503,
        code: "SECURITY_SERVICE_UNAVAILABLE",
        message:
          "This action is temporarily unavailable. Please try again shortly.",
      });
    }
  };
}
