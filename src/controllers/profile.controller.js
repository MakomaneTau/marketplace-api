import { sendData, sendError } from "../http/responses.js";
import * as profileService from "../services/profile.service.js";
import { validateProfileUpdate } from "../validators/profile.validator.js";

function handleError(res, error) {
  if (error instanceof profileService.ProfileServiceError) {
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
}

export async function getProfile(req, res) {
  try {
    return sendData(res, await profileService.getProfile(req.user.id));
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateProfile(req, res) {
  const errors = validateProfileUpdate(req.body);
  if (errors.length) {
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "The request contains invalid profile data.",
      details: errors,
    });
  }

  try {
    return sendData(res, await profileService.updateProfile(req.user.id, req.body));
  } catch (error) {
    return handleError(res, error);
  }
}
