import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../src/app.js";
import { supabaseAdmin as db } from "../src/config/supabase.js";

// All messages and shop changes belong to disposable test accounts.
const users = [];
async function call(user, method, path, body, status = 200) {
  let operation = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${user.token}`);
  if (body) operation = operation.send(body);
  const response = await operation;
  assert.equal(response.status, status, JSON.stringify(response.body.error));
  return response.body.data;
}
try {
  const { data: campuses, error: campusError } = await db.from("campuses").select("id,name,university_id").limit(200);
  if (campusError) throw campusError;
  const selected = [campuses[0], campuses.find((campus) => campus.university_id !== campuses[0].university_id)];
  assert.ok(selected.every(Boolean), "Two universities with campuses are required.");
  for (const role of ["seller", "buyer", "buyer"]) {
    const email = `messaging-smoke-${randomUUID()}@example.test`;
    const password = `Smoke-${randomUUID()}!`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { firstName: "Messaging", lastName: "Smoke", role, isStudent: role === "buyer" } });
    if (error) throw error;
    const user = { id: data.user.id };
    users.push(user);
    const { error: profileError } = await db.from("profiles").update({ university_id: selected[0].university_id }).eq("id", user.id);
    if (profileError) throw profileError;
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    assert.equal(login.status, 200);
    user.token = login.body.data.session.accessToken;
  }
  const [seller, buyer, outsider] = users;
  const shop = await call(seller, "post", "/seller/shop", { name: `Messaging Smoke ${randomUUID().slice(0, 8)}`, isOpen: true }, 201);
  await call(seller, "put", "/seller/shop/pickup-areas", { campusIds: selected.map((campus) => campus.id) });
  const savedShop = await call(seller, "get", "/seller/shop");
  assert.deepEqual(savedShop.pickup_areas.map((area) => area.campus.id).sort(), selected.map((campus) => campus.id).sort());
  assert.ok(savedShop.pickup_areas.every((area) => area.campus.name && area.campus.university.name));
  const { data: category, error: categoryError } = await db.from("categories").select("id").limit(1).single();
  if (categoryError) throw categoryError;
  const { data: product, error: productError } = await db.from("products").insert({
    shop_id: shop.id, category_id: category.id, title: "Messaging smoke product",
    description: "A disposable product for testing message read receipts.", condition: "good", price: 50,
    stock_quantity: 1, image_urls: ["https://example.test/product.png"], pickup_location: "Test campus", status: "active",
  }).select("id").single();
  if (productError) throw productError;
  const conversation = await call(buyer, "post", "/conversations", { productId: product.id }, 201);
  assert.ok(conversation.buyer.university.name);
  assert.ok(conversation.seller.university.name);
  assert.ok(conversation.product.slug);
  const path = `/conversations/${conversation.id}`;
  const first = await call(buyer, "post", `${path}/messages`, { body: "First unread message" }, 201);
  const second = await call(buyer, "post", `${path}/messages`, { body: "Second unread message" }, 201);
  assert.equal((await call(seller, "get", "/conversations/unread-count")).count, 2);
  assert.equal((await call(outsider, "get", "/conversations/unread-count")).count, 0);
  await call(outsider, "get", path, null, 403);
  await call(outsider, "patch", `${path}/read`, { messageIds: [first.id] }, 403);
  await call(seller, "patch", `${path}/read`, { messageIds: [first.id] }, 204);
  assert.equal((await call(seller, "get", "/conversations/unread-count")).count, 1);
  let history = await call(buyer, "get", path);
  const readAt = history.messages.find((message) => message.id === first.id).read_at;
  assert.ok(readAt);
  assert.equal(history.messages.find((message) => message.id === second.id).read_at, null);
  await call(buyer, "patch", `${path}/read`, { messageIds: [second.id] }, 204);
  assert.equal((await call(seller, "get", "/conversations/unread-count")).count, 1);
  const third = await call(buyer, "post", `${path}/messages`, { body: "Arrived after the displayed messages" }, 201);
  await call(seller, "patch", `${path}/read`, { messageIds: [first.id, second.id] }, 204);
  history = await call(buyer, "get", path);
  assert.equal(history.messages.find((message) => message.id === first.id).read_at, readAt);
  assert.equal(history.messages.find((message) => message.id === third.id).read_at, null);
  assert.equal((await call(seller, "get", "/conversations/unread-count")).count, 1);
  const reply = await call(seller, "post", `${path}/messages`, { body: "Seller reply" }, 201);
  assert.equal((await call(buyer, "get", "/conversations/unread-count")).count, 1);
  await call(buyer, "patch", `${path}/read`, { messageIds: [reply.id] }, 204);
  assert.equal((await call(buyer, "get", "/conversations/unread-count")).count, 0);
  console.log("Messaging API smoke passed: contact details, exact unread totals, participant isolation, scoped read receipts, stable read timestamps, and multiple saved campuses.");
} finally {
  for (const user of users) {
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}
