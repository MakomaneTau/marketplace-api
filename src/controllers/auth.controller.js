import { createServiceErrorHandler } from "../http/service-error.js";
import { sendData, sendError } from "../http/responses.js";
import * as authService from "../services/auth.service.js";
import * as profileService from "../services/profile.service.js";
import { AdminServiceError, isAdmin } from "../services/admin.service.js";
import {
  parseBearerToken,
  validateForgotPassword,
  validateLogin,
  validateRefresh,
  validateResetPassword,
  validateSignup,
} from "../validators/auth.validator.js";

function validationError(res, details) {
  return sendError(res, {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "The request contains invalid account data.",
    details,
  });
}

const handleError = createServiceErrorHandler(
  (error) =>
    error instanceof authService.AuthServiceError ||
    error instanceof profileService.ProfileServiceError ||
    error instanceof AdminServiceError,
);

export async function getCurrentUser(req, res) {
  try {
    const profile = await profileService.getProfile(req.user.id);
    return sendData(res, {
      user: req.user,
      profile: { ...profile, isAdmin: await isAdmin(req.user.id) },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function signup(req, res) {
  const errors = validateSignup(req.body);
  if (errors.length) return validationError(res, errors);
  try {
    return sendData(res, await authService.signup(req.body), { status: 201 });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function login(req, res) {
  const errors = validateLogin(req.body);
  if (errors.length) return validationError(res, errors);
  try {
    const result = await authService.login(req.body);
    if (req.body.role && !(await isAdmin(result.user.id))) {
      await profileService.switchRole(result.user.id, req.body.role);
    }
    return sendData(res, result);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function switchRole(req, res) {
  const input = req.body;
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => key !== "role") ||
    !["buyer", "seller"].includes(input.role)
  ) {
    return validationError(res, [
      { field: "role", message: "must be buyer or seller" },
    ]);
  }
  try {
    const profile = await profileService.switchRole(req.user.id, input.role);
    return sendData(res, {
      user: req.user,
      profile: { ...profile, isAdmin: false },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function refresh(req, res) {
  const errors = validateRefresh(req.body);
  if (errors.length) return validationError(res, errors);
  try {
    return sendData(res, await authService.refresh(req.body.refreshToken));
  } catch (error) {
    return handleError(res, error);
  }
}

export async function logout(req, res) {
  const { token } = parseBearerToken(req.get("authorization"));
  try {
    await authService.logout(token);
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
}

export async function forgotPassword(req, res) {
  const errors = validateForgotPassword(req.body);
  if (errors.length) return validationError(res, errors);
  try {
    await authService.requestPasswordReset(req.body.email);
    return sendData(
      res,
      {
        message:
          "If an account exists, password reset instructions have been sent.",
      },
      { status: 202 },
    );
  } catch (error) {
    return handleError(res, error);
  }
}

export async function resetPassword(req, res) {
  const errors = validateResetPassword(req.body);
  if (errors.length) return validationError(res, errors);
  const { token } = parseBearerToken(req.get("authorization"));
  try {
    await authService.resetPassword(token, req.body.password);
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
}
