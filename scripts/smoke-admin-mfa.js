import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import app from "../src/app.js";
import { config } from "../src/config/env.js";
import { supabaseAdmin } from "../src/config/supabase.js";
import { supabaseAuth } from "../src/config/supabase-auth.js";

assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(config.supabaseUrl).hostname),
  "This smoke test only runs against local Supabase.",
);
assert.notEqual(config.nodeEnv, "production");

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase().replace(/=+$/, "")]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    (bits.match(/.{8}/g) || []).map((byte) => Number.parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}

let userId;
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
try {
  const email = `security-smoke-${randomUUID()}@example.com`;
  const password = `Smoke-${randomUUID()}!Aa9`;
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const membership = await supabaseAdmin
    .from("admin_members")
    .insert({ user_id: userId });
  if (membership.error) throw membership.error;
  const signedIn = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });
  if (signedIn.error) throw signedIn.error;
  const access = signedIn.data.session.access_token;
  const call = async (path, token = access, body) => {
    const response = await fetch(`${origin}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await call("/admin/overview")).status, 403);
  const factor = await call("/auth/mfa/enroll", access, {});
  assert.equal(factor.status, 200, JSON.stringify(factor.body.error));
  const code = totp(factor.body.data.secret);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
  assert.ok(
    (
      await call("/auth/mfa/verify", access, {
        factorId: factor.body.data.id,
        code: wrong,
      })
    ).status >= 400,
  );
  const verified = await call("/auth/mfa/verify", access, {
    factorId: factor.body.data.id,
    code,
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body.error));
  const upgraded = verified.body.data.session.accessToken;
  assert.equal(
    (await call("/auth/mfa/status", upgraded)).body.data.verified,
    true,
  );
  assert.equal((await call("/admin/overview", upgraded)).status, 200);
  assert.equal((await call("/auth/mfa/enroll", access, {})).status, 409);
  const reset = await supabaseAdmin.auth.admin.mfa.deleteFactor({
    userId,
    id: factor.body.data.id,
  });
  if (reset.error) throw reset.error;
  assert.equal((await call("/admin/overview", upgraded)).status, 403);
  console.log(
    "Local MFA smoke passed: password-only denied, enrollment, wrong-code rejection, verification, admin access, factor-replacement protection and denial after factor reset.",
  );
} finally {
  if (userId) {
    const removed = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (removed.error) {
      console.error("Could not remove the temporary smoke-test account.");
      process.exitCode = 1;
    }
  }
  await new Promise((resolve) => server.close(resolve));
}
