const fields = new Set([
  "notify_new_orders",
  "notify_new_messages",
  "notify_listing_updates",
  "notify_marketplace_tips",
]);

export function validateUpdateSettings(input = {}) {
  const errors = [];
  if (!Object.keys(input).length)
    errors.push({ field: "body", message: "must contain a preference" });
  for (const [field, value] of Object.entries(input)) {
    if (!fields.has(field)) errors.push({ field, message: "is not allowed" });
    else if (typeof value !== "boolean")
      errors.push({ field, message: "must be boolean" });
  }
  return errors;
}
