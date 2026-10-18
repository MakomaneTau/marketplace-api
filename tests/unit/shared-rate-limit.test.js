import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createSharedRateLimiter } from "../../src/middleware/shared-rate-limit.js";

describe("shared abuse limits", () => {
  const app = (consume) => {
    const server = express();
    server.get(
      "/",
      createSharedRateLimiter({
        namespace: "test",
        windowMs: 60000,
        requestLimit: 2,
        keyGenerator: () => "private@example.com",
        consume,
      }),
      (_req, res) => res.sendStatus(204),
    );
    return server;
  };
  it("uses hashed identities and obeys a shared denial", async () => {
    const consume = vi.fn().mockResolvedValue({
      data: { allowed: false, remaining: 0, retryAfter: 42 },
    });
    const response = await request(app(consume)).get("/");
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("42");
    expect(consume.mock.calls[0][0].p_bucket).toMatch(/^test:[a-f0-9]{64}$/);
  });
  it("fails closed on backend errors and malformed replies", async () => {
    for (const consume of [
      vi.fn().mockRejectedValue(new Error("offline")),
      vi.fn().mockResolvedValue({ error: {} }),
      vi.fn().mockResolvedValue({ data: {} }),
    ]) {
      expect((await request(app(consume)).get("/")).status).toBe(503);
    }
  });
  it("allows a request only when the shared store permits it", async () => {
    expect(
      (
        await request(
          app(
            vi
              .fn()
              .mockResolvedValue({ data: { allowed: true, remaining: 1 } }),
          ),
        ).get("/")
      ).status,
    ).toBe(204);
  });
});
