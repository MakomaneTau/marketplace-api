import { createServiceErrorHandler } from "../http/service-error.js";
import * as settingsService from "../services/settings.service.js";
import { sendData, sendError } from "../http/responses.js";
import { validateUpdateSettings } from "../validators/settings.validator.js";
const fail = createServiceErrorHandler(
  (error) => error instanceof settingsService.SettingsServiceError,
);
export async function getSettings(req, res) {
  try {
    return sendData(res, await settingsService.getSettings(req.user.id));
  } catch (e) {
    return fail(res, e);
  }
}
export async function updateSettings(req, res) {
  const input = req.body || {};
  const errors = validateUpdateSettings(input);
  if (errors.length)
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid settings data.",
      details: errors,
    });
  try {
    return sendData(
      res,
      await settingsService.updateSettings(req.user.id, input),
    );
  } catch (e) {
    return fail(res, e);
  }
}
