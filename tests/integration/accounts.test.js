import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => {
  class AuthServiceError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    AuthServiceError,
    getUserFromAccessToken: vi.fn(),
    signup: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  };
});

vi.mock("../../src/services/profile.service.js", () => {
  class ProfileServiceError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ProfileServiceError,
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    switchRole: vi.fn(),
  };
});

vi.mock("../../src/services/admin.service.js", () => ({ isAdmin: vi.fn() }));

import app from "../../src/app.js";
import * as authService from "../../src/services/auth.service.js";
import * as profileService from "../../src/services/profile.service.js";
import * as adminService from "../../src/services/admin.service.js";

const user = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  email: "buyer@example.com",
};
const profile = {
  id: user.id,
  firstName: "Test",
  lastName: "Buyer",
  role: "buyer",
  isStudent: true,
};
const session = {
  user,
  session: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: 123456,
  },
};

function authenticate() {
  authService.getUserFromAccessToken.mockResolvedValue({ user, error: null });
}

describe("account API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a buyer account with a university and no student number", async () => {
    authService.signup.mockResolvedValue(session);
    const input = {
      firstName: "Test",
      lastName: "Buyer",
      email: "buyer@example.com",
      password: "SecurePassword123!",
      role: "buyer",
      universitySlug: "university-of-the-witwatersrand",
    };

    const response = await request(app).post("/api/v1/auth/signup").send(input);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: session });
    expect(authService.signup).toHaveBeenCalledWith(input);
  });

  it("creates a non-student buyer without a university", async () => {
    authService.signup.mockResolvedValue(session);
    const response = await request(app).post("/api/v1/auth/signup").send({
      firstName: "Test",
      lastName: "Buyer",
      email: "buyer@example.com",
      password: "SecurePassword123!",
      role: "buyer",
      isStudent: false,
    });

    expect(response.status).toBe(201);
    expect(authService.signup).toHaveBeenCalled();
  });

  it.each([undefined, "university-of-the-witwatersrand"])(
    "creates a seller without student fields (university: %s)",
    async (universitySlug) => {
      authService.signup.mockResolvedValue(session);
      const input = {
        firstName: "Test",
        lastName: "Seller",
        email: "seller@example.com",
        password: "SecurePassword123!",
        role: "seller",
        universitySlug,
      };
      const response = await request(app)
        .post("/api/v1/auth/signup")
        .send(input);
      expect(response.status).toBe(201);
      expect(authService.signup).toHaveBeenCalled();
    },
  );

  it("allows buyers to omit university", async () => {
    authService.signup.mockResolvedValue(session);
    const response = await request(app).post("/api/v1/auth/signup").send({
      firstName: "Test",
      lastName: "Buyer",
      email: "buyer@example.com",
      password: "SecurePassword123!",
      role: "buyer",
    });
    expect(response.status).toBe(201);
    expect(authService.signup).toHaveBeenCalled();
  });

  it("returns a session for valid login credentials", async () => {
    authService.login.mockResolvedValue(session);

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "buyer@example.com",
      password: "SecurePassword123!",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: session });
  });

  it("maps invalid credentials to a stable error", async () => {
    authService.login.mockRejectedValue(
      new authService.AuthServiceError(
        401,
        "AUTH_CREDENTIALS_INVALID",
        "Email or password is incorrect.",
      ),
    );

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "buyer@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_CREDENTIALS_INVALID");
  });

  it("returns the authenticated user and marketplace profile", async () => {
    authenticate();
    profileService.getProfile.mockResolvedValue(profile);
    adminService.isAdmin.mockResolvedValue(false);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { user, profile: { ...profile, isAdmin: false } },
    });
  });

  it("updates allowed profile fields", async () => {
    authenticate();
    const updated = { ...profile, displayName: "Updated Buyer" };
    profileService.updateProfile.mockResolvedValue(updated);

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Authorization", "Bearer access-token")
      .send({ displayName: "Updated Buyer" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: updated });
    expect(profileService.updateProfile).toHaveBeenCalledWith(user.id, {
      displayName: "Updated Buyer",
    });
  });

  it("rejects attempts to update managed profile state", async () => {
    authenticate();

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Authorization", "Bearer access-token")
      .send({ role: "seller", verificationStatus: "verified", rating: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(profileService.updateProfile).not.toHaveBeenCalled();
  });

  it("uses an enumeration-safe password-reset response", async () => {
    authService.requestPasswordReset.mockResolvedValue();

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "buyer@example.com" });

    expect(response.status).toBe(202);
    expect(response.body.data.message).toContain("If an account exists");
  });

  it("returns a stable rate-limit error for repeated reset requests", async () => {
    authService.requestPasswordReset.mockRejectedValue(
      new authService.AuthServiceError(
        429,
        "AUTH_RATE_LIMITED",
        "Too many requests. Please wait a moment and try again.",
      ),
    );

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "buyer@example.com" });

    expect(response.status).toBe(429);
    expect(response.body.error).toMatchObject({
      code: "AUTH_RATE_LIMITED",
      message: "Too many requests. Please wait a moment and try again.",
    });
  });

  it("updates a password with a recovery access token", async () => {
    authenticate();
    authService.resetPassword.mockResolvedValue();

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .set("Authorization", "Bearer recovery-token")
      .send({ password: "NewPassword123!" });

    expect(response.status).toBe(204);
    expect(authService.resetPassword).toHaveBeenCalledWith(
      "recovery-token",
      "NewPassword123!",
    );
  });

  it("explains when a replacement password has not changed", async () => {
    authenticate();
    authService.resetPassword.mockRejectedValue(
      new authService.AuthServiceError(
        422,
        "AUTH_PASSWORD_UNCHANGED",
        "Your new password must be different from your current password.",
      ),
    );

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .set("Authorization", "Bearer recovery-token")
      .send({ password: "CurrentPassword123!" });

    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: "AUTH_PASSWORD_UNCHANGED",
      message:
        "Your new password must be different from your current password.",
    });
  });
});

