const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["new", "preparing", "ready", "completed", "cancelled"]);

export function validateOrderId(id) {
  return UUID.test(id) ? [] : [{ field: "id", message: "must be a valid UUID" }];
}

export function validateCreateOrder(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [{ field: "body", message: "must be a JSON object" }];
  const errors = [];
  const allowed = new Set(["items", "fulfilmentType", "pickupCampusId", "deliveryAddress", "pickupNotes"]);
  for (const field of Object.keys(input)) if (!allowed.has(field)) errors.push({ field, message: "is not allowed" });
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) {
    errors.push({ field: "items", message: "must contain between 1 and 20 products" });
  } else {
    const ids = new Set();
    input.items.forEach((item, index) => {
      if (!item || typeof item !== "object" || Object.keys(item).some((field) => !new Set(["productId", "quantity"]).has(field))) {
        errors.push({ field: `items.${index}`, message: "must contain only productId and quantity" }); return;
      }
      if (typeof item.productId !== "string" || !UUID.test(item.productId)) errors.push({ field: `items.${index}.productId`, message: "must be a valid UUID" });
      if (ids.has(item.productId)) errors.push({ field: `items.${index}.productId`, message: "must be unique" });
      ids.add(item.productId);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) errors.push({ field: `items.${index}.quantity`, message: "must be an integer between 1 and 99" });
    });
  }
  if (!new Set(["campus_pickup", "delivery"]).has(input.fulfilmentType)) errors.push({ field: "fulfilmentType", message: "must be campus_pickup or delivery" });
  if (input.fulfilmentType === "campus_pickup" && (typeof input.pickupCampusId !== "string" || !UUID.test(input.pickupCampusId))) errors.push({ field: "pickupCampusId", message: "must be a valid UUID for campus pickup" });
  if (input.fulfilmentType === "delivery" && (typeof input.deliveryAddress !== "string" || !input.deliveryAddress.trim() || input.deliveryAddress.trim().length > 500)) errors.push({ field: "deliveryAddress", message: "must contain between 1 and 500 characters for delivery" });
  if ("pickupNotes" in input && input.pickupNotes !== null && (typeof input.pickupNotes !== "string" || input.pickupNotes.length > 500)) errors.push({ field: "pickupNotes", message: "must be at most 500 characters" });
  return errors;
}

export function validateOrderStatus(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !("status" in input)) return [{ field: "body", message: "must contain only status" }];
  return STATUSES.has(input.status) ? [] : [{ field: "status", message: "must be a valid order status" }];
}

export function validateOrderListQuery(query) {
  const errors = [];
  for (const field of Object.keys(query)) if (!new Set(["status", "page", "limit"]).has(field)) errors.push({ field, message: "is not allowed" });
  if ("status" in query && !STATUSES.has(query.status)) errors.push({ field: "status", message: "must be a valid order status" });
  for (const [field, maximum] of [["page", 1000000], ["limit", 100]]) if (field in query) {
    const value = Number(query[field]);
    if (!Number.isInteger(value) || value < 1 || value > maximum) errors.push({ field, message: `must be an integer between 1 and ${maximum}` });
  }
  return errors;
}
