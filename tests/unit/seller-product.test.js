import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../src/config/supabase.js", () => ({
  supabaseAdmin: { from: mocks.from },
}));
import { getSellerProduct } from "../../src/services/products.service.js";

function query(result) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("seller product ownership", () => {
  beforeEach(() => vi.resetAllMocks());
  it("loads a draft only after verifying seller role and shop ownership", async () => {
    const draft = {
      id: "product",
      shop_id: "shop",
      title: "Private draft",
      status: "draft",
    };
    const profile = query({ data: { role: "seller" } });
    const product = query({ data: draft });
    const shop = query({ data: { id: "shop", owner_id: "seller" } });
    mocks.from
      .mockReturnValueOnce(profile)
      .mockReturnValueOnce(product)
      .mockReturnValueOnce(shop);
    expect(await getSellerProduct("product", "seller")).toEqual(draft);
    expect(product.eq).toHaveBeenCalledWith("id", "product");
    expect(shop.eq).toHaveBeenCalledWith("id", "shop");
  });
  it("rejects another seller's private draft", async () => {
    mocks.from
      .mockReturnValueOnce(query({ data: { role: "seller" } }))
      .mockReturnValueOnce(
        query({
          data: { id: "product", shop_id: "other-shop", status: "draft" },
        }),
      )
      .mockReturnValueOnce(
        query({ data: { id: "other-shop", owner_id: "other-seller" } }),
      );
    await expect(getSellerProduct("product", "seller")).rejects.toMatchObject({
      status: 403,
      code: "SHOP_OWNERSHIP_REQUIRED",
    });
  });
  it("rejects buyers before querying private listings", async () => {
    mocks.from.mockReturnValueOnce(query({ data: { role: "buyer" } }));
    await expect(getSellerProduct("product", "buyer")).rejects.toMatchObject({
      status: 403,
      code: "SELLER_REQUIRED",
    });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it("reports a missing listing instead of loading an empty edit form", async () => {
    mocks.from
      .mockReturnValueOnce(query({ data: { role: "seller" } }))
      .mockReturnValueOnce(query({ data: null }));
    await expect(getSellerProduct("missing", "seller")).rejects.toMatchObject({
      status: 404,
      code: "PRODUCT_NOT_FOUND",
    });
  });
});
