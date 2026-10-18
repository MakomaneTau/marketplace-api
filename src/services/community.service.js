import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../errors/api-error.js";
import { getProfile } from "./profile.service.js";
import { isAdmin } from "./admin.service.js";
import { getConversation } from "./messaging.service.js";
import { getOrder } from "./orders.service.js";
import { validateProductListQuery } from "../validators/products.validator.js";

export function invalid(message) {
  throw new ApiError(400, "VALIDATION_ERROR", message);
}
export function checked(result) {
  if (result.error) {
    const code = result.error.code;
    const known =
      /^(BUYER_|OFFER_|PICKUP_|QUEUE_|ORDER_|PRODUCT_|OWN_ACTIVE_|WANTED_|ADMIN_)/.test(
        result.error.message || "",
      );
    const status =
      code === "42501"
        ? 403
        : code === "P0002"
          ? 404
          : ["22023", "23505", "23514", "23503"].includes(code)
            ? 409
            : 503;
    throw new ApiError(
      status,
      known ? result.error.message : "MARKETPLACE_UPDATE_FAILED",
      known
        ? result.error.message.toLowerCase().replaceAll("_", " ") +
            ". Refresh and try again."
        : "This request could not be completed. Please try again.",
    );
  }
  return result.data;
}
export async function commerceAccount(user) {
  const [profile, admin] = await Promise.all([getProfile(user), isAdmin(user)]);
  if (admin || !["buyer", "seller"].includes(profile.role))
    throw new ApiError(
      403,
      "MARKETPLACE_ACCOUNT_REQUIRED",
      "Use a buyer or seller account for this action.",
    );
  return profile;
}
export async function savedSearches(user) {
  return checked(
    await supabaseAdmin
      .from("saved_searches")
      .select("*")
      .eq("user_id", user)
      .order("created_at", { ascending: false }),
  );
}
export async function saveSearch(user, input) {
  if (
    !input ||
    typeof input.name !== "string" ||
    input.name.trim().length < 1 ||
    input.name.trim().length > 80 ||
    !input.filters ||
    typeof input.filters !== "object" ||
    Array.isArray(input.filters)
  )
    invalid("Enter a name and valid search filters.");
  const allowed = [
    "q",
    "category",
    "shop",
    "condition",
    "campus",
    "min_price",
    "max_price",
    "fulfilment",
  ];
  const filters = Object.fromEntries(
    Object.entries(input.filters).filter(
      ([key, value]) => allowed.includes(key) && value !== "",
    ),
  );
  if (validateProductListQuery(filters).length)
    invalid("The saved search contains invalid filters.");
  if ((await savedSearches(user)).length >= 50)
    invalid("You can save up to 50 searches. Remove one first.");
  return checked(
    await supabaseAdmin
      .from("saved_searches")
      .insert({ user_id: user, name: input.name.trim(), filters })
      .select()
      .single(),
  );
}
export async function removeSearch(user, id) {
  checked(
    await supabaseAdmin
      .from("saved_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", user),
  );
}
export async function follows(user) {
  return checked(
    await supabaseAdmin
      .from("shop_follows")
      .select("shop:shops(id,name,slug)")
      .eq("user_id", user),
  );
}
export async function follow(user, slug, enabled) {
  const shop = checked(
    await supabaseAdmin
      .from("shops")
      .select("id,is_open,sellable")
      .eq("slug", slug)
      .maybeSingle(),
  );
  if (!shop) throw new ApiError(404, "SHOP_NOT_FOUND", "Shop not found.");
  if (enabled && (!shop.is_open || !shop.sellable))
    throw new ApiError(
      409,
      "SHOP_UNAVAILABLE",
      "This shop is not currently accepting followers.",
    );
  if (enabled)
    checked(
      await supabaseAdmin
        .from("shop_follows")
        .upsert(
          { user_id: user, shop_id: shop.id },
          { onConflict: "user_id,shop_id" },
        ),
    );
  else
    checked(
      await supabaseAdmin
        .from("shop_follows")
        .delete()
        .eq("user_id", user)
        .eq("shop_id", shop.id),
    );
}
export async function wanted(user) {
  const profile = await commerceAccount(user);
  const posts = checked(
    await supabaseAdmin
      .from("wanted_posts")
      .select(
        "*,campus:campuses(name),buyer:profiles!wanted_posts_buyer_id_fkey(display_name),replies:wanted_replies(id,product:products(id,slug,title,price,status,shop:shops(name,slug)))",
      )
      .or(
        `buyer_id.eq.${user},and(status.eq.open,expires_at.gt.${new Date().toISOString()})`,
      )
      .order("created_at", { ascending: false })
      .limit(100),
  );
  return posts
    .filter(
      (p) =>
        p.buyer_id === user ||
        (p.status === "open" && new Date(p.expires_at) > new Date()),
    )
    .map((p) => ({
      ...p,
      canClose: p.buyer_id === user,
      canReply: profile.role === "seller",
    }));
}
export async function postWanted(user, input) {
  if (
    !input ||
    typeof input.title !== "string" ||
    input.title.trim().length < 5 ||
    input.title.trim().length > 100 ||
    typeof input.details !== "string" ||
    input.details.trim().length < 10 ||
    input.details.trim().length > 1000 ||
    !Number.isFinite(input.budget) ||
    input.budget <= 0 ||
    input.budget > 9999999999.99
  )
    invalid("Enter a title, description and positive budget.");
  return checked(
    await supabaseAdmin
      .from("wanted_posts")
      .insert({
        buyer_id: user,
        title: input.title.trim(),
        details: input.details.trim(),
        budget: input.budget,
        campus_id: input.campusId || null,
      })
      .select()
      .single(),
  );
}
export async function closeWanted(user, id) {
  const result = checked(
    await supabaseAdmin
      .from("wanted_posts")
      .update({ status: "closed" })
      .eq("id", id)
      .eq("buyer_id", user)
      .select()
      .maybeSingle(),
  );
  if (!result)
    throw new ApiError(
      404,
      "WANTED_NOT_FOUND",
      "Your request could not be found.",
    );
  return result;
}
export async function replyWanted(user, id, product) {
  return checked(
    await supabaseAdmin.rpc("market_reply_wanted", {
      p_actor: user,
      p_wanted: id,
      p_product: product,
    }),
  );
}
export async function offers(user, conversation) {
  await commerceAccount(user);
  await getConversation(conversation, user);
  const rows = checked(
    await supabaseAdmin
      .from("marketplace_offers")
      .select("*")
      .eq("conversation_id", conversation)
      .order("created_at", { ascending: false })
      .limit(50),
  );
  return rows.map((row) => ({
    ...row,
    status:
      ["pending", "accepted"].includes(row.status) &&
      new Date(row.expires_at) <= new Date()
        ? "expired"
        : row.status,
  }));
}
export async function makeOffer(user, conversation, input) {
  if (
    !Number.isFinite(input?.price) ||
    input.price <= 0 ||
    input.price > 9999999999.99 ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 99
  )
    invalid("Enter a positive price and quantity from 1 to 99.");
  return checked(
    await supabaseAdmin.rpc("market_offer", {
      p_actor: user,
      p_conversation: conversation,
      p_price: input.price,
      p_quantity: input.quantity,
    }),
  );
}
export async function decideOffer(user, id, status) {
  await commerceAccount(user);
  if (!["accepted", "declined", "withdrawn"].includes(status))
    invalid("Invalid offer decision.");
  checked(
    await supabaseAdmin.rpc("market_decide_offer", {
      p_actor: user,
      p_offer: id,
      p_status: status,
    }),
  );
}
export async function offerDetails(user, id) {
  await commerceAccount(user);
  const result = checked(
    await supabaseAdmin
      .from("marketplace_offers")
      .select("*")
      .eq("id", id)
      .eq("buyer_id", user)
      .maybeSingle(),
  );
  if (!result) throw new ApiError(404, "OFFER_NOT_FOUND", "Offer not found.");
  return result;
}
export async function pickup(user, id) {
  await commerceAccount(user);
  await getOrder(id, user);
  return checked(
    await supabaseAdmin
      .from("pickup_plans")
      .select("*")
      .eq("order_id", id)
      .maybeSingle(),
  );
}
export async function changePickup(user, id, input) {
  await commerceAccount(user);
  if (!["propose", "confirm", "collect"].includes(input?.action))
    invalid("Invalid pickup action.");
  if (
    input.action === "propose" &&
    (typeof input.location !== "string" ||
      input.location.trim().length < 3 ||
      input.location.length > 200 ||
      typeof input.meetingAt !== "string" ||
      !Number.isFinite(Date.parse(input.meetingAt)))
  )
    invalid("Enter a meeting time and location.");
  checked(
    await supabaseAdmin.rpc("market_pickup", {
      p_actor: user,
      p_order: id,
      p_action: input.action,
      p_at: input.meetingAt || null,
      p_location: input.location || null,
    }),
  );
  return pickup(user, id);
}
