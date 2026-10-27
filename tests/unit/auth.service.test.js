import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "http://127.0.0.1:55321";
  process.env.SUPABASE_PUBLISHABLE_KEY ||= "test-publishable-key";
});

vi.mock("../../src/config/supabase-auth.js", () => ({
  supabaseAuth: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      refreshSession: mocks.refreshSession,
      getUser: mocks.getUser,
    },
  },
}));

vi.mock("../../src/config/supabase.js", () => ({
  supabaseAdmin: {
    auth: { admin: { deleteUser: mocks.deleteUser } },
    from: mocks.from,
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
  refresh,
  logout,
  getUserFromAccessToken,
} from "../../src/services/auth.service.js";
import {
  resolveUniversityId,
  updateProfile,
} from "../../src/services/profile.service.js";

let restrictions;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.deleteUser.mockResolvedValue({});
  restrictions = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  mocks.from.mockReturnValue(restrictions);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const user = { id: "account-123", email: "buyer@example.com" };
const session = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  expires_at: 2_000_000_000,
  expires_in: 3600,
  token_type: "bearer",
};
const expectedSession = {
  user,
  session: {
    accessToken: "new-access-token",
    refreshToken: "new-refresh-token",
    expiresAt: 2_000_000_000,
    expiresIn: 3600,
    tokenType: "bearer",
  },
};

describe("login and refresh sessions", () => {
  it("normalizes the email and returns the complete session for an active account", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user, session } });

    await expect(
      login({ email: "  Buyer@EXAMPLE.COM  ", password: "Password123!" }),
    ).resolves.toEqual(expectedSession);

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "buyer@example.com",
      password: "Password123!",
    });
    expect(mocks.from).toHaveBeenCalledWith("account_restrictions");
    expect(restrictions.eq).toHaveBeenCalledWith("user_id", user.id);
  });

  it("rotates the supplied refresh token and returns the replacement session", async () => {
    mocks.refreshSession.mockResolvedValue({ data: { user, session } });

    await expect(refresh("old-refresh-token")).resolves.toEqual(
      expectedSession,
    );

    expect(mocks.refreshSession).toHaveBeenCalledWith({
      refresh_token: "old-refresh-token",
    });
    expect(restrictions.eq).toHaveBeenCalledWith("user_id", user.id);
  });

  it.each([
    { data: {}, error: { code: "refresh_token_not_found" } },
    { data: { user, session: null }, error: null },
    { data: { user: null, session }, error: null },
  ])("rejects incomplete or invalid refresh results: %j", async (result) => {
    mocks.refreshSession.mockResolvedValue(result);

    await expectAuthError(refresh("old-refresh-token"), {
      status: 401,
      code: "AUTH_REFRESH_TOKEN_INVALID",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ["login", () => login({ email: user.email, password: "Password123!" })],
    ["refresh", () => refresh("old-refresh-token")],
  ])(
    "does not issue a %s session for a suspended account",
    async (_name, action) => {
      mocks.signInWithPassword.mockResolvedValue({ data: { user, session } });
      mocks.refreshSession.mockResolvedValue({ data: { user, session } });
      restrictions.maybeSingle.mockResolvedValue({
        data: { user_id: user.id },
      });

      await expectAuthError(action(), {
        status: 403,
        code: "ACCOUNT_SUSPENDED",
      });
    },
  );

  it.each([
    ["login", () => login({ email: user.email, password: "Password123!" })],
    ["refresh", () => refresh("old-refresh-token")],
  ])(
    "fails closed when account restrictions cannot be checked during %s",
    async (_name, action) => {
      mocks.signInWithPassword.mockResolvedValue({ data: { user, session } });
      mocks.refreshSession.mockResolvedValue({ data: { user, session } });
      restrictions.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: "database unavailable" },
      });

      await expectAuthError(action(), {
        status: 503,
        code: "AUTH_SERVICE_UNAVAILABLE",
      });
    },
  );

  it("maps invalid credentials without leaking provider messages or checking restrictions", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: {
        code: "invalid_credentials",
        message: "private provider detail",
      },
    });

    await expectAuthError(
      login({ email: user.email, password: "wrong-password" }),
      {
        status: 401,
        code: "AUTH_CREDENTIALS_INVALID",
        message: "Email or password is incorrect.",
      },
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("verified access-token lookup", () => {
  it("returns the verified user after checking account restrictions", async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(getUserFromAccessToken("access-token")).resolves.toEqual({
      user,
      error: null,
    });
    expect(mocks.getUser).toHaveBeenCalledWith("access-token");
    expect(restrictions.eq).toHaveBeenCalledWith("user_id", user.id);
  });

  it.each([
    { data: { user: null }, error: { code: "bad_jwt" } },
    { data: null, error: null },
  ])(
    "rejects an unverified user without a privileged database lookup: %j",
    async (result) => {
      mocks.getUser.mockResolvedValue(result);

      await expect(getUserFromAccessToken("invalid-token")).resolves.toEqual({
        user: null,
        error: result.error,
      });
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("rejects a suspended user even when Auth accepts the token", async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    restrictions.maybeSingle.mockResolvedValue({ data: { user_id: user.id } });

    await expect(getUserFromAccessToken("access-token")).resolves.toMatchObject(
      {
        user: null,
        error: { status: 403, code: "ACCOUNT_SUSPENDED" },
      },
    );
  });

  it("fails closed if the restriction lookup is unavailable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    restrictions.maybeSingle.mockResolvedValue({ error: { code: "08006" } });

    await expectAuthError(getUserFromAccessToken("access-token"), {
      status: 503,
      code: "AUTH_SERVICE_UNAVAILABLE",
    });
  });
});

