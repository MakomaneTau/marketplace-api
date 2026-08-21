import "dotenv/config";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../src/config/supabase.js";
import {
  addProductImage,
  createSellerProduct,
  deleteProduct,
  getProduct,
  listProducts,
  listSellerProducts,
  updateProduct,
} from "../src/services/products.service.js";
import { createShop } from "../src/services/shops.service.js";

const runId = randomUUID().slice(0, 8);
const email = `product-smoke-${runId}@example.test`;
let userId;
let shopId;
let productId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  if (productId && userId) await deleteProduct(productId, userId).catch(() => undefined);
  if (shopId) await supabaseAdmin.from("shops").delete().eq("id", shopId);
  if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
}

try {
  const { data: category, error: categoryError } = await supabaseAdmin
    .from("categories")
    .select("id, slug")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (categoryError) throw categoryError;
  if (!category) throw new Error("No category exists. Run the documented local seed before this smoke test.");

  const { data: created, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: `Smoke-${randomUUID()}!`,
    email_confirm: true,
    user_metadata: {
      firstName: "Product",
      lastName: "Smoke",
      display_name: "Product Smoke",
      role: "seller",
      isStudent: false,
    },
  });
  if (createUserError) throw createUserError;
  userId = created.user.id;

  const shop = await createShop(userId, { name: `Product Smoke ${runId}`, isOpen: true });
  shopId = shop.id;
  const draft = await createSellerProduct({
    category_id: category.id,
    title: `Smoke test textbook ${runId}`,
    description: "A disposable product used to validate the local catalogue workflow.",
    condition: "good",
    price: 125,
    currency: "ZAR",
    stock_quantity: 1,
    pickup_location: "Local smoke-test campus",
    allows_campus_pickup: true,
    allows_delivery: false,
    status: "draft",
  }, userId);
  productId = draft.id;

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const withImage = await addProductImage(productId, userId, {
    buffer: png,
    mimetype: "image/png",
  });
  assert(withImage.image_urls.length === 1, "Product image upload failed.");

  await updateProduct(productId, { status: "active" }, userId);
  const publicProduct = await getProduct(productId);
  const publicList = await listProducts({
    q: runId,
    category: category.slug,
    condition: "good",
    sort: "price_asc",
    page: 1,
    limit: 5,
  });
  const sellerList = await listSellerProducts(userId, { status: "active", page: 1, limit: 5 });

  assert(publicProduct.id === productId, "Public product lookup failed.");
  assert(publicList.products.some((product) => product.id === productId), "Filtered public listing failed.");
  assert(sellerList.products.some((product) => product.id === productId), "Seller inventory listing failed.");

  console.log(JSON.stringify({
    status: "ok",
    checks: ["seller draft", "managed image", "activation", "public filters", "seller inventory"],
  }));
} finally {
  await cleanup();
}
