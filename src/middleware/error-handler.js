import { ApiError } from "../errors/api-error.js";
import { sendError } from "../http/responses.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error?.type === "entity.parse.failed") {
    return sendError(res, {
      status: 400,
      code: "INVALID_JSON",
      message: "The request body must contain valid JSON.",
    });
  }

  if (error instanceof ApiError) {
    return sendError(res, {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (process.env.NODE_ENV !== "test") {
    console.error(
      JSON.stringify({
        level: "error",
        event: "unhandled_error",
        request_id: res.locals.requestId,
        message: error?.message || "Unknown error",
      })
    );
  }

  return sendError(res, {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  });
}
