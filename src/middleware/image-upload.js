import multer from "multer";
import { uploadRateLimit } from "./rate-limit.js";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const verificationParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
    fields: 0,
    parts: 3,
  },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error("Only JPEG, PNG, and WebP images are allowed.");
      error.code = "UNSUPPORTED_IMAGE_TYPE";
      return callback(error);
    }
    return callback(null, true);
  },
}).fields([
  { name: "selfie", maxCount: 1 },
  { name: "sellerId", maxCount: 1 },
]);

const marketplaceImageParser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error("Only JPEG, PNG, and WebP images are allowed.");
      error.code = "UNSUPPORTED_IMAGE_TYPE";
      return callback(error);
    }
    return callback(null, true);
  },
}).single("image");

export function verificationUpload(req, res, next) {
  uploadRateLimit(req, res, () => verificationParser(req, res, next));
}

export function marketplaceImageUpload(req, res, next) {
  uploadRateLimit(req, res, () => marketplaceImageParser(req, res, next));
}
