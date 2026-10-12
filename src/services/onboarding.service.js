import { ApiError } from "../errors/api-error.js";
import { supabaseAdmin } from "../config/supabase.js";

const CURRENT_VERSION = 1;

export class OnboardingServiceError extends ApiError {}

function ensureNoError(result) {
  if (result.error) throw new OnboardingServiceError();
  return result.data;
}

async function getBuyerSteps(userId, profile) {
  const [favouritesResult, conversationsResult, ordersResult] =
    await Promise.all([
      supabaseAdmin
        .from("favourites")
        .select("product_id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabaseAdmin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("buyer_id", userId),
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("buyer_id", userId),
    ]);

  [favouritesResult, conversationsResult, ordersResult].forEach(ensureNoError);
  return {
    campus: Boolean(profile.campus_id),
    favourite: (favouritesResult.count || 0) > 0,
    message: (conversationsResult.count || 0) > 0,
    order: (ordersResult.count || 0) > 0,
  };
}

async function getSellerSteps(userId) {
  const shopResult = await supabaseAdmin
    .from("shops")
    .select("id,is_open")
    .eq("owner_id", userId)
    .maybeSingle();
  const shop = ensureNoError(shopResult);

  if (!shop) {
    return { shop: false, pickup: false, listing: false, open: false };
  }

  const [pickupResult, productsResult] = await Promise.all([
    supabaseAdmin
      .from("shop_pickup_areas")
      .select("campus_id", { count: "exact", head: true })
      .eq("shop_id", shop.id),
    supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .eq("status", "active"),
  ]);

  [pickupResult, productsResult].forEach(ensureNoError);
  return {
    shop: true,
    pickup: (pickupResult.count || 0) > 0,
    listing: (productsResult.count || 0) > 0,
    open: Boolean(shop.is_open),
  };
}

export async function getOnboarding(userId) {
  const [profileResult, preferenceResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("role,campus_id")
      .eq("id", userId)
      .single(),
    supabaseAdmin
      .from("user_onboarding")
      .select("version,welcome_seen_at,dismissed_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const profile = ensureNoError(profileResult);
  const preference = ensureNoError(preferenceResult);
  const steps =
    profile.role === "seller"
      ? await getSellerSteps(userId)
      : await getBuyerSteps(userId, profile);

  return {
    version: CURRENT_VERSION,
    role: profile.role,
    welcomeSeen:
      preference?.version === CURRENT_VERSION &&
      Boolean(preference.welcome_seen_at),
    dismissed:
      preference?.version === CURRENT_VERSION &&
      Boolean(preference.dismissed_at),
    steps,
  };
}

export async function updateOnboarding(userId, input) {
  const now = new Date().toISOString();
  const values = { user_id: userId, version: CURRENT_VERSION };

  if (input.welcomeSeen) values.welcome_seen_at = now;
  if (typeof input.dismissed === "boolean")
    values.dismissed_at = input.dismissed ? now : null;

  const result = await supabaseAdmin
    .from("user_onboarding")
    .upsert(values, { onConflict: "user_id" })
    .select("version,welcome_seen_at,dismissed_at")
    .single();
  ensureNoError(result);
  return getOnboarding(userId);
}
