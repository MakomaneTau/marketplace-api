import { supabaseAdmin } from "../config/supabase.js";
import { publicStoragePath, removePrivateImages, uploadPublicImage } from "./storage.service.js";

const IMAGE_BUCKET = "marketplace-images";

const PRODUCT_SELECT = `
  *,
  category:categories!inner(id, name, slug),
  shop:shops!inner(id, name, slug, logo_url, is_open, rating, review_count)
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
    .select("id, shop_id, image_urls, status")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ProductServiceError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  await requireOwnedShop(data.shop_id, userId);
  return data;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function applySort(query, sort) {
  if (sort === "price_asc") return query.order("price", { ascending: true });
  if (sort === "price_desc") return query.order("price", { ascending: false });
  if (sort === "most_viewed") return query.order("view_count", { ascending: false });
  return query.order("created_at", { ascending: false });
}

function normalizeOptionalProductFields(input) {
  const normalized = { ...input };
  for (const field of ["description", "pickup_location"]) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = typeof normalized[field] === "string" && normalized[field].trim()
        ? normalized[field].trim()
        : null;
    }
  }
  return normalized;
}

export async function listProducts(options = {}) {
  const page = options.page || 1;
  const limit = options.limit || 24;
  let query = supabaseAdmin
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .eq("status", "active")
    .eq("shops.is_open", true);

  if (options.q) {
    const value = escapeLike(options.q);
    query = query.or(`title.ilike.%${value}%,description.ilike.%${value}%`);
  }
  if (options.category) query = query.eq("categories.slug", options.category);
  if (options.slug) query = query.eq("slug", options.slug);
  if (options.shop) query = query.eq("shops.slug", options.shop);
  if (options.condition) query = query.eq("condition", options.condition);
  query = applySort(query, options.sort);
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;

  if (error) throw databaseError(error);
  return { products: data, page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) };
}

export async function listSellerProducts(userId, options = {}) {
  await requireSeller(userId);
  const { data: shop, error: shopError } = await supabaseAdmin.from("shops").select("id").eq("owner_id", userId).maybeSingle();
  if (shopError) throw databaseError(shopError);
  if (!shop) return { products: [], page: options.page || 1, limit: options.limit || 24, total: 0, totalPages: 0 };

  const page = options.page || 1;
  const limit = options.limit || 24;
  let query = supabaseAdmin.from("products").select(PRODUCT_SELECT, { count: "exact" }).eq("shop_id", shop.id);
  if (options.q) {
    const value = escapeLike(options.q);
    query = query.or(`title.ilike.%${value}%,description.ilike.%${value}%`);
  }
  if (options.category) query = query.eq("categories.slug", options.category);
  if (options.condition) query = query.eq("condition", options.condition);
  if (options.status) query = query.eq("status", options.status);
  query = applySort(query, options.sort).range((page - 1) * limit, page * limit - 1);
  const { data, error, count } = await query;
  if (error) throw databaseError(error);
  return { products: data, page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) };
}

export async function createSellerProduct(input, userId) {
  await requireSeller(userId);
  const { data: shop, error } = await supabaseAdmin.from("shops").select("id").eq("owner_id", userId).maybeSingle();
  if (error) throw databaseError(error);
  if (!shop) throw new ProductServiceError(404, "SHOP_NOT_FOUND", "Create your shop before adding products.");
  return createProduct({ ...input, shop_id: shop.id, image_urls: [] }, userId);
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
    .insert(normalizeOptionalProductFields(input))
    .select()
    .single();

  if (error) throw databaseError(error);
  return data;
}

export async function updateProduct(productId, input, userId) {
  await getManagedProduct(productId, userId);
  const { data, error } = await supabaseAdmin
    .from("products")
    .update(normalizeOptionalProductFields(input))
    .eq("id", productId)
    .select()
    .single();

  if (error) throw databaseError(error);
  return data;
}

export async function deleteProduct(productId, userId) {
  const product = await getManagedProduct(productId, userId);
  const { error } = await supabaseAdmin.from("products").delete().eq("id", productId);
  if (error) throw databaseError(error);
  const paths = (product.image_urls || [])
    .map((url) => publicStoragePath(url, IMAGE_BUCKET))
    .filter(Boolean);
  await removePrivateImages(IMAGE_BUCKET, paths);
}

export async function addProductImage(productId, userId, file) {
  const product = await getManagedProduct(productId, userId);
  const existingImages = product.image_urls || [];
  if (existingImages.length >= 6) {
    throw new ProductServiceError(409, "PRODUCT_IMAGE_LIMIT", "A product may have at most six images.");
  }
  const uploaded = await uploadPublicImage({ bucket: IMAGE_BUCKET, ownerId: userId, scopeId: productId, label: "product", file });
  const imageUrls = [...existingImages, uploaded.publicUrl];
  const { data, error } = await supabaseAdmin.from("products").update({ image_urls: imageUrls }).eq("id", productId).select().single();
  if (error) {
    await removePrivateImages(IMAGE_BUCKET, [uploaded.path]);
    throw databaseError(error);
  }
  return data;
}

export async function removeProductImage(productId, imageIndex, userId) {
  const product = await getManagedProduct(productId, userId);
  const existingImages = product.image_urls || [];
  if (imageIndex < 0 || imageIndex >= existingImages.length) {
    throw new ProductServiceError(404, "PRODUCT_IMAGE_NOT_FOUND", "Product image not found.");
  }
  if (product.status === "active" && existingImages.length === 1) {
    throw new ProductServiceError(409, "PRODUCT_IMAGE_REQUIRED", "An active product must keep at least one image.");
  }
  const removedUrl = existingImages[imageIndex];
  const imageUrls = existingImages.filter((_, index) => index !== imageIndex);
  const { data, error } = await supabaseAdmin.from("products").update({ image_urls: imageUrls }).eq("id", productId).select().single();
  if (error) throw databaseError(error);
  const path = publicStoragePath(removedUrl, IMAGE_BUCKET);
  if (path) await removePrivateImages(IMAGE_BUCKET, [path]);
  return data;
}
