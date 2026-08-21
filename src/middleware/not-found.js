import { sendError } from "../http/responses.js";

export function notFound(req, res) {
  return sendError(res, {
    status: 404,
    code: "ROUTE_NOT_FOUND",
    message: "The requested API route does not exist.",
  });
}
