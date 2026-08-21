import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";

const fileTypes = {
  "image/jpeg": {
    extension: "jpg",
    matches: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  "image/webp": {
    extension: "webp",
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP",
  },
};

export class StorageServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "StorageServiceError";
    this.status = status;
    this.code = code;
  }
}

export function validateImage(file) {
  const type = fileTypes[file?.mimetype];
  if (!file?.buffer || !type || !type.matches(file.buffer)) {
    throw new StorageServiceError(
      400,
      "IMAGE_CONTENT_INVALID",
      "The uploaded file content does not match a supported image type."
    );
  }
  return type.extension;
}

export async function uploadPrivateImage({ bucket, ownerId, scopeId, label, file }) {
  const extension = validateImage(file);
  const path = `${ownerId}/${scopeId}/${label}-${randomUUID()}.${extension}`;
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.mimetype,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new StorageServiceError(
      503,
      "STORAGE_SERVICE_UNAVAILABLE",
      "File storage is temporarily unavailable."
    );
  }
  return path;
}

export async function removePrivateImages(bucket, paths) {
  if (!paths.length) return;
  const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "storage_cleanup_failed",
        bucket,
        object_count: paths.length,
      })
    );
  }
}

export async function uploadPublicImage({ bucket, ownerId, scopeId, label, file }) {
  const path = await uploadPrivateImage({ bucket, ownerId, scopeId, label, file });
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export function publicStoragePath(publicUrl, bucket) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = publicUrl?.indexOf(marker);
  return index === -1 || index === undefined
    ? null
    : decodeURIComponent(publicUrl.slice(index + marker.length));
}
