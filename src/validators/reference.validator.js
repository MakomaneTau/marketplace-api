const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug) {
  return typeof slug === "string" && SLUG_PATTERN.test(slug)
    ? []
    : [{ field: "slug", message: "must be a valid lowercase slug" }];
}

export function validateReferenceQuery(query, { allowFeatured = false } = {}) {
  const errors = [];
  const allowed = new Set(allowFeatured ? ["q", "featured"] : ["q"]);

  for (const field of Object.keys(query)) {
    if (!allowed.has(field)) errors.push({ field, message: "is not allowed" });
  }

  if ("q" in query) {
    if (typeof query.q !== "string" || query.q.trim().length > 100) {
      errors.push({ field: "q", message: "must be a string of at most 100 characters" });
    }
  }

  if (allowFeatured && "featured" in query && !["true", "false"].includes(query.featured)) {
    errors.push({ field: "featured", message: "must be true or false" });
  }

  return errors;
}
