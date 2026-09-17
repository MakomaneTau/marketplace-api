import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY ||= "test-publishable-key";
});

vi.mock("../../src/config/supabase-auth.js", () => ({
  supabaseAuth: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
    },
  },
}));

vi.mock("../../src/config/supabase.js", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: mocks.getUserById,
        deleteUser: mocks.deleteUser,
      },
    },
  },
}));

vi.mock("../../src/services/profile.service.js", () => ({
  resolveUniversityId: vi.fn(),
  updateProfile: vi.fn(),
}));

import {
  AuthServiceError,
  requestPasswordReset,
  resetPassword,
  signup,
  login,
} from "../../src/services/auth.service.js";
import { resolveUniversityId, updateProfile } from "../../src/services/profile.service.js";

describe("unconfirmed email login", () => {
  it("explains verification instead of returning a generic authentication error", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "email_not_confirmed", status: 400 } });
    await expect(login({ email: "pending@example.com", password: "Password123!" })).rejects.toMatchObject({
      status: 403,
      code: "AUTH_EMAIL_NOT_CONFIRMED",
      message: expect.stringContaining("Confirm your email"),
    });
  });
});

describe("signup without student numbers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUserById.mockResolvedValue({
      data: { user: { id: "new-user" } },
      error: null,
    });
    mocks.deleteUser.mockResolvedValue({ data: {}, error: null });
  });

  it.each(["buyer", "seller"])("preserves the %s university without requiring student fields", async (role) => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "new-user" }, session: null }, error: null });
    await signup({ firstName: "Test", lastName: "User", email: "test@example.com", password: "Password123!", role, universitySlug: "test-university" });
    expect(resolveUniversityId).toHaveBeenCalledWith("test-university");
    expect(updateProfile).toHaveBeenCalledWith("new-user", { universitySlug: "test-university" });
    const metadata = mocks.signUp.mock.calls[0][0].options.data;
    expect(metadata.isStudent).toBe(role === "buyer");
    expect(metadata).not.toHaveProperty("studentNumber");
  });


  it("rejects an obfuscated signup response for an existing account", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "obfuscated-user" }, session: null },
      error: null,
    });
    mocks.getUserById.mockResolvedValue({
      data: { user: null },
      error: { status: 404, code: "user_not_found" },
    });

    await expect(signup({
      firstName: "Existing",
      lastName: "User",
      email: "existing@example.com",
      password: "Password123!",
      role: "buyer",
      universitySlug: "test-university",
    })).rejects.toMatchObject({
      status: 409,
      code: "AUTH_EMAIL_IN_USE",
    });

    expect(updateProfile).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("reports profile provisioning failures and rolls back the new auth user", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    updateProfile.mockRejectedValue({
      status: 404,
      code: "PROFILE_NOT_FOUND",
      message: "Profile not found.",
    });

    await expect(signup({
      firstName: "New",
      lastName: "User",
      email: "new@example.com",
      password: "Password123!",
      role: "buyer",
      universitySlug: "test-university",
    })).rejects.toMatchObject({
      status: 500,
      code: "AUTH_PROFILE_PROVISIONING_FAILED",
    });

    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("allows a seller to omit university", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "new-user" }, session: null }, error: null });
    await signup({ firstName: "Test", lastName: "User", email: "test@example.com", password: "Password123!", role: "seller" });
    expect(resolveUniversityId).not.toHaveBeenCalled();
    expect(updateProfile).toHaveBeenCalledWith("new-user", { universitySlug: null });
  });
});

function authResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(payload ? JSON.stringify(payload) : ""),
  };
}

async function expectAuthError(promise, expected) {
  await expect(promise).rejects.toMatchObject({
    name: "AuthServiceError",
    ...expected,
  });
}

describe("password recovery errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("explains when the new password matches the current password", async () => {
    fetch.mockResolvedValue(authResponse(422, {
      code: 422,
      error_code: "same_password",
      msg: "New password should be different from the old password.",
    }));

    await expectAuthError(resetPassword("recovery-token", "Password123!"), {
      status: 422,
      code: "AUTH_PASSWORD_UNCHANGED",
      message: "Your new password must be different from your current password.",
    });
  });

  it("maps weak passwords without exposing provider details", async () => {
    fetch.mockResolvedValue(authResponse(422, {
      error_code: "weak_password",
      msg: "provider-specific password details",
    }));

    await expectAuthError(resetPassword("recovery-token", "password"), {
      status: 400,
      code: "AUTH_PASSWORD_WEAK",
      message: "Choose a stronger password that meets the password requirements.",
    });
  });

  it.each([
    "bad_jwt",
    "otp_expired",
    "flow_state_expired",
    "reauthentication_not_valid",
  ])("maps %s to an invalid recovery link", async (errorCode) => {
    fetch.mockResolvedValue(authResponse(401, { error_code: errorCode }));

    await expectAuthError(resetPassword("recovery-token", "Password123!"), {
      status: 401,
      code: "AUTH_TOKEN_INVALID",
      message: "This password reset link is invalid or has expired.",
    });
  });

  it("maps provider rate limits to a retryable response", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });

    await expectAuthError(requestPasswordReset("buyer@example.com"), {
      status: 429,
      code: "AUTH_RATE_LIMITED",
      message: "Too many requests. Please wait a moment and try again.",
    });
  });

  it("maps network failures to service unavailable", async () => {
    fetch.mockRejectedValue(new TypeError("fetch failed"));

    await expectAuthError(resetPassword("recovery-token", "Password123!"), {
      status: 503,
      code: "AUTH_SERVICE_UNAVAILABLE",
    });
  });

  it("accepts a successful password update with an empty response", async () => {
    fetch.mockResolvedValue(authResponse(204));

    await expect(resetPassword("recovery-token", "Password123!")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:54321/auth/v1/user",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ password: "Password123!" }),
      })
    );
  });

  it("uses the shared authentication error type", () => {
    expect(new AuthServiceError(400, "CODE", "message")).toBeInstanceOf(Error);
  });
});
