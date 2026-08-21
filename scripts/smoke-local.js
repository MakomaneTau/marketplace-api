import "dotenv/config";

const apiUrl = process.env.API_URL || "http://127.0.0.1:4000";
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required in .env."
  );
}

async function request(url, options = {}, expectedStatus = 200) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (response.status !== expectedStatus) {
    throw new Error(
      `${options.method || "GET"} ${url} returned ${response.status}: ${JSON.stringify(body)}`
    );
  }

  return body;
}

async function signIn(email) {
  const session = await request(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }
  );

  if (!session?.access_token) {
    throw new Error(`Supabase did not return an access token for ${email}.`);
  }

  return session.access_token;
}

function bearer(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

let createdProductId = null;
let sellerToken = null;

try {
  const health = await request(`${apiUrl}/api/health`);
  if (health?.status !== "ok") throw new Error("The API health response is invalid.");

  const publicProducts = await request(`${apiUrl}/api/v1/products`);
  if (!Array.isArray(publicProducts?.data)) {
    throw new Error("The public products response does not contain a data array.");
  }

  sellerToken = await signIn("seller@example.com");
  const buyerToken = await signIn("buyer@example.com");

  const me = await request(`${apiUrl}/api/v1/auth/me`, {
    headers: bearer(sellerToken),
  });
  if (me?.data?.user?.email !== "seller@example.com") {
    throw new Error("The authenticated user response does not match the seller.");
  }

  const categories = await request(
    `${supabaseUrl}/rest/v1/categories?slug=eq.textbooks&select=id`,
    { headers: { apikey: publishableKey } }
  );
  const categoryId = categories?.[0]?.id;
  if (!categoryId) throw new Error("The seeded textbooks category was not found.");

  const productInput = {
    shop_id: "20000000-0000-4000-8000-000000000001",
    category_id: categoryId,
    title: "Local smoke test product",
    description: "A temporary listing created by the local API smoke test.",
    condition: "good",
    price: 150,
    currency: "ZAR",
    stock_quantity: 1,
    image_urls: ["https://example.com/local-smoke-test.jpg"],
    pickup_location: "Hatfield Campus",
    allows_campus_pickup: true,
    allows_delivery: false,
    status: "active",
  };

  await request(
    `${apiUrl}/api/v1/products`,
    {
      method: "POST",
      headers: bearer(buyerToken),
      body: JSON.stringify(productInput),
    },
    403
  );

  const created = await request(
    `${apiUrl}/api/v1/products`,
    {
      method: "POST",
      headers: bearer(sellerToken),
      body: JSON.stringify(productInput),
    },
    201
  );
  createdProductId = created?.data?.id;
  if (!createdProductId) throw new Error("Product creation returned no product ID.");

  await request(`${apiUrl}/api/v1/products/${createdProductId}`, {
    method: "PATCH",
    headers: bearer(sellerToken),
    body: JSON.stringify({ price: 125 }),
  });

  await request(
    `${apiUrl}/api/v1/products/${createdProductId}`,
    { method: "DELETE", headers: bearer(sellerToken) },
    204
  );
  createdProductId = null;

  console.log("Local API smoke test passed.");
} finally {
  if (createdProductId && sellerToken) {
    await fetch(`${apiUrl}/api/v1/products/${createdProductId}`, {
      method: "DELETE",
      headers: bearer(sellerToken),
    }).catch(() => undefined);
  }
}
