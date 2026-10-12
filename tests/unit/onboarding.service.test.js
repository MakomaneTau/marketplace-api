import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/supabase.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from "../../src/config/supabase.js";
import { getOnboarding } from "../../src/services/onboarding.service.js";

function query(response) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => response),
    maybeSingle: vi.fn(async () => response),
    then(resolve, reject) {
      return Promise.resolve(response).then(resolve, reject);
    },
  };
  return builder;
}

describe("onboarding service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives buyer progress from marketplace activity", async () => {
    const responses = {
      profiles: [
        query({ data: { role: "buyer", campus_id: "campus-1" }, error: null }),
      ],
      user_onboarding: [query({ data: null, error: null })],
      favourites: [query({ data: null, count: 1, error: null })],
      conversations: [query({ data: null, count: 0, error: null })],
      orders: [query({ data: null, count: 2, error: null })],
    };
    supabaseAdmin.from.mockImplementation((table) => responses[table].shift());

    const result = await getOnboarding("buyer-1");

    expect(result).toEqual({
      version: 1,
      role: "buyer",
      welcomeSeen: false,
      dismissed: false,
      steps: { campus: true, favourite: true, message: false, order: true },
    });
  });

  it("derives seller progress from shop readiness", async () => {
    const responses = {
      profiles: [
        query({ data: { role: "seller", campus_id: null }, error: null }),
      ],
      user_onboarding: [
        query({
          data: {
            version: 1,
            welcome_seen_at: "2026-09-24T10:00:00.000Z",
            dismissed_at: null,
          },
          error: null,
        }),
      ],
      shops: [query({ data: { id: "shop-1", is_open: true }, error: null })],
      shop_pickup_areas: [query({ data: null, count: 1, error: null })],
      products: [query({ data: null, count: 1, error: null })],
    };
    supabaseAdmin.from.mockImplementation((table) => responses[table].shift());

    const result = await getOnboarding("seller-1");

    expect(result).toEqual({
      version: 1,
      role: "seller",
      welcomeSeen: true,
      dismissed: false,
      steps: { shop: true, pickup: true, listing: true, open: true },
    });
  });
});
