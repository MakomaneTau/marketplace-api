import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({ getUserFromAccessToken: vi.fn() }));
vi.mock("../../src/services/favourites.service.js", () => {
  class FavouriteServiceError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }
  return { FavouriteServiceError, listFavourites: vi.fn(), saveFavourite: vi.fn(), removeFavourite: vi.fn() };
});

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import * as favouritesService from "../../src/services/favourites.service.js";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const PRODUCT_ID = "223e4567-e89b-42d3-a456-426614174000";
const user = { id: USER_ID, email: "buyer@example.com" };

function authenticate() { getUserFromAccessToken.mockResolvedValue({ user, error: null }); }

describe("favourites API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/favourites");
    expect(response.status).toBe(401);
  });

  it("lists paginated saved products", async () => {
    authenticate();
    favouritesService.listFavourites.mockResolvedValue({ products: [{ id: PRODUCT_ID }], total: 1, totalPages: 1 });
    const response = await request(app).get("/api/v1/favourites?limit=10").set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(favouritesService.listFavourites).toHaveBeenCalledWith(USER_ID, { page: 1, limit: 10 });
  });

  it("idempotently saves a public product", async () => {
    authenticate();
    favouritesService.saveFavourite.mockResolvedValue({ productId: PRODUCT_ID, saved: true });
    const response = await request(app).put(`/api/v1/favourites/${PRODUCT_ID}`).set("Authorization", "Bearer token");
    expect(response.status).toBe(200);
    expect(favouritesService.saveFavourite).toHaveBeenCalledWith(USER_ID, PRODUCT_ID);
  });

  it("removes a saved product", async () => {
    authenticate();
    const response = await request(app).delete(`/api/v1/favourites/${PRODUCT_ID}`).set("Authorization", "Bearer token");
    expect(response.status).toBe(204);
    expect(favouritesService.removeFavourite).toHaveBeenCalledWith(USER_ID, PRODUCT_ID);
  });

  it("rejects invalid product IDs", async () => {
    authenticate();
    const response = await request(app).put("/api/v1/favourites/not-a-uuid").set("Authorization", "Bearer token");
    expect(response.status).toBe(400);
    expect(favouritesService.saveFavourite).not.toHaveBeenCalled();
  });
});
