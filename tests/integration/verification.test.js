import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
}));

vi.mock("../../src/services/verification.service.js", () => {
  class VerificationServiceError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    VerificationServiceError,
    getSellerVerification: vi.fn(),
    submitSellerVerification: vi.fn(),
  };
});

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import * as verificationService from "../../src/services/verification.service.js";

const seller = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  email: "seller@example.com",
};
const submission = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  status: "pending",
  rejectionReason: null,
};
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

function authenticateSeller() {
  getUserFromAccessToken.mockResolvedValue({ user: seller, error: null });
}

describe("seller verification API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/verifications/seller");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_TOKEN_MISSING");
  });

  it("returns the latest seller verification state", async () => {
    authenticateSeller();
    verificationService.getSellerVerification.mockResolvedValue(submission);

    const response = await request(app)
      .get("/api/v1/verifications/seller")
      .set("Authorization", "Bearer seller-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: submission });
  });

  it("requires both verification images", async () => {
    authenticateSeller();

    const response = await request(app)
      .post("/api/v1/verifications/seller")
      .set("Authorization", "Bearer seller-token")
      .attach("selfie", png, { filename: "selfie.png", contentType: "image/png" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VERIFICATION_FILES_REQUIRED");
    expect(verificationService.submitSellerVerification).not.toHaveBeenCalled();
  });

  it("submits bounded image uploads", async () => {
    authenticateSeller();
    verificationService.submitSellerVerification.mockResolvedValue(submission);

    const response = await request(app)
      .post("/api/v1/verifications/seller")
      .set("Authorization", "Bearer seller-token")
      .attach("selfie", png, { filename: "selfie.png", contentType: "image/png" })
      .attach("sellerId", png, { filename: "id.png", contentType: "image/png" });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body).toEqual({ data: submission });
    expect(verificationService.submitSellerVerification).toHaveBeenCalledWith(
      seller.id,
      expect.objectContaining({
        selfie: expect.objectContaining({ mimetype: "image/png" }),
        sellerId: expect.objectContaining({ mimetype: "image/png" }),
      })
    );
  });

  it("rejects unsupported upload types before the service", async () => {
    authenticateSeller();

    const response = await request(app)
      .post("/api/v1/verifications/seller")
      .set("Authorization", "Bearer seller-token")
      .attach("selfie", Buffer.from("text"), {
        filename: "selfie.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("IMAGE_UPLOAD_INVALID");
  });
});
