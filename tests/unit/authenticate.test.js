import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
}));
vi.mock("../../src/middleware/rate-limit.js", () => ({
  mutationRateLimit: vi.fn(),
}));

import { authenticate } from "../../src/middleware/authenticate.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";
import { mutationRateLimit } from "../../src/middleware/rate-limit.js";

function createResponse() {
  return {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function createRequest(authorization) {
  return {
    method: "GET",
    get: vi.fn((header) =>
      header === "authorization" ? authorization : undefined,
    ),
  };
}

describe("authenticate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mutationRateLimit.mockImplementation((_req, _res, next) => next());
  });

  it("rejects requests without an Authorization header", async () => {
    const req = createRequest(undefined);
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "AUTH_TOKEN_MISSING",
        message: "A bearer access token is required.",
      },
    });
    expect(getUserFromAccessToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects malformed Authorization headers", async () => {
    const req = createRequest("Basic credentials");
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "AUTH_TOKEN_MALFORMED",
        message: "The Authorization header must use the Bearer scheme.",
      },
    });
    expect(getUserFromAccessToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid or expired access tokens", async () => {
    getUserFromAccessToken.mockResolvedValue({
      user: null,
      error: new Error("invalid token"),
    });

    const req = createRequest("Bearer invalid-token");
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(getUserFromAccessToken).toHaveBeenCalledWith("invalid-token");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "AUTH_TOKEN_INVALID",
        message: "The access token is invalid or expired.",
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches a validated user to the request", async () => {
    const user = { id: "user-123", email: "buyer@example.com" };
    getUserFromAccessToken.mockResolvedValue({ user, error: null });

    const req = createRequest("Bearer valid-token");
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(getUserFromAccessToken).toHaveBeenCalledWith("valid-token");
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 503 when the authentication service cannot be reached", async () => {
    getUserFromAccessToken.mockRejectedValue(new Error("network failure"));

    const req = createRequest("Bearer valid-token");
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "AUTH_SERVICE_UNAVAILABLE",
        message: "Authentication is temporarily unavailable.",
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["Bearer", "Bearer ", "Bearer token extra", "Digest token"])(
    "rejects malformed credentials without looking up a user: %s",
    async (header) => {
      const req = createRequest(header);
      const res = createResponse();
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: "AUTH_TOKEN_MALFORMED",
          message: "The Authorization header must use the Bearer scheme.",
        },
      });
      expect(getUserFromAccessToken).not.toHaveBeenCalled();
      expect(mutationRateLimit).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("accepts a case-insensitive bearer scheme with surrounding whitespace", async () => {
    const user = { id: "user-123" };
    getUserFromAccessToken.mockResolvedValue({ user, error: null });
    const req = createRequest("  bEaReR   valid-token  ");
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(getUserFromAccessToken).toHaveBeenCalledWith("valid-token");
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledOnce();
  });

  it("preserves an account suspension as 403 and never admits the user", async () => {
    getUserFromAccessToken.mockResolvedValue({
      user: null,
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "This account has been suspended.",
      },
    });
    const req = createRequest("Bearer valid-token");
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "This account has been suspended.",
      },
    });
    expect(req.user).toBeUndefined();
    expect(mutationRateLimit).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    [{ aal: "aal2" }, "aal2"],
    [{ aal: "aal1" }, "aal1"],
    [{ aal: "unknown" }, "aal1"],
    [{ user_metadata: { aal: "aal2" } }, "aal1"],
  ])(
    "only accepts a verified top-level assurance claim: %j",
    async (claims, expected) => {
      const token = `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
      getUserFromAccessToken.mockResolvedValue({
        user: { id: "user-123" },
        error: null,
      });
      const req = createRequest(`Bearer ${token}`);
      const next = vi.fn();

      await authenticate(req, createResponse(), next);

      expect(getUserFromAccessToken).toHaveBeenCalledWith(token);
      expect(req.authAssurance).toBe(expected);
      expect(next).toHaveBeenCalledOnce();
    },
  );

  it("does not trust an aal2 claim when Auth rejects the token", async () => {
    const token = `header.${Buffer.from('{"aal":"aal2"}').toString("base64url")}.forged`;
    getUserFromAccessToken.mockResolvedValue({ user: null, error: null });
    const req = createRequest(`Bearer ${token}`);
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(req.authAssurance).toBeUndefined();
    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it("defaults a verified opaque token to the lower assurance level", async () => {
    getUserFromAccessToken.mockResolvedValue({
      user: { id: "user-123" },
      error: null,
    });
    const req = createRequest("Bearer opaque-token");
    const next = vi.fn();

    await authenticate(req, createResponse(), next);

    expect(req.authAssurance).toBe("aal1");
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(["GET", "HEAD", "OPTIONS"])(
    "allows authenticated %s requests without consuming the mutation limit",
    async (method) => {
      getUserFromAccessToken.mockResolvedValue({
        user: { id: "user-123" },
        error: null,
      });
      const req = { ...createRequest("Bearer valid-token"), method };
      const next = vi.fn();

      await authenticate(req, createResponse(), next);

      expect(mutationRateLimit).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledOnce();
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "applies the account mutation limit after verifying a %s request",
    async (method) => {
      const user = { id: "user-123" };
      getUserFromAccessToken.mockResolvedValue({ user, error: null });
      const req = { ...createRequest("Bearer valid-token"), method };
      const res = createResponse();
      const next = vi.fn();
      mutationRateLimit.mockImplementation((limitedReq) => {
        expect(limitedReq.user).toBe(user);
        res.status(429).json({ error: { code: "RATE_LIMIT_EXCEEDED" } });
      });

      await authenticate(req, res, next);

      expect(mutationRateLimit).toHaveBeenCalledWith(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();
    },
  );
});
