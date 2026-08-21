const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = new Set(["name", "tagline", "description", "isOpen"]);

function text(value, field, errors, { min = 1, max }) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    errors.push({ field, message: `must contain between ${min} and ${max} characters` });
  }
}

function validate(input, creating) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  const errors = [];
  for (const field of Object.keys(input)) {
    if (!FIELDS.has(field)) errors.push({ field, message: "is not allowed" });
  }
  if (creating && !("name" in input)) errors.push({ field: "name", message: "is required" });
  if ("name" in input) text(input.name, "name", errors, { min: 3, max: 100 });
  if ("tagline" in input && input.tagline !== null) text(input.tagline, "tagline", errors, { max: 160 });
  if ("description" in input && input.description !== null) text(input.description, "description", errors, { max: 2000 });
  if ("isOpen" in input && typeof input.isOpen !== "boolean") errors.push({ field: "isOpen", message: "must be a boolean" });
  if (!creating && Object.keys(input).length === 0) errors.push({ field: "body", message: "must contain at least one shop field" });
  return errors;
}

export const validateCreateShop = (input) => validate(input, true);
export const validateUpdateShop = (input) => validate(input, false);

export function validatePickupAreas(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  if (Object.keys(input).some((field) => field !== "campusIds")) {
    return [{ field: "body", message: "only campusIds is allowed" }];
  }
  if (!Array.isArray(input.campusIds) || input.campusIds.length > 10) {
    return [{ field: "campusIds", message: "must be an array of at most 10 campus UUIDs" }];
  }
  if (new Set(input.campusIds).size !== input.campusIds.length || input.campusIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return [{ field: "campusIds", message: "must contain unique valid UUIDs" }];
  }
  return [];
}
