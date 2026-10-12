import { describe, expect, it } from "vitest";

import { validateUpdateSettings } from "../../src/validators/settings.validator.js";

describe("settings validation", () => {
  it("accepts booleans and rejects empty, unknown, and non-boolean preferences", () => {
    expect(validateUpdateSettings({ notify_new_orders: false })).toEqual([]);
    expect(validateUpdateSettings({})).toHaveLength(1);
    expect(
      validateUpdateSettings({ role: "admin", notify_new_orders: "true" }),
    ).toEqual([
      { field: "role", message: "is not allowed" },
      { field: "notify_new_orders", message: "must be boolean" },
    ]);
  });
});
