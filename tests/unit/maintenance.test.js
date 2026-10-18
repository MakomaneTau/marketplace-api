import { describe, expect, it, vi } from "vitest";

import { readConfig } from "../../src/config/env.js";
import { ApiError } from "../../src/errors/api-error.js";
import { createServiceErrorHandler } from "../../src/http/service-error.js";
import { createRateLimiter } from "../../src/middleware/rate-limit.js";

const environment = {
  SUPABASE_URL: "http://localhost:55321",
  SUPABASE_PUBLISHABLE_KEY: "test-public",
  SUPABASE_SECRET_KEY: "test-secret",
};
function response() {
  return {
    locals: { requestId: "test-request" },
    set: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("runtime configuration", () => {
  it("rejects broad proxy trust and invalid browser origins", () => {
    expect(() => readConfig({ ...environment, TRUST_PROXY: "true" })).toThrow(
      /TRUST_PROXY_CIDRS/,
    );
    for (const value of ["0.0.0.0/0", "::/0", "10.0.0.1/33", "*"])
      expect(() =>
        readConfig({ ...environment, TRUST_PROXY_CIDRS: value }),
      ).toThrow(/TRUST_PROXY_CIDRS/);
    expect(
      readConfig({ ...environment, TRUST_PROXY_CIDRS: "127.0.0.1,10.2.0.0/24" })
        .trustProxy,
    ).toEqual(["127.0.0.1", "10.2.0.0/24"]);
    for (const value of [
      "*",
      "https://user:password@example.com",
      "https://example.com/path",
    ])
      expect(() =>
        readConfig({ ...environment, CORS_ORIGINS: value }),
      ).toThrow();
  });
  it("rejects invalid ports and rate-limit values before starting", () => {
    for (const value of ["abc", "0", "-1", "65536", "4000suffix"]) {
      expect(() => readConfig({ ...environment, PORT: value })).toThrow(/PORT/);
    }
    expect(() =>
      readConfig({ ...environment, RATE_LIMIT_MAX: "10suffix" }),
    ).toThrow(/RATE_LIMIT_MAX/);
  });
  it("normalizes origins and preserves the public and privileged key boundary", () => {
    const config = readConfig({
      ...environment,
      CORS_ORIGINS: "http://localhost:3000, https://example.com, ",
    });
    expect(config.allowedOrigins).toEqual([
      "http://localhost:3000",
      "https://example.com",
    ]);
    expect(config.supabasePublishableKey).not.toBe(config.supabaseSecretKey);
    expect(() =>
      readConfig({ ...environment, SUPABASE_SECRET_KEY: "" }),
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });
});

describe("service error responses", () => {
  class OwnedError extends ApiError {}
  const handle = createServiceErrorHandler(
    (error) => error instanceof OwnedError,
  );
  it("preserves recognized service codes and request identifiers", () => {
    const res = response();
    handle(res, new OwnedError(409, "CONFLICT", "Conflict."));
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "CONFLICT",
        message: "Conflict.",
        request_id: "test-request",
      },
    });
  });
  it("never exposes internal exceptions or arbitrary error-shaped objects", () => {
    const res = response();
    handle(res, {
      status: 400,
      code: "FAKE",
      message: "private database details",
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(
      "private database details",
    );
  });
});

describe("rate limiting", () => {
  it("isolates clients, blocks excess requests, and resets expired windows", () => {
    let now = 0;
    const limiter = createRateLimiter({
      windowMs: 1000,
      requestLimit: 2,
      now: () => now,
    });
    const next = vi.fn();
    const first = { ip: "first", socket: {} };
    limiter(first, response(), next);
    limiter(first, response(), next);
    const blocked = response();
    limiter(first, blocked, next);
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.set).toHaveBeenCalledWith("Retry-After", "1");
    limiter({ ip: "second", socket: {} }, response(), next);
    expect(next).toHaveBeenCalledTimes(3);
    now = 1001;
    limiter(first, response(), next);
    expect(next).toHaveBeenCalledTimes(4);
  });
});
