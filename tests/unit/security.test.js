import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

import {
  createAuthRateLimiter,
  createRateLimiter,
} from "../../src/middleware/rate-limit.js";
import { publicStoragePath } from "../../src/services/storage.service.js";
import { searchPattern } from "../../src/http/search-filter.js";
import { config } from "../../src/config/env.js";
import app from "../../src/app.js";

describe("request security boundaries", () => {
  it("rejects unapproved browser origins before executing requests", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
  it("rejects oversized JSON and compressed requests with safe errors", async () => {
    const oversized = await request(app)
      .post("/api/v1/auth/login")
      .send({ value: "x".repeat(1024 * 1024) });
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe("REQUEST_TOO_LARGE");
    const compressed = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Encoding", "gzip")
      .set("Content-Type", "application/json")
      .send("bytes");
    expect(compressed.status).toBe(415);
    expect(compressed.body.error.code).toBe("CONTENT_ENCODING_UNSUPPORTED");
  });
  it("does not cache API responses or disclose its framework", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain(
      "default-src 'none'",
    );
  });
});

describe("abuse throttles", () => {
  it("groups case/whitespace variants of an account, isolates accounts, and expires", async () => {
    let now = 0;
    const endpoint = vi.fn((_req, res) => res.json({ ok: true }));
    const demo = express();
    demo.use(express.json());
    demo.post(
      "/login",
      createAuthRateLimiter({
        requestLimit: 2,
        windowMs: 1000,
        now: () => now,
      }),
      endpoint,
    );
    await request(demo)
      .post("/login")
      .send({ email: "Victim@example.com" })
      .expect(200);
    await request(demo)
      .post("/login")
      .send({ email: " victim@EXAMPLE.COM " })
      .expect(200);
    const blocked = await request(demo)
      .post("/login")
      .set("X-Forwarded-For", "203.0.113.10")
      .send({ email: "victim@example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("1");
    await request(demo)
      .post("/login")
      .send({ email: "other@example.com" })
      .expect(200);
    now = 1001;
    await request(demo)
      .post("/login")
      .send({ email: "victim@example.com" })
      .expect(200);
    expect(endpoint).toHaveBeenCalledTimes(4);
  });
  it("bounds limiter memory without evicting active limits", async () => {
    const demo = express();
    demo.get(
      "/",
      createRateLimiter({
        requestLimit: 1,
        maxEntries: 1,
        keyGenerator: (req) => req.get("x-test-key"),
      }),
      (_req, res) => res.sendStatus(204),
    );
    await request(demo).get("/").set("x-test-key", "first").expect(204);
    await request(demo).get("/").set("x-test-key", "second").expect(429);
    await request(demo).get("/").set("x-test-key", "first").expect(429);
  });
});

describe("storage ownership and filter injection", () => {
  const base = `${config.supabaseUrl}/storage/v1/object/public/products`;
  it("only resolves deletion paths inside this seller and listing", () => {
    expect(
      publicStoragePath(
        `${base}/seller/listing/product-file.jpg`,
        "products",
        "seller",
        "listing",
      ),
    ).toBe("seller/listing/product-file.jpg");
    for (const url of [
      `${base}/victim/listing/product-file.jpg`,
      `${base}/seller/other/product-file.jpg`,
      `https://attacker.example/storage/v1/object/public/products/seller/listing/product-file.jpg`,
      `${base}/seller/listing/%2e%2e%2fvictim.jpg`,
      `${base}/seller/listing/%252e%252e%252fvictim.jpg`,
      `${base}/seller/listing/product-file.jpg?path=victim`,
      `${base}/seller/listing/%ZZ`,
      `${base}/seller/listing/folder/file.jpg`,
      "not a URL",
    ])
      expect(
        publicStoragePath(url, "products", "seller", "listing"),
      ).toBeNull();
    expect(
      publicStoragePath(`${base}/seller/listing/product-file.jpg`, "products"),
    ).toBeNull();
  });
  it("quotes logical-filter syntax and escapes wildcard/quote characters", () => {
    expect(searchPattern("book")).toBe('"%book%"');
    const attack = "x,price.gt.0),or(status.eq.draft";
    expect(searchPattern(attack)).toBe(`"%${attack}%"`);
    expect(searchPattern('a"b')).toBe('"%a\\"b%"');
    expect(searchPattern("100%_off")).toBe('"%100\\\\%\\\\_off%"');
  });
});
