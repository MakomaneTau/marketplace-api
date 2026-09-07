export function parseBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    return { token: null, error: "missing" };
  }

  const match = authorizationHeader.trim().match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return { token: null, error: "malformed" };
  }

  return { token: match[1], error: null };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredString(value, field, errors, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    errors.push({ field, message: `must contain between ${min} and ${max} characters` });
  }
}

function validateEmail(value, errors) {
  if (typeof value !== "string" || value.length > 320 || !EMAIL_PATTERN.test(value)) {
    errors.push({ field: "email", message: "must be a valid email address" });
  }
}

function rejectUnknown(input, allowed, errors) {
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) errors.push({ field, message: "is not allowed" });
  }
}

export function validateSignup(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }

  const errors = [];
  rejectUnknown(
    input,
    new Set([
      "firstName",
      "lastName",
      "email",
      "password",
      "role",
      "isStudent",
      "universitySlug",
      "studentNumber",
    ]),
    errors
  );
  requiredString(input.firstName, "firstName", errors, { max: 100 });
  requiredString(input.lastName, "lastName", errors, { max: 100 });
  validateEmail(input.email, errors);
  requiredString(input.password, "password", errors, { min: 8, max: 72 });

  if (!new Set(["buyer", "seller"]).has(input.role)) {
    errors.push({ field: "role", message: "must be buyer or seller" });
  }
  if (input.isStudent !== undefined && typeof input.isStudent !== "boolean") {
    errors.push({ field: "isStudent", message: "must be a boolean" });
  }
  if (input.role === "buyer" && input.isStudent === false) {
    errors.push({ field: "isStudent", message: "buyers must be students" });
  }

  if (input.role === "buyer" || input.universitySlug != null) {
    requiredString(input.universitySlug, "universitySlug", errors, { max: 150 });
  }

  return errors;
}

export function validateLogin(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  const errors = [];
  rejectUnknown(input, new Set(["email", "password"]), errors);
  validateEmail(input.email, errors);
  requiredString(input.password, "password", errors, { min: 1, max: 72 });
  return errors;
}

export function validateRefresh(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  const errors = [];
  rejectUnknown(input, new Set(["refreshToken"]), errors);
  requiredString(input.refreshToken, "refreshToken", errors, { max: 4096 });
  return errors;
}

export function validateForgotPassword(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  const errors = [];
  rejectUnknown(input, new Set(["email"]), errors);
  validateEmail(input.email, errors);
  return errors;
}

export function validateResetPassword(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  const errors = [];
  rejectUnknown(input, new Set(["password"]), errors);
  requiredString(input.password, "password", errors, { min: 8, max: 72 });
  return errors;
}
