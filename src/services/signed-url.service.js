// The API may reach local Supabase through Docker's internal hostname while
// signed Storage links are opened by a browser on the host machine.
export function browserSignedUrl(
  signedUrl,
  browserBase = process.env.BROWSER_SUPABASE_URL,
) {
  if (!browserBase) return signedUrl;

  const internal = new URL(signedUrl);
  const browser = new URL(browserBase);
  if (!["http:", "https:"].includes(browser.protocol)) {
    throw new Error("BROWSER_SUPABASE_URL must be an HTTP(S) URL.");
  }
  internal.protocol = browser.protocol;
  internal.host = browser.host;
  return internal.toString();
}
