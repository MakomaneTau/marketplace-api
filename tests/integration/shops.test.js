import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({ getUserFromAccessToken: vi.fn() }));
vi.mock("../../src/services/shops.service.js", () => {
  class ShopServiceError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }
  return {
    ShopServiceError,
    getPublicShop: vi.fn(),
    getSellerShop: vi.fn(),
    createShop: vi.fn(),
    updateShop: vi.fn(),
    replacePickupAreas: vi.fn(),
    updateShopImage: vi.fn(),
  };
});

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import * as shopsService from "../../src/services/shops.service.js";

const seller = { id: "123e4567-e89b-42d3-a456-426614174000", email: "seller@example.com" };
const shop = { id: "223e4567-e89b-42d3-a456-426614174000", name: "Campus Store", slug: "campus-store", is_open: false, pickup_areas: [] };
const campusId = "323e4567-e89b-42d3-a456-426614174000";

function authenticate() { getUserFromAccessToken.mockResolvedValue({ user: seller, error: null }); }

describe("shops API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an open public shop by slug", async () => {
    shopsService.getPublicShop.mockResolvedValue({ ...shop, is_open: true });
    const response = await request(app).get("/api/v1/shops/campus-store");
    expect(response.status).toBe(200);
    expect(response.body.data.slug).toBe("campus-store");
  });

  it("requires authentication for the seller shop", async () => {
    const response = await request(app).get("/api/v1/seller/shop");
    expect(response.status).toBe(401);
  });

  it("creates one seller shop", async () => {
    authenticate();
    shopsService.createShop.mockResolvedValue(shop);
    const input = { name: "Campus Store", tagline: "Student essentials", isOpen: false };
    const response = await request(app).post("/api/v1/seller/shop").set("Authorization", "Bearer token").send(input);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: shop });
    expect(shopsService.createShop).toHaveBeenCalledWith(seller.id, input);
  });

  it("updates seller-managed shop fields", async () => {
    authenticate();
    shopsService.updateShop.mockResolvedValue({ ...shop, is_open: true });
    const response = await request(app).patch("/api/v1/seller/shop").set("Authorization", "Bearer token").send({ isOpen: true });
    expect(response.status).toBe(200);
    expect(shopsService.updateShop).toHaveBeenCalledWith(seller.id, { isOpen: true });
  });

  it("atomically replaces pickup campuses", async () => {
    authenticate();
    shopsService.replacePickupAreas.mockResolvedValue(shop);
    const response = await request(app).put("/api/v1/seller/shop/pickup-areas").set("Authorization", "Bearer token").send({ campusIds: [campusId] });
    expect(response.status).toBe(200);
    expect(shopsService.replacePickupAreas).toHaveBeenCalledWith(seller.id, [campusId]);
  });

  it("rejects duplicate pickup campuses", async () => {
    authenticate();
    const response = await request(app).put("/api/v1/seller/shop/pickup-areas").set("Authorization", "Bearer token").send({ campusIds: [campusId, campusId] });
    expect(response.status).toBe(400);
    expect(shopsService.replacePickupAreas).not.toHaveBeenCalled();
  });
});
