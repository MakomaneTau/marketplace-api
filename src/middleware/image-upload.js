import multer from "multer";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const verificationUpload = multer({
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

export const marketplaceImageUpload = multer({
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
