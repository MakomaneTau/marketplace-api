import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.SUPABASE_SECRET_KEY ||= "test-secret-key";
});
import {
  StorageServiceError,
  validateImage,
} from "../../src/services/storage.service.js";

describe("image content validation", () => {
  it("accepts a PNG signature that matches its MIME type", () => {
    const extension = validateImage({
      mimetype: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    });

    expect(extension).toBe("png");
  });

  it("rejects a file whose content does not match its declared MIME type", () => {
    expect(() =>
      validateImage({
        mimetype: "image/png",
        buffer: Buffer.from("not an image"),
      })
    ).toThrowError(StorageServiceError);
  });
});
