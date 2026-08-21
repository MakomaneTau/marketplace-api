import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/services/reference.service.js", () => {
  class ReferenceServiceError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    ReferenceServiceError,
    listCategories: vi.fn(),
    getCategory: vi.fn(),
    listUniversities: vi.fn(),
    getUniversity: vi.fn(),
    listCampuses: vi.fn(),
  };
});

import app from "../../src/app.js";
import * as referenceService from "../../src/services/reference.service.js";

const category = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "Textbooks",
  slug: "textbooks",
  is_featured: true,
  product_count: 4,
};

const university = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  name: "University of the Witwatersrand",
  acronym: "Wits",
  slug: "university-of-the-witwatersrand",
  campus_count: 3,
};

describe("reference-data API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists filtered categories", async () => {
    referenceService.listCategories.mockResolvedValue([category]);

    const response = await request(app).get(
      "/api/v1/categories?q=text&featured=true"
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [category] });
    expect(referenceService.listCategories).toHaveBeenCalledWith({
      q: "text",
      featured: true,
    });
  });

  it("rejects unsupported category filters", async () => {
    const response = await request(app).get("/api/v1/categories?sort=random");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(referenceService.listCategories).not.toHaveBeenCalled();
  });

  it("gets a category by slug", async () => {
    referenceService.getCategory.mockResolvedValue(category);

    const response = await request(app).get("/api/v1/categories/textbooks");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: category });
    expect(referenceService.getCategory).toHaveBeenCalledWith("textbooks");
  });

  it("lists searchable universities", async () => {
    referenceService.listUniversities.mockResolvedValue([university]);

    const response = await request(app).get("/api/v1/universities?q=wits");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [university] });
    expect(referenceService.listUniversities).toHaveBeenCalledWith({ q: "wits" });
  });

  it("gets a university with its campuses", async () => {
    const result = { ...university, campuses: [{ id: "campus-1", name: "Braamfontein" }] };
    referenceService.getUniversity.mockResolvedValue(result);

    const response = await request(app).get(
      "/api/v1/universities/university-of-the-witwatersrand"
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: result });
  });

  it("lists campuses for a university", async () => {
    const result = { university, campuses: [{ id: "campus-1", name: "Braamfontein" }] };
    referenceService.listCampuses.mockResolvedValue(result);

    const response = await request(app).get(
      "/api/v1/universities/university-of-the-witwatersrand/campuses"
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: result });
  });

  it("maps missing reference records to a stable 404", async () => {
    referenceService.getCategory.mockRejectedValue(
      new referenceService.ReferenceServiceError(
        404,
        "CATEGORY_NOT_FOUND",
        "Category not found."
      )
    );

    const response = await request(app).get("/api/v1/categories/not-found");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CATEGORY_NOT_FOUND");
  });
});
