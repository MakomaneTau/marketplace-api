import { sendData, sendError } from "../http/responses.js";
import { StorageServiceError } from "../services/storage.service.js";
import * as shopsService from "../services/shops.service.js";
import {
  validateCreateShop,
  validatePickupAreas,
  validateUpdateShop,
} from "../validators/shops.validator.js";
import { validateSlug } from "../validators/reference.validator.js";

function fail(res, error) {
  if (error instanceof shopsService.ShopServiceError || error instanceof StorageServiceError) {
    return sendError(res, { status: error.status, code: error.code, message: error.message });
  }
  return sendError(res, { status: 500, code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." });
}

function invalid(res, details) {
  return sendError(res, { status: 400, code: "VALIDATION_ERROR", message: "The request contains invalid shop data.", details });
}

export async function getPublicShop(req, res) {
  const errors = validateSlug(req.params.slug);
  if (errors.length) return invalid(res, errors);
  try { return sendData(res, await shopsService.getPublicShop(req.params.slug)); } catch (error) { return fail(res, error); }
}

export async function getSellerShop(req, res) {
  try { return sendData(res, await shopsService.getSellerShop(req.user.id)); } catch (error) { return fail(res, error); }
}

export async function createShop(req, res) {
  const errors = validateCreateShop(req.body);
  if (errors.length) return invalid(res, errors);
  try { return sendData(res, await shopsService.createShop(req.user.id, req.body), { status: 201 }); } catch (error) { return fail(res, error); }
}

export async function updateShop(req, res) {
  const errors = validateUpdateShop(req.body);
  if (errors.length) return invalid(res, errors);
  try { return sendData(res, await shopsService.updateShop(req.user.id, req.body)); } catch (error) { return fail(res, error); }
}

export async function replacePickupAreas(req, res) {
  const errors = validatePickupAreas(req.body);
  if (errors.length) return invalid(res, errors);
  try { return sendData(res, await shopsService.replacePickupAreas(req.user.id, req.body.campusIds)); } catch (error) { return fail(res, error); }
}

export function uploadShopImage(kind) {
  return async (req, res) => {
    if (!req.file) return sendError(res, { status: 400, code: "IMAGE_REQUIRED", message: "An image file is required." });
    try { return sendData(res, await shopsService.updateShopImage(req.user.id, kind, req.file)); } catch (error) { return fail(res, error); }
  };
}
