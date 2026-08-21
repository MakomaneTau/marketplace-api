import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/auth.service.js", () => ({
  getUserFromAccessToken: vi.fn(),
}));

import { authenticate } from "../../src/middleware/authenticate.js";
import { getUserFromAccessToken } from "../../src/services/auth.service.js";

function createResponse() {
  return {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

function createRequest(authorization) {
  return {
    get: vi.fn((header) =>
      header === "authorization" ? authorization : undefined
    ),
  };
}

describe("authenticate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
