const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONDITIONS = new Set(["new", "like_new", "good", "fair"]);
const STATUSES = new Set(["draft", "active", "sold", "paused"]);
const SORTS = new Set(["newest", "price_asc", "price_desc", "most_viewed"]);

const CREATE_FIELDS = new Set([
  "shop_id",
  "category_id",
  "title",
  "description",
  "condition",
  "price",
  "currency",
  "stock_quantity",
  "image_urls",
  "pickup_location",
  "allows_campus_pickup",
  "allows_delivery",
  "status",
]);

const UPDATE_FIELDS = new Set([...CREATE_FIELDS].filter((field) => field !== "shop_id"));

function addError(errors, field, message) {
  errors.push({ field, message });
}

function validateString(value, field, errors, { min = 1, max } = {}) {
  if (typeof value !== "string") {
    addError(errors, field, "must be a string");
    return;
  }

  const length = value.trim().length;
  if (length < min || (max !== undefined && length > max)) {
    const range = max === undefined ? `at least ${min}` : `between ${min} and ${max}`;
    addError(errors, field, `must contain ${range} characters`);
  }
}

function validateFields(input, allowedFields, errors) {
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) addError(errors, field, "is not allowed");
  }

  for (const field of ["shop_id", "category_id"]) {
    if (field in input && (typeof input[field] !== "string" || !UUID_PATTERN.test(input[field]))) {
      addError(errors, field, "must be a valid UUID");
    }
  }

  if ("title" in input) validateString(input.title, "title", errors, { min: 5, max: 100 });
  if ("description" in input) validateString(input.description, "description", errors, { min: 20, max: 2000 });
  if ("pickup_location" in input) validateString(input.pickup_location, "pickup_location", errors);

  if ("condition" in input && !CONDITIONS.has(input.condition)) {
    addError(errors, "condition", "must be one of: new, like_new, good, fair");
  }
  if ("status" in input && !STATUSES.has(input.status)) {
    addError(errors, "status", "must be one of: draft, active, sold, paused");
  }
  if ("price" in input && (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0)) {
    addError(errors, "price", "must be a positive number");
  }
  if ("currency" in input && (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency))) {
    addError(errors, "currency", "must be a three-letter uppercase currency code");
  }
  if ("stock_quantity" in input && (!Number.isInteger(input.stock_quantity) || input.stock_quantity < 0)) {
    addError(errors, "stock_quantity", "must be a non-negative integer");
  }
  if ("image_urls" in input) {
    if (!Array.isArray(input.image_urls) || input.image_urls.length > 6 || input.image_urls.some((url) => typeof url !== "string" || !url.trim())) {
      addError(errors, "image_urls", "must be an array of at most 6 non-empty strings");
    }
  }
  for (const field of ["allows_campus_pickup", "allows_delivery"]) {
    if (field in input && typeof input[field] !== "boolean") addError(errors, field, "must be a boolean");
  }
}

export function validateProductId(id) {
  return UUID_PATTERN.test(id)
    ? []
    : [{ field: "id", message: "must be a valid UUID" }];
}

export function validateCreateProduct(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }

  for (const field of ["shop_id", "category_id", "title", "description", "condition", "price", "pickup_location"]) {
    if (!(field in input)) addError(errors, field, "is required");
  }
  validateFields(input, CREATE_FIELDS, errors);

  const allowsPickup = input.allows_campus_pickup ?? true;
  const allowsDelivery = input.allows_delivery ?? false;
  if (!allowsPickup && !allowsDelivery) {
    addError(errors, "allows_campus_pickup", "at least one fulfilment method must be enabled");
  }
  if (input.status === "active" && (!(input.stock_quantity > 0) || !Array.isArray(input.image_urls) || input.image_urls.length === 0)) {
    addError(errors, "status", "active products require stock and at least one image");
  }
  return errors;
}

export function validateUpdateProduct(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", message: "must be a JSON object" }];
  }
  if (Object.keys(input).length === 0) {
    return [{ field: "body", message: "must contain at least one product field" }];
  }

  const errors = [];
  validateFields(input, UPDATE_FIELDS, errors);
  if (input.allows_campus_pickup === false && input.allows_delivery === false) {
    addError(errors, "allows_campus_pickup", "at least one fulfilment method must be enabled");
  }
  return errors;
}

export function validateProductListQuery(query, { seller = false } = {}) {
  const errors = [];
  const allowed = new Set(["q", "category", "condition", "sort", "page", "limit"]);
  if (seller) allowed.add("status");
  for (const field of Object.keys(query)) {
    if (!allowed.has(field)) addError(errors, field, "is not allowed");
  }
  if ("q" in query && (typeof query.q !== "string" || query.q.trim().length > 100)) addError(errors, "q", "must be at most 100 characters");
  if ("category" in query && (typeof query.category !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(query.category))) addError(errors, "category", "must be a valid category slug");
  if ("condition" in query && !CONDITIONS.has(query.condition)) addError(errors, "condition", "must be a valid product condition");
  if ("status" in query && !STATUSES.has(query.status)) addError(errors, "status", "must be a valid listing status");
  if ("sort" in query && !SORTS.has(query.sort)) addError(errors, "sort", "must be newest, price_asc, price_desc, or most_viewed");
  for (const [field, maximum] of [["page", 1000000], ["limit", 100]]) {
    if (field in query) {
      const number = Number(query[field]);
      if (!Number.isInteger(number) || number < 1 || number > maximum) addError(errors, field, `must be an integer between 1 and ${maximum}`);
    }
  }
  return errors;
}
