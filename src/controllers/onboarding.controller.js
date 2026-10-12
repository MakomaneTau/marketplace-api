import { sendData, sendError } from "../http/responses.js";
import * as onboardingService from "../services/onboarding.service.js";

function handleError(res, error) {
  return sendError(res, {
    status:
      error instanceof onboardingService.OnboardingServiceError
        ? error.status
        : 500,
    code: error.code || "INTERNAL_SERVER_ERROR",
    message: error.message || "Unexpected error.",
  });
}

export async function getOnboarding(req, res) {
  try {
    return sendData(res, await onboardingService.getOnboarding(req.user.id));
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateOnboarding(req, res) {
  const input = req.body || {};
  const allowedFields = new Set(["welcomeSeen", "dismissed"]);
  const errors = [];

  if (!Object.keys(input).length)
    errors.push({
      field: "body",
      message: "must contain an onboarding preference",
    });
  for (const [field, value] of Object.entries(input)) {
    if (!allowedFields.has(field))
      errors.push({ field, message: "is not allowed" });
    else if (typeof value !== "boolean")
      errors.push({ field, message: "must be boolean" });
    else if (field === "welcomeSeen" && value === false)
      errors.push({ field, message: "cannot be reset" });
  }

  if (errors.length) {
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid onboarding data.",
      details: errors,
    });
  }

  try {
    return sendData(
      res,
      await onboardingService.updateOnboarding(req.user.id, input),
    );
  } catch (error) {
    return handleError(res, error);
  }
}
