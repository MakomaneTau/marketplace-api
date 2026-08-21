import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("API contract", () => {
  it("exposes the health route with request and security headers", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "contract-test-123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("contract-test-123");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
  });

  it("rejects malformed JSON with a structured error", async () => {
    const response = await request(app)
      .post("/api/v1/products")
      .set("Content-Type", "application/json")
      .send('{"title":');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "INVALID_JSON",
      message: "The request body must contain valid JSON.",
    });
    expect(response.body.error.request_id).toBe(response.headers["x-request-id"]);
  });

  it("returns a structured JSON response for unknown routes", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: "ROUTE_NOT_FOUND",
      message: "The requested API route does not exist.",
    });
    expect(response.body.error.request_id).toBe(response.headers["x-request-id"]);
  });

  it("exposes authentication under the versioned API", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_TOKEN_MISSING");
    expect(response.body.error.request_id).toBe(response.headers["x-request-id"]);
  });
});
