import { describe, expect, it } from "vitest";

import {
  validateCreateOrder,
  validateOrderId,
  validateOrderListQuery,
  validateOrderStatus,
} from "../../src/validators/orders.validator.js";

const productId = "223e4567-e89b-42d3-a456-426614174000";
const campusId = "423e4567-e89b-42d3-a456-426614174000";
const pickup = {
  items: [{ productId, quantity: 1 }],
  fulfilmentType: "campus_pickup",
  pickupCampusId: campusId,
};

describe("checkout validation", () => {
  it.each([null, undefined, [], "order", 12])(
    "rejects a non-object body: %j",
    (body) => {
      expect(validateCreateOrder(body)).toEqual([
        { field: "body", message: "must be a JSON object" },
      ]);
    },
  );

  it.each([1, 99])("accepts the quantity boundary %s", (quantity) => {
    expect(
      validateCreateOrder({ ...pickup, items: [{ productId, quantity }] }),
    ).toEqual([]);
  });

  it.each([0, -1, 100, 1.5, "2", null, NaN, Infinity])(
    "rejects invalid quantity %j",
    (quantity) => {
      expect(
        validateCreateOrder({ ...pickup, items: [{ productId, quantity }] }),
      ).toContainEqual({
        field: "items.0.quantity",
        message: "must be an integer between 1 and 99",
      });
    },
  );

  it("accepts twenty unique items but rejects a twenty-first item", () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      productId: `223e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
      quantity: 1,
    }));
    expect(validateCreateOrder({ ...pickup, items })).toEqual([]);
    expect(
      validateCreateOrder({
        ...pickup,
        items: [...items, { productId, quantity: 1 }],
      }),
    ).toContainEqual({
      field: "items",
      message: "must contain between 1 and 20 products",
    });
  });

  it.each(["buyerId", "shopId", "totalAmount", "status"])(
    "rejects caller-controlled managed field %s",
    (field) => {
      expect(
        validateCreateOrder({ ...pickup, [field]: "forged" }),
      ).toContainEqual({ field, message: "is not allowed" });
    },
  );

  it("rejects client-provided prices and duplicate products", () => {
    expect(
      validateCreateOrder({
        ...pickup,
        items: [{ productId, quantity: 1, unitPrice: 0 }],
      }),
    ).toContainEqual({
      field: "items.0",
      message: "must contain only productId and quantity",
    });
    expect(
      validateCreateOrder({
        ...pickup,
        items: [
          { productId, quantity: 1 },
          { productId, quantity: 2 },
        ],
      }),
    ).toContainEqual({ field: "items.1.productId", message: "must be unique" });
  });

  it.each([null, "item", { productId: "invalid", quantity: 1 }])(
    "rejects malformed cart entry %j",
    (item) => {
      expect(validateCreateOrder({ ...pickup, items: [item] })).not.toEqual([]);
    },
  );

  it("requires a pickup campus for pickup and a meaningful bounded address for delivery", () => {
    expect(
      validateCreateOrder({ ...pickup, pickupCampusId: undefined }),
    ).toContainEqual({
      field: "pickupCampusId",
      message: "must be a valid UUID for campus pickup",
    });
    const delivery = { items: pickup.items, fulfilmentType: "delivery" };
    for (const deliveryAddress of [undefined, " ", "x".repeat(501)]) {
      expect(
        validateCreateOrder({ ...delivery, deliveryAddress }),
      ).toContainEqual({
        field: "deliveryAddress",
        message: "must contain between 1 and 500 characters for delivery",
      });
    }
    expect(
      validateCreateOrder({ ...delivery, deliveryAddress: "x".repeat(500) }),
    ).toEqual([]);
  });

  it("bounds optional notes without requiring notes for checkout", () => {
    for (const pickupNotes of [null, "", "x".repeat(500)])
      expect(validateCreateOrder({ ...pickup, pickupNotes })).toEqual([]);
    expect(
      validateCreateOrder({ ...pickup, pickupNotes: "x".repeat(501) }),
    ).toContainEqual({
      field: "pickupNotes",
      message: "must be at most 500 characters",
    });
  });

  it("validates offer IDs while retaining checkout fulfilment validation", () => {
    expect(validateCreateOrder({ ...pickup, offerId: productId })).toEqual([]);
    expect(
      validateCreateOrder({ ...pickup, offerId: "forged" }),
    ).toContainEqual({
      field: "offerId",
      message: "must be a valid offer UUID",
    });
  });
});

describe("order identifiers, transitions and pagination", () => {
  it("accepts valid UUIDs and rejects malformed identifiers", () => {
    expect(validateOrderId(productId)).toEqual([]);
    for (const id of [
      "invalid",
      "",
      undefined,
      "../orders",
      "00000000-0000-0000-0000-000000000000",
    ])
      expect(validateOrderId(id)).toEqual([
        { field: "id", message: "must be a valid UUID" },
      ]);
  });

  it.each(["new", "preparing", "ready", "completed", "cancelled"])(
    "accepts known status %s",
    (status) => {
      expect(validateOrderStatus({ status })).toEqual([]);
    },
  );

  it.each([null, [], {}, { status: "completed", buyerId: "forged" }])(
    "requires only a status field: %j",
    (body) => {
      expect(validateOrderStatus(body)).toEqual([
        { field: "body", message: "must contain only status" },
      ]);
    },
  );

  it("rejects unknown states", () => {
    expect(validateOrderStatus({ status: "paid" })).toEqual([
      { field: "status", message: "must be a valid order status" },
    ]);
  });

  it("accepts bounded pagination and rejects ownership filters", () => {
    expect(
      validateOrderListQuery({ page: "1000000", limit: "100", status: "new" }),
    ).toEqual([]);
    expect(validateOrderListQuery({ buyerId: "someone-else" })).toEqual([
      { field: "buyerId", message: "is not allowed" },
    ]);
  });

  it.each([
    ["page", "0"],
    ["page", "1000001"],
    ["page", "1.5"],
    ["limit", "0"],
    ["limit", "101"],
    ["limit", "NaN"],
  ])("rejects invalid %s=%s", (field, value) => {
    expect(validateOrderListQuery({ [field]: value })).toEqual([
      expect.objectContaining({ field }),
    ]);
  });
});
