import { supabaseAdmin } from "../config/supabase.js";

const PRODUCT_SELECT = `
  *,
  shop:shops!inner(id, name, slug, logo_url, is_open)
`;

export class ProductServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ProductServiceError";
    this.status = status;
    this.code = code;
  }
}

function databaseError(error) {
  if (error?.code === "23503") return new ProductServiceError(400, "PRODUCT_REFERENCE_INVALID", "The shop or category does not exist.");
  if (error?.code === "23514") return new ProductServiceError(400, "PRODUCT_CONSTRAINT_VIOLATION", "The product does not satisfy the listing requirements.");
  return new ProductServiceError(503, "PRODUCT_SERVICE_UNAVAILABLE", "Products are temporarily unavailable.");
}

async function requireSeller(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw databaseError(error);
  if (!data || data.role !== "seller") {
    throw new ProductServiceError(403, "SELLER_REQUIRED", "A seller account is required.");
  }
}

async function requireOwnedShop(shopId, userId) {
  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("id, owner_id")
    .eq("id", shopId)
    .maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ProductServiceError(404, "SHOP_NOT_FOUND", "Shop not found.");
  if (data.owner_id !== userId) {
    throw new ProductServiceError(403, "SHOP_OWNERSHIP_REQUIRED", "You can only manage products in your own shop.");
  }
}

async function getManagedProduct(productId, userId) {
  await requireSeller(userId);
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, shop_id")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ProductServiceError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  await requireOwnedShop(data.shop_id, userId);
  return data;
}

export async function listProducts() {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .eq("shops.is_open", true)
    .order("created_at", { ascending: false });

  if (error) throw databaseError(error);
  return data;
}

export async function getProduct(productId) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("status", "active")
    .eq("shops.is_open", true)
    .maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ProductServiceError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return data;
}

export async function createProduct(input, userId) {
  await requireSeller(userId);
  await requireOwnedShop(input.shop_id, userId);

  const { data, error } = await supabaseAdmin
    .from("products")
    .insert(input)
    .select()
    .single();

  if (error) throw databaseError(error);
  return data;
}

export async function updateProduct(productId, input, userId) {
  await getManagedProduct(productId, userId);
  const { data, error } = await supabaseAdmin
    .from("products")
    .update(input)
    .eq("id", productId)
    .select()
    .single();

  if (error) throw databaseError(error);
  return data;
}

export async function deleteProduct(productId, userId) {
  await getManagedProduct(productId, userId);
  const { error } = await supabaseAdmin.from("products").delete().eq("id", productId);
  if (error) throw databaseError(error);
}
