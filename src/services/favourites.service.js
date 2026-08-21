import { supabaseAdmin } from "../config/supabase.js";

const FAVOURITE_SELECT = `
  created_at,
  product:products!inner(
    *,
    category:categories!inner(id, name, slug),
    shop:shops!inner(id, name, slug, logo_url, is_open, rating, review_count)
  )
`;

export class FavouriteServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "FavouriteServiceError";
    this.status = status;
    this.code = code;
  }
}

function unavailable() {
  return new FavouriteServiceError(503, "FAVOURITE_SERVICE_UNAVAILABLE", "Saved products are temporarily unavailable.");
}

export async function listFavourites(userId, { page = 1, limit = 24 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from("favourites")
    .select(FAVOURITE_SELECT, { count: "exact" })
    .eq("user_id", userId)
    .eq("products.status", "active")
    .eq("products.shops.is_open", true)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) throw unavailable();
  return {
    products: data.map(({ product, created_at }) => ({ ...product, favourited_at: created_at })),
    page,
    limit,
    total: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

export async function saveFavourite(userId, productId) {
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, shop:shops!inner(is_open)")
    .eq("id", productId)
    .eq("status", "active")
    .eq("shops.is_open", true)
    .maybeSingle();
  if (productError) throw unavailable();
  if (!product) throw new FavouriteServiceError(404, "PRODUCT_NOT_FOUND", "Product not found.");

  const { error } = await supabaseAdmin
    .from("favourites")
    .upsert({ user_id: userId, product_id: productId }, { onConflict: "user_id,product_id", ignoreDuplicates: true });
  if (error) throw unavailable();
  return { productId, saved: true };
}

export async function removeFavourite(userId, productId) {
  const { error } = await supabaseAdmin
    .from("favourites")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);
  if (error) throw unavailable();
}
