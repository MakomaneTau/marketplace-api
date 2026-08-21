import * as favouritesService from "../services/favourites.service.js";
import { sendData, sendError } from "../http/responses.js";
import { validateProductId } from "../validators/products.validator.js";

function validation(res, details) {
  return sendError(res, { status: 400, code: "VALIDATION_ERROR", message: "The request contains invalid favourite data.", details });
}

function handleError(res, error) {
  if (error instanceof favouritesService.FavouriteServiceError) {
    return sendError(res, { status: error.status, code: error.code, message: error.message });
  }
  return sendError(res, { status: 500, code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." });
}

function pagination(query) {
  const errors = [];
  for (const field of Object.keys(query)) if (!new Set(["page", "limit"]).has(field)) errors.push({ field, message: "is not allowed" });
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 24;
  if (!Number.isInteger(page) || page < 1 || page > 1000000) errors.push({ field: "page", message: "must be a positive integer" });
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) errors.push({ field: "limit", message: "must be an integer between 1 and 100" });
  return { errors, page, limit };
}

export async function listFavourites(req, res) {
  const { errors, page, limit } = pagination(req.query);
  if (errors.length) return validation(res, errors);
  try {
    const result = await favouritesService.listFavourites(req.user.id, { page, limit });
    return sendData(res, result.products, { meta: { page, limit, total: result.total, totalPages: result.totalPages } });
  } catch (error) { return handleError(res, error); }
}

export async function saveFavourite(req, res) {
  const errors = validateProductId(req.params.productId).map((error) => ({ ...error, field: "productId" }));
  if (errors.length) return validation(res, errors);
  try { return sendData(res, await favouritesService.saveFavourite(req.user.id, req.params.productId)); }
  catch (error) { return handleError(res, error); }
}

export async function removeFavourite(req, res) {
  const errors = validateProductId(req.params.productId).map((error) => ({ ...error, field: "productId" }));
  if (errors.length) return validation(res, errors);
  try {
    await favouritesService.removeFavourite(req.user.id, req.params.productId);
    return res.status(204).send();
  } catch (error) { return handleError(res, error); }
}
