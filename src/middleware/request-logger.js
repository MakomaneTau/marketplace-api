import { config } from "../config/env.js";
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    if (config.nodeEnv === "test") return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      JSON.stringify({
        level: "info",
        event: "http_request",
        request_id: res.locals.requestId,
        method: req.method,
        path: req.originalUrl.split("?", 1)[0],
        status: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
      }),
    );
  });

  next();
}
