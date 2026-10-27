import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("../../src/config/supabase.js", () => ({ supabaseAdmin: db }));

import {
  createOrder,
  getOrder,
  listBuyerOrders,
  listSellerOrders,
  OrderServiceError,
  transitionOrder,
} from "../../src/services/orders.service.js";

const order = {
  id: "order-1",
  buyer_id: "buyer-1",
  shop_id: "shop-1",
  status: "new",
  items: [{ product_id: "product-1", quantity: 2, unit_price: 50 }],
};
const checkout = {
  items: [{ productId: "product-1", quantity: 2 }],
  fulfilmentType: "campus_pickup",
  pickupCampusId: "campus-1",
};

function query(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return builder;
}

describe("order participant access", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a buyer's order without requiring a seller shop", async () => {
    const orders = query({ data: order, error: null });
    db.from.mockReturnValueOnce(orders);

    expect(await getOrder(order.id, order.buyer_id)).toEqual(order);
    expect(orders.eq).toHaveBeenCalledWith("id", order.id);
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("allows the seller who owns the order's shop", async () => {
    const shops = query({ data: { id: order.shop_id }, error: null });
    db.from
      .mockReturnValueOnce(query({ data: order, error: null }))
      .mockReturnValueOnce(shops);

    expect(await getOrder(order.id, "seller-1")).toEqual(order);
    expect(db.from).toHaveBeenNthCalledWith(2, "shops");
    expect(shops.eq).toHaveBeenCalledWith("owner_id", "seller-1");
  });

  it.each([
    ["an unrelated seller", { data: { id: "other-shop" }, error: null }],
    ["a user without a shop", { data: null, error: null }],
    ["a seller whose ownership cannot be verified", { data: null, error: {} }],
  ])("denies access to %s", async (_description, shopResult) => {
    db.from
      .mockReturnValueOnce(query({ data: order, error: null }))
      .mockReturnValueOnce(query(shopResult));

    await expect(getOrder(order.id, "outsider")).rejects.toMatchObject({
      status: 403,
      code: "ORDER_ACCESS_FORBIDDEN",
    });
  });

  it("reports a missing order before checking seller ownership", async () => {
    db.from.mockReturnValueOnce(query({ data: null, error: null }));

    await expect(getOrder("missing", "buyer-1")).rejects.toMatchObject({
      status: 404,
      code: "ORDER_NOT_FOUND",
    });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("hides database details when the order lookup fails", async () => {
    db.from.mockReturnValueOnce(
      query({ data: null, error: { message: "private database connection" } }),
    );

    await expect(getOrder(order.id, "buyer-1")).rejects.toMatchObject({
      status: 503,
      code: "ORDER_SERVICE_UNAVAILABLE",
      message: "Orders are temporarily unavailable.",
    });
  });
});

describe("order listing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("scopes buyer orders and returns filtered pagination totals", async () => {
    const orders = query({ data: [order], count: 25, error: null });
    db.from.mockReturnValueOnce(orders);

    expect(
      await listBuyerOrders("buyer-1", { status: "new", page: 2, limit: 10 }),
    ).toEqual({
      orders: [order],
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
    expect(orders.eq).toHaveBeenCalledWith("buyer_id", "buyer-1");
    expect(orders.eq).toHaveBeenCalledWith("status", "new");
    expect(orders.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(orders.range).toHaveBeenCalledWith(10, 19);
  });

  it("uses the default page size and handles an empty result", async () => {
    const orders = query({ data: [], count: null, error: null });
    db.from.mockReturnValueOnce(orders);

    expect(await listBuyerOrders("buyer-1", {})).toEqual({
      orders: [],
      page: 1,
      limit: 24,
      total: 0,
      totalPages: 0,
    });
    expect(orders.range).toHaveBeenCalledWith(0, 23);
    expect(orders.eq).toHaveBeenCalledTimes(1);
  });

  it("scopes seller orders to the shop owned by the requesting seller", async () => {
    const shops = query({ data: { id: "shop-1" }, error: null });
    const orders = query({ data: [order], count: 1, error: null });
    db.from.mockReturnValueOnce(shops).mockReturnValueOnce(orders);

    expect((await listSellerOrders("seller-1", {})).orders).toEqual([order]);
    expect(shops.eq).toHaveBeenCalledWith("owner_id", "seller-1");
    expect(orders.eq).toHaveBeenCalledWith("shop_id", "shop-1");
    expect(orders.eq).not.toHaveBeenCalledWith("buyer_id", "seller-1");
  });

  it("does not query any orders for a seller without a shop", async () => {
    db.from.mockReturnValueOnce(query({ data: null, error: null }));

    await expect(listSellerOrders("seller-1", {})).rejects.toMatchObject({
      status: 403,
      code: "SELLER_SHOP_REQUIRED",
    });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("does not disguise a shop lookup outage as a missing shop", async () => {
    db.from.mockReturnValueOnce(
      query({ data: null, error: { message: "down" } }),
    );

    await expect(listSellerOrders("seller-1", {})).rejects.toMatchObject({
      status: 503,
      code: "ORDER_SERVICE_UNAVAILABLE",
    });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("reports listing failures without returning partial order data", async () => {
    db.from.mockReturnValueOnce(
      query({ data: [order], error: { message: "database unavailable" } }),
    );

    await expect(listBuyerOrders("buyer-1", {})).rejects.toBeInstanceOf(
      OrderServiceError,
    );
  });
});

describe("atomic order checkout", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes cart quantities to atomic checkout and loads the persisted order", async () => {
    db.rpc.mockResolvedValue({ data: order.id, error: null });
    const orders = query({ data: order, error: null });
    db.from.mockReturnValueOnce(orders);

    const result = await createOrder("buyer-1", {
      ...checkout,
      items: [
        { productId: "product-1", quantity: 2, unitPrice: 0 },
        { productId: "product-2", quantity: 1 },
      ],
    });

    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("create_marketplace_order", {
      p_buyer_id: "buyer-1",
      p_items: [
        { product_id: "product-1", quantity: 2 },
        { product_id: "product-2", quantity: 1 },
      ],
      p_fulfilment_type: "campus_pickup",
      p_pickup_campus_id: "campus-1",
      p_delivery_address: null,
      p_pickup_notes: null,
    });
    expect(orders.eq).toHaveBeenCalledWith("id", order.id);
    expect(result).toEqual(order);
  });

  it("preserves delivery details and pickup notes", async () => {
    db.rpc.mockResolvedValue({ data: order.id, error: null });
    db.from.mockReturnValueOnce(query({ data: order, error: null }));

    await createOrder("buyer-1", {
      items: checkout.items,
      fulfilmentType: "delivery",
      deliveryAddress: "1 University Road",
      pickupNotes: "Please call on arrival",
    });

    expect(db.rpc).toHaveBeenCalledWith("create_marketplace_order", {
      p_buyer_id: "buyer-1",
      p_items: [{ product_id: "product-1", quantity: 2 }],
      p_fulfilment_type: "delivery",
      p_pickup_campus_id: null,
      p_delivery_address: "1 University Road",
      p_pickup_notes: "Please call on arrival",
    });
  });

  it.each([
    ["ORDER_ITEMS_INVALID", 400],
    ["ORDER_PRODUCT_UNAVAILABLE", 409],
    ["ORDER_SINGLE_SHOP_REQUIRED", 400],
    ["ORDER_OWN_SHOP_FORBIDDEN", 400],
    ["ORDER_FULFILMENT_INVALID", 400],
    ["SELLER_APPROVAL_REQUIRED", 409],
  ])("translates the %s checkout rejection", async (code, status) => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: code },
    });

    await expect(createOrder("buyer-1", checkout)).rejects.toMatchObject({
      status,
      code,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("hides an unknown database checkout failure", async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: "relation private.orders does not exist" },
    });

    await expect(createOrder("buyer-1", checkout)).rejects.toMatchObject({
      status: 503,
      code: "ORDER_SERVICE_UNAVAILABLE",
      message: "Orders are temporarily unavailable.",
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("checks out an accepted offer using the offer RPC rather than client cart prices", async () => {
    db.rpc.mockResolvedValue({ data: order.id, error: null });
    db.from.mockReturnValueOnce(query({ data: order, error: null }));

    expect(
      await createOrder("buyer-1", { ...checkout, offerId: "offer-1" }),
    ).toEqual(order);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("market_checkout_offer", {
      p_actor: "buyer-1",
      p_offer: "offer-1",
      p_fulfilment: "campus_pickup",
      p_campus: "campus-1",
      p_address: null,
      p_notes: null,
    });
  });

  it.each([
    ["42501", 403],
    ["22023", 409],
    ["P0001", 409],
  ])("returns a safe offer failure for SQLSTATE %s", async (code, status) => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "private offer ownership and pricing details" },
    });

    await expect(
      createOrder("buyer-1", { ...checkout, offerId: "offer-1" }),
    ).rejects.toMatchObject({
      status,
      code: "OFFER_UNAVAILABLE",
      message:
        "This offer cannot be checked out. It may have expired or the item may be unavailable.",
    });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("controlled order transitions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sends the actor and target status to the RPC and returns persisted state", async () => {
    const updated = { ...order, status: "cancelled" };
    db.rpc.mockResolvedValue({ error: null });
    db.from.mockReturnValueOnce(query({ data: updated, error: null }));

    expect(await transitionOrder(order.id, "buyer-1", "cancelled")).toEqual(
      updated,
    );
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
      "transition_marketplace_order",
      {
        p_order_id: order.id,
        p_actor_id: "buyer-1",
        p_status: "cancelled",
      },
    );
  });

  it.each([
    ["ORDER_NOT_FOUND", 404],
    ["ORDER_ACCESS_FORBIDDEN", 403],
    ["ORDER_STATUS_SELLER_REQUIRED", 403],
    ["ORDER_STATUS_TRANSITION_INVALID", 409],
  ])("preserves the %s transition rejection", async (code, status) => {
    db.rpc.mockResolvedValue({ error: { message: code } });

    await expect(
      transitionOrder(order.id, "buyer-1", "completed"),
    ).rejects.toMatchObject({ status, code });
    expect(db.from).not.toHaveBeenCalled();
  });
});
