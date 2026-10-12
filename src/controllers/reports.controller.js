import * as reportsService from "../services/reports.service.js";
import { createServiceErrorHandler } from "../http/service-error.js";

const handleError = createServiceErrorHandler(
  (error) => error instanceof reportsService.ReportServiceError,
);
import { sendData, sendError } from "../http/responses.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function submitReport(req, res) {
  const { category, details, subjectUserId, productId } = req.body || {};
  const errors = [];
  if (
    Object.keys(req.body || {}).some(
      (key) =>
        !["category", "details", "subjectUserId", "productId"].includes(key),
    )
  )
    errors.push({ field: "body", message: "contains unsupported fields" });
  if (!["scam", "harassment", "unsafe_listing", "other"].includes(category))
    errors.push({ field: "category", message: "is invalid" });
  if (
    typeof details !== "string" ||
    details.trim().length < 20 ||
    details.trim().length > 2000
  )
    errors.push({ field: "details", message: "must be 20-2000 characters" });
  if (subjectUserId && !uuid.test(subjectUserId))
    errors.push({ field: "subjectUserId", message: "must be a user ID" });
  if (productId && !uuid.test(productId))
    errors.push({ field: "productId", message: "must be a product ID" });
  if (subjectUserId === req.user.id)
    errors.push({
      field: "subjectUserId",
      message: "cannot be your own account",
    });
  if (errors.length)
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid safety report.",
      details: errors,
    });

  try {
    return sendData(
      res,
      await reportsService.submitReport(req.user.id, {
        category,
        details,
        subjectUserId,
        productId,
      }),
      { status: 201 },
    );
  } catch (error) {
    return handleError(res, error);
  }
}

export async function myReports(req, res) {
  try {
    return sendData(res, await reportsService.myReports(req.user.id));
  } catch (error) {
    return handleError(res, error);
  }
}
