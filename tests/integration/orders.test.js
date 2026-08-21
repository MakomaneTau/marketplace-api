import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({ getUserFromAccessToken: vi.fn() }));
vi.mock("../../src/services/orders.service.js", () => {
  class OrderServiceError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }
  return { OrderServiceError, listBuyerOrders: vi.fn(), listSellerOrders: vi.fn(), getOrder: vi.fn(), createOrder: vi.fn(), transitionOrder: vi.fn() };
});

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import * as ordersService from "../../src/services/orders.service.js";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const PRODUCT_ID = "223e4567-e89b-42d3-a456-426614174000";
const ORDER_ID = "323e4567-e89b-42d3-a456-426614174000";
const CAMPUS_ID = "423e4567-e89b-42d3-a456-426614174000";
const user = { id: USER_ID, email: "buyer@example.com" };
const order = { id: ORDER_ID, buyer_id: USER_ID, status: "new", total_amount: 250 };
function authenticate() { getUserFromAccessToken.mockResolvedValue({ user, error: null }); }

describe("orders API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/orders")).status).toBe(401);
  });

  it("creates an atomic campus-pickup order", async () => {
    authenticate();
    const input = { items: [{ productId: PRODUCT_ID, quantity: 1 }], fulfilmentType: "campus_pickup", pickupCampusId: CAMPUS_ID };
    ordersService.createOrder.mockResolvedValue(order);
    const response = await request(app).post("/api/v1/orders").set("Authorization", "Bearer token").send(input);
    expect(response.status).toBe(201);
    expect(ordersService.createOrder).toHaveBeenCalledWith(USER_ID, input);
  });

  it("rejects duplicate cart products before checkout", async () => {
    authenticate();
    const response = await request(app).post("/api/v1/orders").set("Authorization", "Bearer token").send({
      items: [{ productId: PRODUCT_ID, quantity: 1 }, { productId: PRODUCT_ID, quantity: 2 }], fulfilmentType: "delivery", deliveryAddress: "1 Main Road",
    });
    expect(response.status).toBe(400);
    expect(ordersService.createOrder).not.toHaveBeenCalled();
  });

  it("lists buyer orders with filters", async () => {
    authenticate();
    ordersService.listBuyerOrders.mockResolvedValue({ orders: [order], page: 1, limit: 10, total: 1, totalPages: 1 });
    const response = await request(app).get("/api/v1/orders?status=new&limit=10").set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(1);
  });

  it("lists seller orders separately", async () => {
    authenticate();
    ordersService.listSellerOrders.mockResolvedValue({ orders: [order], page: 1, limit: 24, total: 1, totalPages: 1 });
    const response = await request(app).get("/api/v1/seller/orders").set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(ordersService.listSellerOrders).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ page: 1 }));
  });

  it("returns an order to a participant", async () => {
    authenticate(); ordersService.getOrder.mockResolvedValue(order);
    const response = await request(app).get(`/api/v1/orders/${ORDER_ID}`).set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
  });

  it("requests a controlled status transition", async () => {
    authenticate(); ordersService.transitionOrder.mockResolvedValue({ ...order, status: "cancelled" });
    const response = await request(app).patch(`/api/v1/orders/${ORDER_ID}/status`).set("Authorization", "Bearer token").send({ status: "cancelled" });
    expect(response.status).toBe(200);
    expect(ordersService.transitionOrder).toHaveBeenCalledWith(ORDER_ID, USER_ID, "cancelled");
  });
});
