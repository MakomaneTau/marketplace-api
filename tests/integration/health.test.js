import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app";

describe ("GET /api/health", () => {

    it("should return API health status", async () => {
        const response = await request(app)
            .get("/api/health")
            .set("Origin", "http://localhost:3000");

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"])
            .toBe("http://localhost:3000");

        expect(response.body).toEqual({
            status: "ok",
            service: "marketplace-api"
        });
    })
})
