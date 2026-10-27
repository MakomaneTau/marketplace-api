import { beforeEach, expect, it, vi } from "vitest";

vi.mock("../../src/config/supabase.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock("../../src/services/admin.service.js", () => ({ isAdmin: vi.fn() }));
import { supabaseAdmin } from "../../src/config/supabase.js";
import { isAdmin } from "../../src/services/admin.service.js";
import { getProfile, switchRole } from "../../src/services/profile.service.js";

let query;
beforeEach(() => {
  vi.clearAllMocks();
  isAdmin.mockResolvedValue(false);
  query = {
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: "user", role: "seller", active_role: "buyer" },
    }),
  };
  supabaseAdmin.from.mockReturnValue(query);
});

it("preserves seller capability when the owner switches to buying", async () => {
  const result = await switchRole("user", "buyer");
  expect(query.update).toHaveBeenCalledWith({ active_role: "buyer" });
  expect(query.eq).toHaveBeenCalledWith("id", "user");
  expect(result).toMatchObject({ role: "buyer", canSell: true });
});

it("enables selling and selects seller mode in one write", async () => {
  await switchRole("user", "seller");
  expect(query.update).toHaveBeenCalledWith({
    role: "seller",
    active_role: "seller",
  });
});

it("uses active mode for reads and falls back for existing accounts", async () => {
  expect(await getProfile("user")).toMatchObject({
    role: "buyer",
    canSell: true,
  });
  query.maybeSingle.mockResolvedValue({ data: { role: "seller" } });
  expect(await getProfile("user")).toMatchObject({
    role: "seller",
    canSell: true,
  });
});

it("does not allow admins or invalid roles to mutate profiles", async () => {
  await expect(switchRole("user", "admin")).rejects.toMatchObject({
    status: 400,
  });
  isAdmin.mockResolvedValue(true);
  await expect(switchRole("user", "buyer")).rejects.toMatchObject({
    status: 403,
  });
  expect(query.update).not.toHaveBeenCalled();
});

it("fails closed when profile persistence fails or the profile is missing", async () => {
  query.maybeSingle.mockResolvedValue({ error: { message: "offline" } });
  await expect(switchRole("user", "buyer")).rejects.toMatchObject({
    status: 503,
  });
  query.maybeSingle.mockResolvedValue({ data: null });
  await expect(switchRole("user", "buyer")).rejects.toMatchObject({
    status: 404,
  });
});
