import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
  authApiRequest: vi.fn(),
}));
vi.mock("../../src/services/admin.service.js", () => ({
  requireAdmin: vi.fn(),
}));
import router from "../../src/routes/mfa.routes.js";
import {
  getUserFromAccessToken,
  authApiRequest,
} from "../../src/services/auth.service.js";
import { requireAdmin } from "../../src/services/admin.service.js";
const factorId = "33333333-3333-4333-8333-333333333333";
const user = {
  id: "mfa-test-user",
  factors: [{ id: factorId, status: "verified", factor_type: "totp" }],
};
const app = express();
app.use(express.json());
app.use(router);
describe("admin authenticator flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserFromAccessToken.mockResolvedValue({ user, error: null });
    requireAdmin.mockResolvedValue();
  });
  it("requires authentication", async () => {
    expect((await request(app).get("/status")).status).toBe(401);
  });
  it("does not treat an enrolled factor as a verified session", async () => {
    const response = await request(app)
      .get("/status")
      .set("Authorization", "Bearer password-only");
    expect(response.body.data.verified).toBe(false);
    expect(response.body.data.factors[0].id).toBe(factorId);
  });
  it("does not permit password-only replacement of an existing factor", async () => {
    expect(
      (
        await request(app)
          .post("/enroll")
          .set("Authorization", "Bearer password-only")
      ).status,
    ).toBe(409);
    expect(authApiRequest).not.toHaveBeenCalled();
  });
  it("rejects another account's factor before challenging", async () => {
    expect(
      (
        await request(app)
          .post("/verify")
          .set("Authorization", "Bearer password-only")
          .send({
            factorId: "44444444-4444-4444-8444-444444444444",
            code: "123456",
          })
      ).status,
    ).toBe(403);
    expect(authApiRequest).not.toHaveBeenCalled();
  });
  it("exchanges a valid challenge for an upgraded session", async () => {
    authApiRequest
      .mockResolvedValueOnce({ id: "challenge" })
      .mockResolvedValueOnce({
        access_token: "upgraded",
        refresh_token: "rotated",
        expires_in: 3600,
        token_type: "bearer",
      });
    const response = await request(app)
      .post("/verify")
      .set("Authorization", "Bearer password-only")
      .send({ factorId, code: "123456" });
    expect(response.status).toBe(200);
    expect(response.body.data.session.accessToken).toBe("upgraded");
    expect(authApiRequest.mock.calls[1][1].body).toEqual({
      challenge_id: "challenge",
      code: "123456",
    });
  });
});
