import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("../../src/services/admin.service.js", () => {
  class AdminServiceError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    AdminServiceError,
    requireAdmin: vi.fn(),
    overview: vi.fn(),
    listUsers: vi.fn(),
    setRestriction: vi.fn(),
    listReports: vi.fn(),
    decideReport: vi.fn(),
    listVerifications: vi.fn(),
    verificationImages: vi.fn(),
    reviewVerification: vi.fn(),
  };
});

import app from "../../src/app.js";
import * as authService from "../../src/services/auth.service.js";
import * as adminService from "../../src/services/admin.service.js";

const id = "33333333-3333-4333-8333-333333333332";
const target = "33333333-3333-4333-8333-333333333333";

describe("admin API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authService.getUserFromAccessToken.mockResolvedValue({
      user: { id },
      error: null,
    });
    adminService.requireAdmin.mockResolvedValue();
  });

  it("requires an access token", async () => {
    const response = await request(app).get("/api/v1/admin/overview");
    expect(response.status).toBe(401);
    expect(adminService.requireAdmin).not.toHaveBeenCalled();
  });

  it("rejects suspended accounts before checking admin membership", async () => {
    authService.getUserFromAccessToken.mockResolvedValue({
      user: null,
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "This account has been suspended.",
      },
    });
    const response = await request(app)
      .get("/api/v1/admin/overview")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_SUSPENDED");
    expect(adminService.requireAdmin).not.toHaveBeenCalled();
  });

  it("rejects non-admin accounts", async () => {
    adminService.requireAdmin.mockRejectedValue(
      new adminService.AdminServiceError(
        403,
        "ADMIN_REQUIRED",
        "Admin access is required.",
      ),
    );
    const response = await request(app)
      .get("/api/v1/admin/overview")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ADMIN_REQUIRED");
    expect(adminService.overview).not.toHaveBeenCalled();
  });

  it("returns an overview to a verified admin", async () => {
    const overview = {
      buyers: 10,
      sellers: 3,
      suspended: 1,
      openReports: 2,
      pendingVerifications: 4,
    };
    adminService.overview.mockResolvedValue(overview);
    const response = await request(app)
      .get("/api/v1/admin/overview")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: overview });
  });

  it("allows admins to request resolved verification history", async () => {
    const history = { verifications: [], total: 0, page: 1, limit: 20 };
    adminService.listVerifications.mockResolvedValue(history);
    const response = await request(app)
      .get("/api/v1/admin/verifications?status=resolved")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(history);
    expect(adminService.listVerifications).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      status: "resolved",
    });
  });

  it("rejects invalid list filters", async () => {
    const response = await request(app)
      .get("/api/v1/admin/users?role=admin")
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(400);
    expect(adminService.listUsers).not.toHaveBeenCalled();
  });

  it("requires a documented reason for suspension", async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/users/${target}/restriction`)
      .set("Authorization", "Bearer token")
      .send({ suspended: true, reason: "bad" });
    expect(response.status).toBe(400);
    expect(adminService.setRestriction).not.toHaveBeenCalled();
  });

  it("records a validated suspension request for the acting admin", async () => {
    const reason = "Repeated unsafe conduct reported by users";
    const response = await request(app)
      .patch(`/api/v1/admin/users/${target}/restriction`)
      .set("Authorization", "Bearer token")
      .send({ suspended: true, reason });
    expect(response.status).toBe(200);
    expect(adminService.setRestriction).toHaveBeenCalledWith(
      id,
      target,
      true,
      reason,
    );
  });
});
