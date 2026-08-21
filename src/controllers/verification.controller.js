import { sendData, sendError } from "../http/responses.js";
import { StorageServiceError } from "../services/storage.service.js";
import * as verificationService from "../services/verification.service.js";

function handleError(res, error) {
  if (
    error instanceof verificationService.VerificationServiceError ||
    error instanceof StorageServiceError
  ) {
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

export async function getSellerVerification(req, res) {
  try {
    return sendData(
      res,
      await verificationService.getSellerVerification(req.user.id)
    );
  } catch (error) {
    return handleError(res, error);
  }
}

export async function submitSellerVerification(req, res) {
  const selfie = req.files?.selfie?.[0];
  const sellerId = req.files?.sellerId?.[0];
  if (!selfie || !sellerId) {
    return sendError(res, {
      status: 400,
      code: "VERIFICATION_FILES_REQUIRED",
      message: "Both selfie and sellerId image files are required.",
    });
  }

  try {
    return sendData(
      res,
      await verificationService.submitSellerVerification(req.user.id, {
        selfie,
        sellerId,
      }),
      { status: 201 }
    );
  } catch (error) {
    return handleError(res, error);
  }
}
