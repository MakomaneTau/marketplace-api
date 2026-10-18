import { describe, it, expect } from "vitest";
import { validateProductListQuery } from "../../src/validators/products.validator.js";
describe("discovery filter validation", () => {
  it("accepts campus pickup, decimal budgets and a weekly collection", () => {
    expect(
      validateProductListQuery({
        campus: "90000000-0000-4000-8000-000000000005",
        min_price: "50.50",
        max_price: "200",
        fulfilment: "campus_pickup",
        collection: "this-week",
      }),
    ).toEqual([]);
  });
  it.each([
    { min_price: "-1" },
    { min_price: "201", max_price: "200" },
    { max_price: "Infinity" },
    { max_price: "10.999" },
    { campus: "not-a-uuid" },
    { fulfilment: "teleport" },
    { collection: "anything" },
  ])("rejects malformed or contradictory filters %j", (query) => {
    expect(validateProductListQuery(query).length).toBeGreaterThan(0);
  });
});
