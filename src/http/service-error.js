import { sendError } from "./responses.js";

// Controllers expose only errors owned by their service dependencies. Unknown
// exceptions never leak implementation details into an HTTP response.
export function createServiceErrorHandler(isServiceError) {
  return (res, error) => {
    if (isServiceError(error)) {
      return sendError(res, {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }
    return sendError(res, {
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    });
  };
}