describe("unconfirmed email login", () => {
  it("explains verification instead of returning a generic authentication error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "email_not_confirmed", status: 400 },
    });
    await expect(
      login({ email: "pending@example.com", password: "Password123!" }),
    ).rejects.toMatchObject({
      status: 403,
      code: "AUTH_EMAIL_NOT_CONFIRMED",
      message: expect.stringContaining("Confirm your email"),
    });
  });
});

describe("signup without student numbers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteUser.mockResolvedValue({});
  });

  it.each(["buyer", "seller"])(
    "preserves the %s university without requiring student fields",
    async (role) => {
      mocks.signUp.mockResolvedValue({
        data: { user: { id: "new-user" }, session: null },
        error: null,
      });
      await signup({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "Password123!",
        role,
        universitySlug: "test-university",
      });
      expect(resolveUniversityId).toHaveBeenCalledWith("test-university");
      expect(updateProfile).toHaveBeenCalledWith("new-user", {
        universitySlug: "test-university",
      });
      const metadata = mocks.signUp.mock.calls[0][0].options.data;
      expect(metadata.isStudent).toBe(false);
      expect(metadata).not.toHaveProperty("studentNumber");
    },
  );

  it("allows a seller to omit university", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    await signup({
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      password: "Password123!",
      role: "seller",
    });
    expect(resolveUniversityId).not.toHaveBeenCalled();
    expect(updateProfile).toHaveBeenCalledWith("new-user", {
      universitySlug: null,
    });
  });

  it("reports profile trigger failures without presenting them as Supabase Auth signup failures", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    updateProfile.mockRejectedValue(
      Object.assign(new Error("Profile not found."), {
        name: "ProfileServiceError",
        status: 404,
        code: "PROFILE_NOT_FOUND",
      }),
    );

    await expectAuthError(
      signup({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "Password123!",
        role: "buyer",
      }),
      {
        status: 503,
        code: "AUTH_PROFILE_SYNC_FAILED",
        message: expect.stringContaining("profile setup"),
      },
    );
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("does not create an Auth account when the university lookup fails", async () => {
    resolveUniversityId.mockRejectedValue(new Error("database unavailable"));

    await expectAuthError(
      signup({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "Password123!",
        role: "buyer",
        universitySlug: "missing-university",
      }),
      { status: 503, code: "AUTH_SERVICE_UNAVAILABLE" },
    );
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("does not update a profile when the email is already registered", async () => {
    mocks.signUp.mockResolvedValue({
      data: {},
      error: { code: "user_already_exists", message: "provider detail" },
    });

    await expectAuthError(
      signup({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "Password123!",
        role: "buyer",
      }),
      { status: 409, code: "AUTH_EMAIL_IN_USE" },
    );
    expect(updateProfile).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("preserves the profile failure when account cleanup also fails", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    updateProfile.mockRejectedValue({ code: "PROFILE_NOT_FOUND" });
    mocks.deleteUser.mockRejectedValue(new Error("cleanup unavailable"));

    await expectAuthError(
      signup({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "Password123!",
        role: "buyer",
      }),
      { status: 503, code: "AUTH_PROFILE_SYNC_FAILED" },
    );
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
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

describe("global logout", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("revokes all sessions using the caller's access token", async () => {
    fetch.mockResolvedValue(authResponse(204));

    await expect(logout("access-token")).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:55321/auth/v1/logout?scope=global",
      expect.objectContaining({
        method: "POST",
        headers: {
          apikey: "test-publishable-key",
          authorization: "Bearer access-token",
        },
        body: undefined,
      }),
    );
  });

  it("maps an expired access token to a safe authentication error", async () => {
    fetch.mockResolvedValue(authResponse(401, { error_code: "bad_jwt" }));

    await expectAuthError(logout("expired-token"), {
      status: 401,
      code: "AUTH_TOKEN_INVALID",
    });
  });

  it("reports service failure when the provider returns a non-JSON error", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: vi.fn().mockResolvedValue("<html>private gateway error</html>"),
    });

    await expectAuthError(logout("access-token"), {
      status: 503,
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Authentication is temporarily unavailable.",
    });
  });
});

describe("password recovery errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("explains when the new password matches the current password", async () => {
    fetch.mockResolvedValue(
      authResponse(422, {
        code: 422,
        error_code: "same_password",
        msg: "New password should be different from the old password.",
      }),
    );

    await expectAuthError(resetPassword("recovery-token", "Password123!"), {
      status: 422,
      code: "AUTH_PASSWORD_UNCHANGED",
      message:
        "Your new password must be different from your current password.",
    });
  });

  it("maps weak passwords without exposing provider details", async () => {
    fetch.mockResolvedValue(
      authResponse(422, {
        error_code: "weak_password",
        msg: "provider-specific password details",
      }),
    );

    await expectAuthError(resetPassword("recovery-token", "password"), {
      status: 400,
      code: "AUTH_PASSWORD_WEAK",
      message:
        "Choose a stronger password that meets the password requirements.",
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

    await expect(
      resetPassword("recovery-token", "Password123!"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:55321/auth/v1/user",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ password: "Password123!" }),
      }),
    );
  });

  it("uses the shared authentication error type", () => {
    expect(new AuthServiceError(400, "CODE", "message")).toBeInstanceOf(Error);
  });
});
