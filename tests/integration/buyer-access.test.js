import { beforeEach, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
}));
vi.mock("../../src/services/profile.service.js", () => ({
  getProfile: vi.fn(),
}));
vi.mock("../../src/services/admin.service.js", () => ({ isAdmin: vi.fn() }));

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import { getProfile } from "../../src/services/profile.service.js";
import { isAdmin } from "../../src/services/admin.service.js";

beforeEach(() => {
  vi.resetAllMocks();
  getUserFromAccessToken.mockResolvedValue({
    user: { id: "user" },
    error: null,
  });
});

const endpoints = [
  ["post", "/orders"],
  ["get", "/orders"],
  ["get", "/orders/order"],
  ["patch", "/orders/order/status"],
  ["get", "/favourites"],
  ["put", "/favourites/product"],
  ["delete", "/favourites/product"],
  ["post", "/conversations"],
  ["post", "/orders/order/reviews"],
];

it.each(endpoints)(
  "blocks sellers and admins from %s %s before processing input",
  async (method, path) => {
    for (const [role, admin] of [
      ["seller", false],
      ["buyer", true],
      ["seller", true],
    ]) {
      getProfile.mockResolvedValue({ role });
      isAdmin.mockResolvedValue(admin);
      const client = request(app);
      const response = await client[method](`/api/v1${path}`).set(
        "Authorization",
        "Bearer token",
      );
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("BUYER_REQUIRED");
    }
  },
);

it("fails closed when membership cannot be checked", async () => {
  getProfile.mockResolvedValue({ role: "buyer" });
  isAdmin.mockRejectedValue(new Error("offline"));
  const response = await request(app)
    .post("/api/v1/orders")
    .set("Authorization", "Bearer token");
  expect(response.status).toBe(503);
});
