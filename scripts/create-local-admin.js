import "dotenv/config";

import { randomBytes } from "node:crypto";

const url = new URL(process.env.SUPABASE_URL || "http://invalid");
if (!(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55321")) {
  throw new Error("Refusing to create an admin outside the local Supabase instance on port 55321.");
}

const { supabaseAdmin } = await import("../src/config/supabase.js");
const { supabaseAuth } = await import("../src/config/supabase-auth.js");

const email = "admin.local@example.test";
const password = randomBytes(24).toString("base64url");

const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    role: "buyer",
    firstName: "Local",
    lastName: "Administrator",
  },
});
if (createError || !created.user) {
  throw new Error(`Local admin creation failed: ${createError?.message || "No user returned"}`);
}

const userId = created.user.id;
const { error: grantError } = await supabaseAdmin.from("admin_members").insert({ user_id: userId });
if (grantError) {
  await supabaseAdmin.auth.admin.deleteUser(userId);
  throw new Error(`Local admin grant failed: ${grantError.message}`);
}

const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
  .select("id,display_name,role").eq("id", userId).single();
const { data: login, error: loginError } = await supabaseAuth.auth.signInWithPassword({ email, password });
if (profileError || !profile || loginError || login.user?.id !== userId) {
  throw new Error("Admin was created, but profile or password login verification failed. Inspect the local account before using it.");
}

console.log(`Local admin email: ${email}`);
console.log(`Local admin password: ${password}`);
console.log(`Local admin user ID: ${userId}`);
console.log("Verified local profile, admin membership, and password sign-in.");