describe("marketplace mode endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminService.isAdmin.mockResolvedValue(false);
    authenticate();
  });
  it.each(["buyer", "seller"])(
    "signs in to %s mode after authentication",
    async (role) => {
      authService.login.mockResolvedValue(session);
      const result = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: "Password123!", role });
      expect(result.status).toBe(200);
      expect(profileService.switchRole).toHaveBeenCalledWith(user.id, role);
    },
  );
  it("keeps admin login in the admin experience", async () => {
    authService.login.mockResolvedValue(session);
    adminService.isAdmin.mockResolvedValue(true);
    const result = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "Password123!", role: "seller" });
    expect(result.status).toBe(200);
    expect(profileService.switchRole).not.toHaveBeenCalled();
  });
  it("switches only the authenticated account and returns its authoritative profile", async () => {
    profileService.switchRole.mockResolvedValue({ ...profile, role: "seller" });
    const result = await request(app)
      .post("/api/v1/auth/switch-role")
      .set("Authorization", "Bearer access-token")
      .send({ role: "seller" });
    expect(result.status).toBe(200);
    expect(profileService.switchRole).toHaveBeenCalledWith(user.id, "seller");
    expect(result.body.data.profile.role).toBe("seller");
  });
  it.each([
    { role: "admin" },
    { role: "seller", userId: "someone-else" },
    {},
    [],
  ])("rejects invalid or privileged mode changes %j", async (body) => {
    const result = await request(app)
      .post("/api/v1/auth/switch-role")
      .set("Authorization", "Bearer access-token")
      .send(body);
    expect(result.status).toBe(400);
    expect(profileService.switchRole).not.toHaveBeenCalled();
  });
  it("requires a session", async () => {
    const result = await request(app)
      .post("/api/v1/auth/switch-role")
      .send({ role: "seller" });
    expect(result.status).toBe(401);
    expect(profileService.switchRole).not.toHaveBeenCalled();
  });
});
