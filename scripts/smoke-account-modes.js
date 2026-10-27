import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../src/app.js";
import { config } from "../src/config/env.js";
import { supabaseAdmin as db } from "../src/config/supabase.js";

if (!["localhost", "127.0.0.1"].includes(new URL(config.supabaseUrl).hostname))
  throw new Error("This smoke test only runs against local Supabase.");

const users = [];
let shop;
let product;
const run = randomUUID().slice(0, 8);
function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
async function api(path, token, method = "get", body, status = 200) {
  let operation = request(app)[method](`/api/v1${path}`);
  if (token) operation = operation.set("Authorization", `Bearer ${token}`);
  if (body) operation = operation.send(body);
  const result = await operation;
  assert.equal(
    result.status,
    status,
    `${method} ${path}: ${JSON.stringify(result.body)}`,
  );
  return result.body.data;
}
try {
  const email = `modes-${run}@example.test`;
  const password = `Smoke-${randomUUID()}!`;
  const { user } = checked(
    await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "buyer",
        isStudent: false,
        firstName: "Modes",
        lastName: "Smoke",
      },
    }),
  );
  users.push(user.id);
  let profile = checked(
    await db.from("profiles").select("*").eq("id", user.id).single(),
  );
  assert.equal(profile.is_student, false);
  assert.equal(profile.active_role, null);
  const login = await api("/auth/login", null, "post", {
    email,
    password,
    role: "seller",
  });
  const token = login.session.accessToken;
  assert.equal((await api("/auth/me", token)).profile.role, "seller");
  shop = checked(
    await db
      .from("shops")
      .insert({
        owner_id: user.id,
        name: `Modes ${run}`,
        slug: `modes-${run}`,
        is_open: true,
      })
      .select()
      .single(),
  );
  const category = checked(
    await db.from("categories").select("id").limit(1).single(),
  );
  product = checked(
    await db
      .from("products")
      .insert({
        shop_id: shop.id,
        category_id: category.id,
        title: `Modes textbook ${run}`,
        description: "Temporary account switching verification listing.",
        condition: "good",
        price: 200,
        stock_quantity: 4,
        image_urls: ["https://example.test/smoke.png"],
        allows_delivery: true,
        allows_campus_pickup: false,
        status: "active",
      })
      .select()
      .single(),
  );
  const switched = await api("/auth/switch-role", token, "post", {
    role: "buyer",
  });
  assert.equal(switched.user.id, user.id);
  assert.equal(switched.profile.role, "buyer");
  assert.equal(switched.profile.canSell, true);
  profile = checked(
    await db
      .from("profiles")
      .select("role,active_role,is_student")
      .eq("id", user.id)
      .single(),
  );
  assert.deepEqual(profile, {
    role: "seller",
    active_role: "buyer",
    is_student: false,
  });
  assert.equal((await api(`/products/${product.id}`)).id, product.id);
  assert.equal((await api(`/shops/${shop.slug}`)).id, shop.id);
  await api("/favourites", token);
  await api("/orders", token);
  checked(await db.rpc("market_require_buyer", { p_user: user.id }));
  // Database ownership constraints still block buying from your own shop.
  const ownOrder = await db.rpc("create_marketplace_order", {
    p_buyer_id: user.id,
    p_items: [{ product_id: product.id, quantity: 1 }],
    p_fulfilment_type: "delivery",
    p_pickup_campus_id: null,
    p_delivery_address: "1 Test Street",
    p_pickup_notes: null,
  });
  assert.ok(ownOrder.error, "Self-purchase must fail");
  assert.match(ownOrder.error.message, /own|self/i);
  await api("/auth/switch-role", token, "post", { role: "seller" });
  assert.equal((await api("/seller/shop", token)).id, shop.id);
  await api("/favourites", token, "get", undefined, 403);
  const restored = await api("/auth/login", null, "post", { email, password });
  assert.equal(
    (await api("/auth/me", restored.session.accessToken)).profile.role,
    "seller",
  );
  await api("/auth/switch-role", token, "post", { role: "admin" }, 400);
  await api("/auth/switch-role", null, "post", { role: "seller" }, 401);
  checked(await db.from("admin_members").insert({ user_id: user.id }));
  await api("/auth/switch-role", token, "post", { role: "buyer" }, 403);
  checked(
    await db.from("account_restrictions").insert({
      user_id: user.id,
      reason: "Smoke test suspension",
      suspended_by: user.id,
    }),
  );
  await api("/auth/switch-role", token, "post", { role: "buyer" }, 403);
  console.log(
    "Account modes smoke passed: non-student signup profile, login selection, buyer/seller round trip, persistent mode, shop visibility, buyer RPC, self-purchase prevention, admin and suspended-account protection.",
  );
} finally {
  if (product) checked(await db.from("products").delete().eq("id", product.id));
  if (shop) checked(await db.from("shops").delete().eq("id", shop.id));
  for (const id of users) {
    checked(await db.from("account_restrictions").delete().eq("user_id", id));
    checked(await db.from("admin_members").delete().eq("user_id", id));
    checked(await db.auth.admin.deleteUser(id));
  }
}
