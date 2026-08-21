import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { removePrivateImages, uploadPublicImage } from "./storage.service.js";

const BUCKET = "marketplace-images";
const SHOP_SELECT = `
  *,
  pickup_areas:shop_pickup_areas(
    sort_order,
    campus:campuses(id, name, city, province, university:universities(id, name, acronym, slug))
  )
`;

export class ShopServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ShopServiceError";
    this.status = status;
    this.code = code;
  }
}

function unavailable() {
  return new ShopServiceError(503, "SHOP_SERVICE_UNAVAILABLE", "Shops are temporarily unavailable.");
}

async function requireSeller(userId) {
  const { data, error } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw unavailable();
  if (!data || data.role !== "seller") throw new ShopServiceError(403, "SELLER_REQUIRED", "A seller account is required.");
}

function slugify(name) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "shop";
}

function inputToRow(input) {
  const row = {};
  if ("name" in input) row.name = input.name.trim();
  if ("tagline" in input) row.tagline = input.tagline?.trim() || null;
  if ("description" in input) row.description = input.description?.trim() || null;
  if ("isOpen" in input) row.is_open = input.isOpen;
  return row;
}

export async function getSellerShop(userId) {
  await requireSeller(userId);
  const { data, error } = await supabaseAdmin.from("shops").select(SHOP_SELECT).eq("owner_id", userId).maybeSingle();
  if (error) throw unavailable();
  return data;
}

export async function getPublicShop(slug) {
  const { data, error } = await supabaseAdmin.from("shops").select(SHOP_SELECT).eq("slug", slug).eq("is_open", true).maybeSingle();
  if (error) throw unavailable();
  if (!data) throw new ShopServiceError(404, "SHOP_NOT_FOUND", "Shop not found.");
  return data;
}

export async function createShop(userId, input) {
  await requireSeller(userId);
  const existing = await getSellerShop(userId);
  if (existing) throw new ShopServiceError(409, "SHOP_ALREADY_EXISTS", "This seller already has a shop.");

  const baseSlug = slugify(input.name);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 8)}`;
    const { data, error } = await supabaseAdmin.from("shops").insert({ owner_id: userId, slug, ...inputToRow(input) }).select(SHOP_SELECT).single();
    if (!error) return data;
    if (error.code !== "23505") throw unavailable();
  }
  throw new ShopServiceError(409, "SHOP_SLUG_CONFLICT", "A unique shop URL could not be generated.");
}

export async function updateShop(userId, input) {
  const shop = await getSellerShop(userId);
  if (!shop) throw new ShopServiceError(404, "SHOP_NOT_FOUND", "Shop not found.");
  const { data, error } = await supabaseAdmin.from("shops").update(inputToRow(input)).eq("id", shop.id).eq("owner_id", userId).select(SHOP_SELECT).single();
  if (error) throw unavailable();
  return data;
}

export async function replacePickupAreas(userId, campusIds) {
  const shop = await getSellerShop(userId);
  if (!shop) throw new ShopServiceError(404, "SHOP_NOT_FOUND", "Shop not found.");
  const { error } = await supabaseAdmin.rpc("replace_shop_pickup_areas", {
    p_shop_id: shop.id,
    p_owner_id: userId,
    p_campus_ids: campusIds,
  });
  if (error?.code === "23503") throw new ShopServiceError(400, "CAMPUS_REFERENCE_INVALID", "One or more selected campuses do not exist.");
  if (error) throw unavailable();
  return getSellerShop(userId);
}

function storedPath(publicUrl) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = publicUrl?.indexOf(marker);
  return index === -1 || index === undefined ? null : decodeURIComponent(publicUrl.slice(index + marker.length));
}

export async function updateShopImage(userId, kind, file) {
  const shop = await getSellerShop(userId);
  if (!shop) throw new ShopServiceError(404, "SHOP_NOT_FOUND", "Shop not found.");
  const field = kind === "logo" ? "logo_url" : "banner_url";
  const previousPath = storedPath(shop[field]);
  const uploaded = await uploadPublicImage({ bucket: BUCKET, ownerId: userId, scopeId: shop.id, label: kind, file });
  const { data, error } = await supabaseAdmin.from("shops").update({ [field]: uploaded.publicUrl }).eq("id", shop.id).select(SHOP_SELECT).single();
  if (error) {
    await removePrivateImages(BUCKET, [uploaded.path]);
    throw unavailable();
  }
  if (previousPath) await removePrivateImages(BUCKET, [previousPath]);
  return data;
}
