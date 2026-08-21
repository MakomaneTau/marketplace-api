export function sendData(res, data, { status = 200, meta } = {}) {
  const body = { data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function sendError(
  res,
  { status = 500, code = "INTERNAL_SERVER_ERROR", message, details }
) {
  const error = {
    code,
    message: message || "An unexpected error occurred.",
  };

  if (details !== undefined) error.details = details;
  if (res.locals?.requestId) error.request_id = res.locals.requestId;

  return res.status(status).json({ error });
}
