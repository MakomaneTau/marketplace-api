import { supabaseAdmin } from "../config/supabase.js";

export class ReferenceServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ReferenceServiceError";
    this.status = status;
    this.code = code;
  }
}

function unavailable() {
  return new ReferenceServiceError(
    503,
    "REFERENCE_SERVICE_UNAVAILABLE",
    "Reference data is temporarily unavailable."
  );
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listCategories({ q, featured } = {}) {
  let categoriesQuery = supabaseAdmin
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (q?.trim()) categoriesQuery = categoriesQuery.ilike("name", `%${escapeLike(q.trim())}%`);
  if (featured !== undefined) categoriesQuery = categoriesQuery.eq("is_featured", featured);

  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      categoriesQuery,
      supabaseAdmin
        .from("products")
        .select("category_id, shop:shops!inner(is_open)")
        .eq("status", "active")
        .eq("shops.is_open", true),
    ]);

  if (categoriesError || productsError) throw unavailable();

  const counts = new Map();
  for (const product of products) {
    counts.set(product.category_id, (counts.get(product.category_id) || 0) + 1);
  }

  return categories.map((category) => ({
    ...category,
    product_count: counts.get(category.id) || 0,
  }));
}

export async function getCategory(slug) {
  const categories = await listCategories();
  const category = categories.find((item) => item.slug === slug);

  if (!category) {
    throw new ReferenceServiceError(404, "CATEGORY_NOT_FOUND", "Category not found.");
  }

  return category;
}

export async function listUniversities({ q } = {}) {
  let query = supabaseAdmin
    .from("universities")
    .select("*, campuses(count)")
    .order("name", { ascending: true });

  if (q?.trim()) query = query.ilike("name", `%${escapeLike(q.trim())}%`);

  const { data, error } = await query;
  if (error) throw unavailable();

  return data.map(({ campuses, ...university }) => ({
    ...university,
    campus_count: campuses?.[0]?.count || 0,
  }));
}

async function findUniversity(slug) {
  const { data, error } = await supabaseAdmin
    .from("universities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw unavailable();
  if (!data) {
    throw new ReferenceServiceError(404, "UNIVERSITY_NOT_FOUND", "University not found.");
  }

  return data;
}

export async function listCampuses(slug) {
  const university = await findUniversity(slug);
  const { data, error } = await supabaseAdmin
    .from("campuses")
    .select("*")
    .eq("university_id", university.id)
    .order("name", { ascending: true });

  if (error) throw unavailable();
  return { university, campuses: data };
}

export async function getUniversity(slug) {
  const { university, campuses } = await listCampuses(slug);
  return { ...university, campuses, campus_count: campuses.length };
}
