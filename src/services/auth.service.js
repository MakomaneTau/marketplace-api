import { supabaseAuth } from "../config/supabase-auth.js";
import { supabaseAdmin } from "../config/supabase.js";
import { resolveUniversityId, updateProfile } from "./profile.service.js";

export class AuthServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AuthServiceError";
    this.status = status;
    this.code = code;
  }
}

function authError(error, fallbackCode = "AUTH_SERVICE_UNAVAILABLE") {
  const code = error?.error_code ?? error?.code;

  if (code === "invalid_credentials") {
    return new AuthServiceError(401, "AUTH_CREDENTIALS_INVALID", "Email or password is incorrect.");
  }
  if (code === "email_not_confirmed") {
    return new AuthServiceError(403, "AUTH_EMAIL_NOT_CONFIRMED", "Confirm your email before signing in. Check your inbox and spam folder for the verification email.");
  }
  if (code === "user_already_exists") {
    return new AuthServiceError(409, "AUTH_EMAIL_IN_USE", "An account already exists for this email address.");
  }
  if (code === "weak_password") {
    return new AuthServiceError(400, "AUTH_PASSWORD_WEAK", "Choose a stronger password that meets the password requirements.");
  }
  if (code === "same_password") {
    return new AuthServiceError(422, "AUTH_PASSWORD_UNCHANGED", "Your new password must be different from your current password.");
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    error?.status === 429
  ) {
    return new AuthServiceError(429, "AUTH_RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
  }
  if (
    new Set([
      "bad_jwt",
      "no_authorization",
      "otp_expired",
      "flow_state_expired",
      "flow_state_not_found",
      "reauthentication_needed",
      "reauthentication_not_valid",
    ]).has(code) ||
    error?.status === 401 ||
    error?.status === 403
  ) {
    return new AuthServiceError(401, "AUTH_TOKEN_INVALID", "This password reset link is invalid or has expired.");
  }
  if (error?.status === 400 || error?.status === 422) {
    return new AuthServiceError(400, "AUTH_REQUEST_INVALID", "The authentication request could not be completed.");
  }
  return new AuthServiceError(503, fallbackCode, "Authentication is temporarily unavailable.");
}

function sessionDto(data) {
  return {
    user: data.user,
    session: data.session
      ? {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
          expiresIn: data.session.expires_in,
          tokenType: data.session.token_type,
        }
      : null,
  };
}

export async function getUserFromAccessToken(accessToken) {
  const { data, error } = await supabaseAuth.auth.getUser(accessToken);

  return {
    user: data?.user ?? null,
    error,
  };
}

export async function signup(input) {
  if (input.universitySlug) await resolveUniversityId(input.universitySlug);

  const { data, error } = await supabaseAuth.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        display_name: `${input.firstName.trim()} ${input.lastName.trim()}`,
        role: input.role,
        isStudent: input.role === "buyer" || input.isStudent === true,
      },
    },
  });

  if (error || !data.user) throw authError(error);

  try {
    await updateProfile(data.user.id, {
      universitySlug: input.universitySlug ?? null,
    });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    if (error?.code === "UNIVERSITY_REFERENCE_INVALID") throw error;
    throw authError(error);
  }

  return sessionDto(data);
}

export async function login({ email, password }) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) throw authError(error);
  return sessionDto(data);
}

export async function refresh(refreshToken) {
  const { data, error } = await supabaseAuth.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.user || !data.session) {
    throw new AuthServiceError(
      401,
      "AUTH_REFRESH_TOKEN_INVALID",
      "The refresh token is invalid or expired."
    );
  }
  return sessionDto(data);
}

async function authApiRequest(path, { token, method = "POST", body } = {}) {
  let response;
  try {
    response = await fetch(`${process.env.SUPABASE_URL}/auth/v1${path}`, {
      method,
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw authError(null);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw authError({ ...payload, status: response.status });
  }

  return payload;
}

export async function logout(accessToken) {
  await authApiRequest("/logout?scope=global", { token: accessToken });
}

export async function requestPasswordReset(email) {
  const options = process.env.PASSWORD_RESET_REDIRECT_URL
    ? { redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL }
    : undefined;
  const { error } = await supabaseAuth.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    options
  );
  if (error) throw authError(error);
}

export async function resetPassword(accessToken, password) {
  await authApiRequest("/user", {
    token: accessToken,
    method: "PUT",
    body: { password },
  });
}
