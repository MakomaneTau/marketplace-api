import { afterEach, expect, it, vi } from "vitest";

import { boundedFetch } from "../../src/http/bounded-fetch.js";

afterEach(() => vi.unstubAllGlobals());

it("cancels a stalled upstream request at its deadline", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_input, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    ),
  );
  await expect(
    boundedFetch("https://provider.invalid", {}, 20),
  ).rejects.toMatchObject({ name: "TimeoutError" });
});

it("preserves caller cancellation and request options", async () => {
  const controller = new globalThis.AbortController();
  controller.abort();
  const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", mock);
  await boundedFetch("https://provider.invalid", {
    method: "POST",
    signal: controller.signal,
  });
  expect(mock.mock.calls[0][1].method).toBe("POST");
  expect(mock.mock.calls[0][1].signal.aborted).toBe(true);
});
