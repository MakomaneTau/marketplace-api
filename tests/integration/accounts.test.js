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
  };
});

import app from "../../src/app.js";
import * as authService from "../../src/services/auth.service.js";
import * as profileService from "../../src/services/profile.service.js";

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

  it("creates a student buyer account", async () => {
    authService.signup.mockResolvedValue(session);
    const input = {
      firstName: "Test",
      lastName: "Buyer",
      email: "buyer@example.com",
      password: "SecurePassword123!",
      role: "buyer",
      isStudent: true,
      universitySlug: "university-of-the-witwatersrand",
      studentNumber: "DEV-100",
    };

    const response = await request(app).post("/api/v1/auth/signup").send(input);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: session });
    expect(authService.signup).toHaveBeenCalledWith(input);
  });

  it("rejects a non-student buyer", async () => {
    const response = await request(app).post("/api/v1/auth/signup").send({
      firstName: "Test",
      lastName: "Buyer",
      email: "buyer@example.com",
      password: "SecurePassword123!",
      role: "buyer",
      isStudent: false,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(authService.signup).not.toHaveBeenCalled();
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
        "Email or password is incorrect."
      )
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

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { user, profile } });
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
});
