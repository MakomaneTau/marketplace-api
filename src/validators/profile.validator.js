const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set([
  "firstName",
  "lastName",
  "displayName",
  "phone",
  "avatarUrl",
  "isStudent",
  "universitySlug",
  "campusId",
  "studentNumber",
]);

export function validateProfileUpdate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  if (Object.keys(input).length === 0) {
    return [{ field: "body", message: "must contain at least one profile field" }];
  }

  const errors = [];
  for (const field of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(field)) errors.push({ field, message: "is not allowed" });
  }

  for (const field of ["firstName", "lastName", "displayName"]) {
    if (field in input && (typeof input[field] !== "string" || !input[field].trim() || input[field].trim().length > 100)) {
      errors.push({ field, message: "must be a non-empty string of at most 100 characters" });
    }
  }
  for (const field of ["phone", "avatarUrl", "universitySlug", "studentNumber"]) {
    if (field in input && input[field] !== null && (typeof input[field] !== "string" || !input[field].trim() || input[field].trim().length > 500)) {
      errors.push({ field, message: "must be null or a non-empty string" });
    }
  }
  if ("isStudent" in input && typeof input.isStudent !== "boolean") {
    errors.push({ field: "isStudent", message: "must be a boolean" });
  }
  if ("campusId" in input && input.campusId !== null && (typeof input.campusId !== "string" || !UUID_PATTERN.test(input.campusId))) {
    errors.push({ field: "campusId", message: "must be null or a valid UUID" });
  }

  return errors;
}
