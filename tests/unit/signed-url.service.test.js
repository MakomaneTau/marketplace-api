import { describe, expect, it } from "vitest";
import { browserSignedUrl } from "../../src/services/signed-url.service.js";

describe("browserSignedUrl", () => {
  const signed =
    "http://host.docker.internal:54321/storage/v1/object/sign/verification-documents/a%2Fb.jpg?token=secret&download=false";

  it("uses the browser-facing local origin without changing the signed path or token", () => {
    expect(browserSignedUrl(signed, "http://localhost:54321")).toBe(
      "http://localhost:54321/storage/v1/object/sign/verification-documents/a%2Fb.jpg?token=secret&download=false",
    );
  });

  it("preserves hosted links when no browser override is configured", () => {
    expect(browserSignedUrl(signed, "")).toBe(signed);
  });
});
