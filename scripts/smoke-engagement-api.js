import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "../src/config/env.js";
import { supabaseAdmin as db } from "../src/config/supabase.js";

if (!["localhost", "127.0.0.1"].includes(new URL(config.supabaseUrl).hostname))
  throw new Error("This smoke test only runs against local Supabase.");
const users = [],
  products = [];
let shop;
const run = randomUUID().slice(0, 8);
function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
async function account(role) {
  const email = `engagement-${role}-${run}@example.test`,
    password = `Smoke-${randomUUID()}!`;
  const { user } = checked(
    await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        isStudent: false,
        firstName: "Engagement",
        lastName: "Smoke",
      },
    }),
  );
  users.push(user.id);
  const client = createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { session } = checked(
    await client.auth.signInWithPassword({ email, password }),
  );
  return { id: user.id, token: session.access_token };
}
async function request(path, actor, method = "GET", body, expected = 200) {
  const response = await fetch(
    `http://127.0.0.1:${config.port}/api/v1${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const result = await response.json().catch(() => null);
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(result)}`,
  );
  return result;
}
try {
  const seller = await account("seller"),
    buyer = await account("buyer");
  const category = checked(
    await db.from("categories").select("id,slug").limit(1).single(),
  );
  const campus = checked(
    await db.from("campuses").select("id").limit(1).single(),
  );
  shop = checked(
    await db
      .from("shops")
      .insert({
        owner_id: seller.id,
        name: `Engagement ${run}`,
        slug: `engagement-${run}`,
        is_open: true,
      })
      .select()
      .single(),
  );
  checked(
    await db
      .from("shop_pickup_areas")
      .insert({ shop_id: shop.id, campus_id: campus.id }),
  );
  const product = checked(
    await db
      .from("products")
      .insert({
        shop_id: shop.id,
        category_id: category.id,
        title: `Smoke textbook ${run}`,
        description: "Temporary engagement smoke test listing.",
        condition: "good",
        price: 200,
        stock_quantity: 4,
        image_urls: ["https://example.test/smoke.png"],
        allows_campus_pickup: true,
        allows_delivery: true,
        status: "active",
      })
      .select()
      .single(),
  );
  products.push(product.id);
  assert.equal((await request(`/products/${product.id}`)).data.id, product.id);
  assert.equal((await request(`/shops/${shop.slug}`)).data.id, shop.id);
  assert.equal(
    (await request(`/shops/${shop.slug}/reviews?page=1&limit=5`)).meta.total,
    0,
  );
  if (process.env.SMOKE_WEB_URL) {
    const base = new URL(process.env.SMOKE_WEB_URL);
    assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
    for (const [path, text] of [
      [`/shops/${shop.slug}`, shop.name],
      [`/products/${product.id}`, product.title],
      ["/search?condition=Like+New", "Find your next good find"],
    ]) {
      const response = await fetch(new URL(path, base));
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(text), `Missing rendered content: ${path}`);
      assert.ok(
        !html.includes("This page could not be loaded"),
        `Error boundary rendered: ${path}`,
      );
    }
    const protectedPage = await fetch(new URL("/wanted", base), {
      redirect: "manual",
    });
    assert.equal(protectedPage.status, 307);
    assert.ok(protectedPage.headers.get("location").includes("/login"));
  }

  const page = await request(
    `/products?shop=${shop.slug}&campus=${campus.id}&min_price=100&max_price=250&condition=good`,
  );
  assert.equal(page.meta.total, 1);
  assert.equal(page.data[0].id, product.id);
  assert.equal(
    (await request(`/products?shop=${shop.slug}&max_price=150`)).meta.total,
    0,
  );
  await request(
    "/saved-searches",
    seller,
    "POST",
    { name: "Forbidden", filters: {} },
    403,
  );
  await request(
    "/saved-searches",
    buyer,
    "POST",
    { name: "Books", filters: { q: "textbook", campus: campus.id } },
    201,
  );
  await request(`/follows/${shop.slug}`, buyer, "PUT", undefined, 204);
  await request("/seller/products/bulk-status", seller, "POST", {
    ids: [product.id],
    status: "paused",
  });
  await request("/seller/products/bulk-status", seller, "POST", {
    ids: [product.id],
    status: "active",
  });
  const wanted = (
    await request(
      "/wanted",
      buyer,
      "POST",
      {
        title: "Need a textbook",
        details: "Looking for a good used textbook",
        budget: 250,
        campusId: campus.id,
      },
      201,
    )
  ).data;
  await request(
    `/wanted/${wanted.id}/replies`,
    seller,
    "POST",
    { productId: product.id },
    201,
  );
  assert.ok(
    (await request("/wanted", buyer)).data.some(
      (p) => p.id === wanted.id && p.replies.length === 1,
    ),
  );
  assert.equal((await request("/follows", buyer)).data.length, 1);
  assert.ok(
    (await request("/notifications", buyer)).data.some(
      (n) => n.title === "A new listing for you",
    ),
  );
  const duplicate = (
    await request(
      `/seller/products/${product.id}/duplicate`,
      seller,
      "POST",
      undefined,
      201,
    )
  ).data;
  products.push(duplicate.id);
  assert.equal(duplicate.status, "draft");
  assert.equal(duplicate.image_urls.length, 0);
  await request(`/seller/products/${product.id}`, buyer, "GET", undefined, 403);
  console.log(
    "Engagement API smoke passed: catalogue filters, detail, buyer roles, alerts, follows, wanted replies, seller bulk and draft duplication.",
  );
} finally {
  // Only IDs created by this test are removed; no existing marketplace data is touched.
  if (products.length)
    checked(await db.from("products").delete().in("id", products));
  if (shop) checked(await db.from("shops").delete().eq("id", shop.id));
  for (const id of users) checked(await db.auth.admin.deleteUser(id));
}
