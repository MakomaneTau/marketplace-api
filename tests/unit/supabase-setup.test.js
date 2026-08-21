import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("local Supabase setup", () => {
  it("references existing seed files in dependency order", () => {
    const config = read("supabase/config.toml");
    const expectedPaths = [
      "./seeds/05_universities.sql",
      "./seeds/01_users.sql",
      "./seeds/02_shops.sql",
      "./seeds/03_categories.sql",
      "./seeds/04_products.sql",
    ];

    let previousIndex = -1;
    for (const seedPath of expectedPaths) {
      const index = config.indexOf(`\"${seedPath}\"`);
      expect(index, `${seedPath} must be configured`).toBeGreaterThan(previousIndex);
      expect(() => read(seedPath.replace("./", "supabase/"))).not.toThrow();
      previousIndex = index;
    }
  });

  it("keeps managed profile fields out of authenticated update grants", () => {
    const migration = read(
      "supabase/migrations/20260821000100_harden_api_access.sql"
    );

    expect(migration).toContain("revoke update on public.profiles from authenticated");
    expect(migration).toContain("grant update (");

    const grantedColumns = migration
      .slice(migration.indexOf("grant update ("), migration.indexOf(") on public.profiles"));

    for (const managedColumn of [
      "role",
      "verification_status",
      "rating",
      "review_count",
    ]) {
      expect(grantedColumns).not.toMatch(new RegExp(`\\b${managedColumn}\\b`));
    }
  });
});
