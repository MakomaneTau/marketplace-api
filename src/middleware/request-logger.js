export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    if (process.env.NODE_ENV === "test") return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      JSON.stringify({
        level: "info",
        event: "http_request",
        request_id: res.locals.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
      })
    );
  });

  next();
}
