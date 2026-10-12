import { createServiceErrorHandler } from "../http/service-error.js";
import * as insightsService from "../services/insights.service.js";
import { sendData, sendError } from "../http/responses.js";
const fail = createServiceErrorHandler(
  (error) => error instanceof insightsService.InsightServiceError,
);
export async function dashboard(req, res) {
  try {
    return sendData(res, await insightsService.dashboard(req.user.id));
  } catch (e) {
    return fail(res, e);
  }
}
export async function analytics(req, res) {
  const days = req.query.days ? Number(req.query.days) : 30;
  if (
    Object.keys(req.query).some((k) => k !== "days") ||
    ![7, 30, 90, 365].includes(days)
  )
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "days must be 7, 30, 90, or 365.",
    });
  try {
    return sendData(res, await insightsService.analytics(req.user.id, days));
  } catch (e) {
    return fail(res, e);
  }
}
