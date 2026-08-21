import { sendData, sendError } from "../http/responses.js";
import * as referenceService from "../services/reference.service.js";
import {
  validateReferenceQuery,
  validateSlug,
} from "../validators/reference.validator.js";

function validationError(res, details) {
  return sendError(res, {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "The request contains invalid reference-data parameters.",
    details,
  });
}

function serviceError(res, error) {
  if (error instanceof referenceService.ReferenceServiceError) {
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

export async function listCategories(req, res) {
  const errors = validateReferenceQuery(req.query, { allowFeatured: true });
  if (errors.length) return validationError(res, errors);

  try {
    return sendData(
      res,
      await referenceService.listCategories({
        q: req.query.q,
        featured:
          req.query.featured === undefined ? undefined : req.query.featured === "true",
      })
    );
  } catch (error) {
    return serviceError(res, error);
  }
}

export async function getCategory(req, res) {
  const errors = validateSlug(req.params.slug);
  if (errors.length) return validationError(res, errors);

  try {
    return sendData(res, await referenceService.getCategory(req.params.slug));
  } catch (error) {
    return serviceError(res, error);
  }
}

export async function listUniversities(req, res) {
  const errors = validateReferenceQuery(req.query);
  if (errors.length) return validationError(res, errors);

  try {
    return sendData(
      res,
      await referenceService.listUniversities({ q: req.query.q })
    );
  } catch (error) {
    return serviceError(res, error);
  }
}

export async function getUniversity(req, res) {
  const errors = validateSlug(req.params.slug);
  if (errors.length) return validationError(res, errors);

  try {
    return sendData(res, await referenceService.getUniversity(req.params.slug));
  } catch (error) {
    return serviceError(res, error);
  }
}

export async function listCampuses(req, res) {
  const errors = validateSlug(req.params.slug);
  if (errors.length) return validationError(res, errors);

  try {
    return sendData(res, await referenceService.listCampuses(req.params.slug));
  } catch (error) {
    return serviceError(res, error);
  }
}
