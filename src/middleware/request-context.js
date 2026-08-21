import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function requestContext(req, res, next) {
  const suppliedRequestId = req.get("x-request-id");
  const requestId = REQUEST_ID_PATTERN.test(suppliedRequestId || "")
    ? suppliedRequestId
    : randomUUID();

  res.locals.requestId = requestId;
  res.set("X-Request-Id", requestId);
  next();
}
