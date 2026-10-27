import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("../../src/config/supabase.js", () => ({ supabaseAdmin: db }));
vi.mock("../../src/services/auth.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getUserFromAccessToken: vi.fn(),
}));
vi.mock("../../src/services/profile.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getProfile: vi.fn(),
}));
vi.mock("../../src/services/admin.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  isAdmin: vi.fn(),
}));

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import { getProfile } from "../../src/services/profile.service.js";
import { isAdmin } from "../../src/services/admin.service.js";

const buyerId = "123e4567-e89b-42d3-a456-426614174000";
const productId = "223e4567-e89b-42d3-a456-426614174000";
const orderId = "323e4567-e89b-42d3-a456-426614174000";
const campusId = "423e4567-e89b-42d3-a456-426614174000";
const order = {
  id: orderId,
  buyer_id: buyerId,
  shop_id: "shop-1",
  status: "new",
  total_amount: 250,
};
const checkout = {
  items: [{ productId, quantity: 2 }],
  fulfilmentType: "campus_pickup",
  pickupCampusId: campusId,
};

function query(result) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

describe("order HTTP routes through the real order service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUserFromAccessToken.mockResolvedValue({
      user: { id: buyerId },
      error: null,
    });
    getProfile.mockResolvedValue({ role: "buyer" });
    isAdmin.mockResolvedValue(false);
    db.rpc.mockResolvedValue({ data: orderId, error: null });
    db.from.mockReturnValue(query({ data: order, error: null }));
  });

  it("validates checkout, creates the order through the RPC, and returns persisted pricing", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", "Bearer buyer-token")
      .send(checkout);

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(order);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("create_marketplace_order", {
      p_buyer_id: buyerId,
      p_items: [{ product_id: productId, quantity: 2 }],
      p_fulfilment_type: "campus_pickup",
      p_pickup_campus_id: campusId,
      p_delivery_address: null,
      p_pickup_notes: null,
    });
    expect(getUserFromAccessToken).toHaveBeenCalledWith("buyer-token");
  });

  it.each([
    ["ORDER_PRODUCT_UNAVAILABLE", 409],
    ["SELLER_APPROVAL_REQUIRED", 409],
    ["ORDER_OWN_SHOP_FORBIDDEN", 400],
    ["ORDER_SINGLE_SHOP_REQUIRED", 400],
  ])(
    "preserves %s across the database, service and HTTP boundaries",
    async (code, status) => {
      db.rpc.mockResolvedValue({
        data: null,
        error: { code: "P0001", message: code },
      });
      const response = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", "Bearer buyer-token")
        .send(checkout);

      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
      expect(response.body.error.request_id).toEqual(expect.any(String));
      expect(db.from).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["buyerId", "someone-else"],
    ["totalAmount", 0],
    ["items", [{ productId, quantity: 1, unitPrice: 0 }]],
  ])(
    "rejects manipulated %s before reaching the database",
    async (field, value) => {
      const response = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", "Bearer buyer-token")
        .send({ ...checkout, [field]: value });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toEqual(expect.any(Array));
      expect(db.rpc).not.toHaveBeenCalled();
      expect(db.from).not.toHaveBeenCalled();
    },
  );

  it("rejects anonymous checkout before auth/profile/database calls", async () => {
    const response = await request(app).post("/api/v1/orders").send(checkout);

    expect(response.status).toBe(401);
    expect(getUserFromAccessToken).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each(["seller", "admin"])(
    "denies checkout in %s mode before the order RPC",
    async (mode) => {
      getProfile.mockResolvedValue({
        role: mode === "seller" ? "seller" : "buyer",
      });
      isAdmin.mockResolvedValue(mode === "admin");
      const response = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", "Bearer actor-token")
        .send(checkout);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("BUYER_REQUIRED");
      expect(db.rpc).not.toHaveBeenCalled();
    },
  );

  it("denies an unrelated account access to a persisted order", async () => {
    getUserFromAccessToken.mockResolvedValue({
      user: { id: "unrelated-user" },
      error: null,
    });
    db.from
      .mockReturnValueOnce(query({ data: order, error: null }))
      .mockReturnValueOnce(query({ data: { id: "other-shop" }, error: null }));
    const response = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", "Bearer other-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORDER_ACCESS_FORBIDDEN");
    expect(response.body.data).toBeUndefined();
  });

  it("returns the updated persisted order after a valid cancellation", async () => {
    db.from.mockReturnValue(
      query({ data: { ...order, status: "cancelled" }, error: null }),
    );
    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", "Bearer buyer-token")
      .send({ status: "cancelled" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
      "transition_marketplace_order",
      { p_order_id: orderId, p_actor_id: buyerId, p_status: "cancelled" },
    );
  });

  it("preserves an invalid transition conflict without loading any order", async () => {
    db.rpc.mockResolvedValue({
      error: { message: "ORDER_STATUS_TRANSITION_INVALID" },
    });
    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set("Authorization", "Bearer buyer-token")
      .send({ status: "completed" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ORDER_STATUS_TRANSITION_INVALID");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("masks unrecognized database details at the HTTP boundary", async () => {
    db.rpc.mockResolvedValue({
      error: {
        message: "connection failed for private database role postgres",
      },
    });
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", "Bearer buyer-token")
      .send(checkout);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("ORDER_SERVICE_UNAVAILABLE");
    expect(response.text).not.toMatch(/private|postgres|connection failed/);
  });
});
