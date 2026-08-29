import * as productsService from "../services/products.service.js";
import {
  validateCreateProduct,
  validateProductListQuery,
  validateProductId,
  validateUpdateProduct,
} from "../validators/products.validator.js";
import { sendData, sendError } from "../http/responses.js";

function sendValidationError(res, details) {
  return sendError(res, {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "The request contains invalid product data.",
    details,
  });
}

function handleError(res, error) {
  if (error instanceof productsService.ProductServiceError) {
    return sendError(res, {
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }
  return sendError(res, {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  });
}

export async function listProducts(req, res) {
  const errors = validateProductListQuery(req.query);
  if (errors.length) return sendValidationError(res, errors);
  try {
    const result = await productsService.listProducts({
      q: req.query.q?.trim(), category: req.query.category, slug: req.query.slug,
      condition: req.query.condition, sort: req.query.sort,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 24,
    });
    return sendData(res, result.products, { meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listSellerProducts(req, res) {
  const errors = validateProductListQuery(req.query, { seller: true });
  if (errors.length) return sendValidationError(res, errors);
  try {
    const result = await productsService.listSellerProducts(req.user.id, {
      q: req.query.q?.trim(), category: req.query.category,
      condition: req.query.condition, status: req.query.status, sort: req.query.sort,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 24,
    });
    return sendData(res, result.products, { meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
  } catch (error) { return handleError(res, error); }
}

export async function createSellerProduct(req, res) {
  const managedFields = ["shop_id", "image_urls"].filter((field) =>
    Object.prototype.hasOwnProperty.call(req.body || {}, field)
  );
  if (managedFields.length) {
    return sendValidationError(res, managedFields.map((field) => ({ field, message: "is managed by the API" })));
  }
  const input = { ...req.body };
  const errors = validateCreateProduct({
    ...input,
    shop_id: "00000000-0000-4000-8000-000000000000",
    image_urls: [],
  }).filter((error) => error.field !== "shop_id");
  if (errors.length) return sendValidationError(res, errors);
  try { return sendData(res, await productsService.createSellerProduct(input, req.user.id), { status: 201 }); }
  catch (error) { return handleError(res, error); }
}

export async function updateSellerProduct(req, res) {
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "image_urls")) {
    return sendValidationError(res, [{ field: "image_urls", message: "is managed by the image endpoints" }]);
  }
  return updateProduct(req, res);
}

export async function addProductImage(req, res) {
  const errors = validateProductId(req.params.id);
  if (errors.length) return sendValidationError(res, errors);
  if (!req.file) return sendError(res, { status: 400, code: "IMAGE_REQUIRED", message: "An image file is required." });
  try { return sendData(res, await productsService.addProductImage(req.params.id, req.user.id, req.file)); }
  catch (error) { return handleError(res, error); }
}

export async function removeProductImage(req, res) {
  const errors = validateProductId(req.params.id);
  const imageIndex = Number(req.params.index);
  if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex > 5) errors.push({ field: "index", message: "must be an integer between 0 and 5" });
  if (errors.length) return sendValidationError(res, errors);
  try { return sendData(res, await productsService.removeProductImage(req.params.id, imageIndex, req.user.id)); }
  catch (error) { return handleError(res, error); }
}

export async function getProduct(req, res) {
  const errors = validateProductId(req.params.id);
  if (errors.length) return sendValidationError(res, errors);
  try {
    return sendData(res, await productsService.getProduct(req.params.id));
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createProduct(req, res) {
  const errors = validateCreateProduct(req.body);
  if (errors.length) return sendValidationError(res, errors);
  try {
    const product = await productsService.createProduct(req.body, req.user.id);
    return sendData(res, product, { status: 201 });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateProduct(req, res) {
  const errors = [...validateProductId(req.params.id), ...validateUpdateProduct(req.body)];
  if (errors.length) return sendValidationError(res, errors);
  try {
    const product = await productsService.updateProduct(req.params.id, req.body, req.user.id);
    return sendData(res, product);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteProduct(req, res) {
  const errors = validateProductId(req.params.id);
  if (errors.length) return sendValidationError(res, errors);
  try {
    await productsService.deleteProduct(req.params.id, req.user.id);
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
}
