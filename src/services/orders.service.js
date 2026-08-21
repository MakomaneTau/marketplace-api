import { supabaseAdmin } from "../config/supabase.js";

const ORDER_SELECT = `
  *,
  shop:shops(id, name, slug, logo_url),
  buyer:profiles!orders_buyer_id_fkey(id, display_name, avatar_url),
  pickup_campus:campuses(id, name, city, province),
  items:order_items(id, product_id, product_name, unit_price, quantity, line_total)
`;

export class OrderServiceError extends Error {
  constructor(status, code, message) { super(message); this.name = "OrderServiceError"; this.status = status; this.code = code; }
}

function mapError(error) {
  const code = error?.message?.match(/ORDER_[A-Z_]+/)?.[0];
  const errors = {
    ORDER_ITEMS_INVALID: [400, "Order items are invalid."],
    ORDER_PRODUCT_UNAVAILABLE: [409, "One or more products are unavailable or lack stock."],
    ORDER_SINGLE_SHOP_REQUIRED: [400, "All products in an order must belong to one shop and currency."],
    ORDER_OWN_SHOP_FORBIDDEN: [400, "You cannot order from your own shop."],
    ORDER_FULFILMENT_INVALID: [400, "The selected fulfilment option is unavailable."],
    ORDER_NOT_FOUND: [404, "Order not found."],
    ORDER_ACCESS_FORBIDDEN: [403, "You cannot access this order."],
    ORDER_STATUS_SELLER_REQUIRED: [403, "Only the seller can make this order transition."],
    ORDER_STATUS_TRANSITION_INVALID: [409, "The requested order status transition is invalid."],
  };
  if (code && errors[code]) return new OrderServiceError(errors[code][0], code, errors[code][1]);
  return new OrderServiceError(503, "ORDER_SERVICE_UNAVAILABLE", "Orders are temporarily unavailable.");
}

async function sellerShopId(userId) {
  const { data, error } = await supabaseAdmin.from("shops").select("id").eq("owner_id", userId).maybeSingle();
  if (error) throw mapError(error);
  if (!data) throw new OrderServiceError(403, "SELLER_SHOP_REQUIRED", "A seller shop is required.");
  return data.id;
}

async function list(where, id, { status, page = 1, limit = 24 }) {
  let query = supabaseAdmin.from("orders").select(ORDER_SELECT, { count: "exact" }).eq(where, id);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query.order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (error) throw mapError(error);
  return { orders: data, page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) };
}

export const listBuyerOrders = (userId, options) => list("buyer_id", userId, options);
export async function listSellerOrders(userId, options) { return list("shop_id", await sellerShopId(userId), options); }

export async function getOrder(orderId, userId) {
  const { data, error } = await supabaseAdmin.from("orders").select(ORDER_SELECT).eq("id", orderId).maybeSingle();
  if (error) throw mapError(error);
  if (!data) throw new OrderServiceError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (data.buyer_id !== userId) {
    const shopId = await sellerShopId(userId).catch(() => null);
    if (data.shop_id !== shopId) throw new OrderServiceError(403, "ORDER_ACCESS_FORBIDDEN", "You cannot access this order.");
  }
  return data;
}

export async function createOrder(userId, input) {
  const { data: orderId, error } = await supabaseAdmin.rpc("create_marketplace_order", {
    p_buyer_id: userId,
    p_items: input.items.map(({ productId, quantity }) => ({ product_id: productId, quantity })),
    p_fulfilment_type: input.fulfilmentType,
    p_pickup_campus_id: input.pickupCampusId || null,
    p_delivery_address: input.deliveryAddress || null,
    p_pickup_notes: input.pickupNotes || null,
  });
  if (error) throw mapError(error);
  return getOrder(orderId, userId);
}

export async function transitionOrder(orderId, userId, status) {
  const { error } = await supabaseAdmin.rpc("transition_marketplace_order", { p_order_id: orderId, p_actor_id: userId, p_status: status });
  if (error) throw mapError(error);
  return getOrder(orderId, userId);
}
