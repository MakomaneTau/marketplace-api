import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../src/app.js";
import { supabaseAdmin } from "../src/config/supabase.js";

// Exercise real authentication and database privileges through the API routes.
// Use disposable users; never change an existing user's saved products.
const users = [];
try {
  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("id, shop:shops!inner(is_open)")
    .eq("status", "active")
    .eq("shop.is_open", true)
    .limit(1);
  if (error) throw error;
  assert.ok(products.length, "An active product in an open shop is required.");
  const productId = products[0].id;

  for (let i = 0; i < 2; i += 1) {
    const email = `favourites-smoke-${randomUUID()}@example.test`;
    const password = `Smoke-${randomUUID()}!`;
    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { firstName: "Favourites", lastName: "Smoke", role: "buyer", isStudent: true },
    });
    if (createError) throw createError;
    users.push({ id: data.user.id });
    const response = await request(app).post("/api/v1/auth/login").send({ email, password });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    users[i].token = response.body.data.session.accessToken;
    assert.ok(users[i].token, "Login must return an access token.");
  }

  const endpoint = "/api/v1/favourites";
  const call = (method, path, user = users[0]) => request(app)[method](path)
    .set("Authorization", `Bearer ${user.token}`);
  assert.equal((await request(app).get(endpoint)).status, 401);
  for (let i = 0; i < 2; i += 1) {
    const saved = await call("put", `${endpoint}/${productId}`);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  }
  const savedList = await call("get", endpoint);
  assert.equal(savedList.status, 200, JSON.stringify(savedList.body));
  assert.deepEqual(savedList.body.data.map((product) => product.id), [productId]);
  const otherList = await call("get", endpoint, users[1]);
  assert.equal(otherList.status, 200, JSON.stringify(otherList.body));
  assert.deepEqual(otherList.body.data, []);
  const removed = await call("delete", `${endpoint}/${productId}`);
  assert.equal(removed.status, 204, JSON.stringify(removed.body));
  const emptyList = await call("get", endpoint);
  assert.equal(emptyList.status, 200, JSON.stringify(emptyList.body));
  assert.deepEqual(emptyList.body.data, []);
  console.log("Favourites smoke passed: authentication, save, duplicate save, list, user isolation, remove.");
} finally {
  for (const user of users) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}
