import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("local Supabase setup", () => {
  it("keeps deployment reference data in migrations and local fixtures ordered", () => {
    const config = read("supabase/config.toml");
    const universityMigration = read(
      "supabase/migrations/20260821001000_seed_public_universities.sql"
    );
    const expectedPaths = [
      "./seeds/01_users.sql",
      "./seeds/02_shops.sql",
      "./seeds/03_categories.sql",
      "./seeds/04_products.sql",
    ];

    expect(config).not.toContain('"./seeds/05_universities.sql"');
    expect(universityMigration).toContain("insert into public.universities");
    expect(universityMigration).toContain("insert into public.campuses");
    expect(universityMigration).toContain("on conflict (slug) do update");
    expect(universityMigration).toContain(
      "on conflict (university_id, name) do update"
    );

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

  it("generates stable product slugs without replacing UUID identities", () => {
    const migration = read(
      "supabase/migrations/20260829000100_add_product_public_slugs.sql"
    );

    expect(migration).toContain("add column slug text");
    expect(migration).toContain("build_product_public_slug(title, id)");
    expect(migration).toContain("split_part(product_id::text, '-', 1)");
    expect(migration).toContain("before insert on public.products");
    expect(migration).not.toContain("before update on public.products");
  });
});
