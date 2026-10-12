import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
}));
vi.mock("../../src/services/onboarding.service.js", () => {
  class OnboardingServiceError extends Error {
    constructor() {
      super("down");
      this.status = 503;
      this.code = "ONBOARDING_UNAVAILABLE";
    }
  }
  return {
    OnboardingServiceError,
    getOnboarding: vi.fn(),
    updateOnboarding: vi.fn(),
  };
});

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import * as onboardingService from "../../src/services/onboarding.service.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";

describe("onboarding API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserFromAccessToken.mockResolvedValue({
      user: { id: userId },
      error: null,
    });
  });

  it("returns role-aware onboarding progress", async () => {
    onboardingService.getOnboarding.mockResolvedValue({
      version: 1,
      role: "buyer",
      welcomeSeen: false,
      dismissed: false,
      steps: { campus: false, favourite: false, message: false, order: false },
    });

    const response = await request(app)
      .get("/api/v1/onboarding")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe("buyer");
    expect(onboardingService.getOnboarding).toHaveBeenCalledWith(userId);
  });

  it("updates supported onboarding preferences", async () => {
    onboardingService.updateOnboarding.mockResolvedValue({
      welcomeSeen: true,
      dismissed: false,
    });

    const response = await request(app)
      .patch("/api/v1/onboarding")
      .set("Authorization", "Bearer token")
      .send({ welcomeSeen: true, dismissed: false });

    expect(response.status).toBe(200);
    expect(onboardingService.updateOnboarding).toHaveBeenCalledWith(userId, {
      welcomeSeen: true,
      dismissed: false,
    });
  });

  it("rejects unknown and invalid fields", async () => {
    const response = await request(app)
      .patch("/api/v1/onboarding")
      .set("Authorization", "Bearer token")
      .send({ role: "seller", welcomeSeen: false });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(onboardingService.updateOnboarding).not.toHaveBeenCalled();
  });
});
