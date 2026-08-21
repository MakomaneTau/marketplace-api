import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
}));

vi.mock("../../src/services/products.service.js", () => {
  class ProductServiceError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ProductServiceError,
    listProducts: vi.fn(),
    getProduct: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
  };
});

import app from "../../src/app.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import * as productsService from "../../src/services/products.service.js";

const PRODUCT_ID = "123e4567-e89b-42d3-a456-426614174000";
const SHOP_ID = "223e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "323e4567-e89b-42d3-a456-426614174000";
const SELLER = { id: "423e4567-e89b-42d3-a456-426614174000", email: "seller@example.com" };

const product = {
  id: PRODUCT_ID,
  shop_id: SHOP_ID,
  category_id: CATEGORY_ID,
  title: "Calculus textbook",
  description: "A clean copy with only a few pencil notes.",
  condition: "good",
  price: 250,
  currency: "ZAR",
  stock_quantity: 1,
  image_urls: ["https://example.com/book.jpg"],
  pickup_location: "Main campus library",
  allows_campus_pickup: true,
  allows_delivery: false,
  status: "active",
};

function authenticateSeller() {
  getUserFromAccessToken.mockResolvedValue({ user: SELLER, error: null });
}

describe("products API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets public users list active products", async () => {
    productsService.listProducts.mockResolvedValue([product]);

    const response = await request(app).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [product] });
    expect(productsService.listProducts).toHaveBeenCalledOnce();
    expect(getUserFromAccessToken).not.toHaveBeenCalled();
  });

  it("lets public users read an active product", async () => {
    productsService.getProduct.mockResolvedValue(product);

    const response = await request(app).get(`/api/products/${PRODUCT_ID}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: product });
    expect(productsService.getProduct).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it("returns 404 when a product is not publicly visible", async () => {
    productsService.getProduct.mockRejectedValue(
      new productsService.ProductServiceError(404, "PRODUCT_NOT_FOUND", "Product not found.")
    );

    const response = await request(app).get(`/api/products/${PRODUCT_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("requires authentication to create a product", async () => {
    const response = await request(app).post("/api/products").send(product);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_TOKEN_MISSING");
    expect(productsService.createProduct).not.toHaveBeenCalled();
  });

  it("creates a product for an authenticated seller", async () => {
    authenticateSeller();
    productsService.createProduct.mockResolvedValue(product);
    const input = { ...product };
    delete input.id;

    const response = await request(app)
      .post("/api/products")
      .set("Authorization", "Bearer seller-token")
      .send(input);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: product });
    expect(productsService.createProduct).toHaveBeenCalledWith(input, SELLER.id);
  });

  it("rejects invalid product input before calling the service", async () => {
    authenticateSeller();

    const response = await request(app)
      .post("/api/products")
      .set("Authorization", "Bearer seller-token")
      .send({ title: "Tiny" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "shop_id" })])
    );
    expect(productsService.createProduct).not.toHaveBeenCalled();
  });

  it("updates a product belonging to the seller's shop", async () => {
    authenticateSeller();
    const updated = { ...product, price: 225 };
    productsService.updateProduct.mockResolvedValue(updated);

    const response = await request(app)
      .patch(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer seller-token")
      .send({ price: 225 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: updated });
    expect(productsService.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { price: 225 }, SELLER.id);
  });

  it("does not allow changing a product's shop", async () => {
    authenticateSeller();

    const response = await request(app)
      .patch(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer seller-token")
      .send({ shop_id: SHOP_ID });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toContainEqual({ field: "shop_id", message: "is not allowed" });
    expect(productsService.updateProduct).not.toHaveBeenCalled();
  });

  it("returns 403 when the seller does not own the product's shop", async () => {
    authenticateSeller();
    productsService.updateProduct.mockRejectedValue(
      new productsService.ProductServiceError(
        403,
        "SHOP_OWNERSHIP_REQUIRED",
        "You can only manage products in your own shop."
      )
    );

    const response = await request(app)
      .patch(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer seller-token")
      .send({ price: 225 });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("SHOP_OWNERSHIP_REQUIRED");
  });

  it("deletes a product belonging to the seller's shop", async () => {
    authenticateSeller();
    productsService.deleteProduct.mockResolvedValue();

    const response = await request(app)
      .delete(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer seller-token");

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(productsService.deleteProduct).toHaveBeenCalledWith(PRODUCT_ID, SELLER.id);
  });
});
