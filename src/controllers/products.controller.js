import * as productsService from "../services/products.service.js";
import {
  validateCreateProduct,
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
  try {
    return sendData(res, await productsService.listProducts());
  } catch (error) {
    return handleError(res, error);
  }
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
