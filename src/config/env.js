import "dotenv/config";
import { isIP } from "node:net";

export function readConfig(environment = process.env) {
  const required = (name) => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`${name} is not defined.`);
    return value;
  };
  const positiveInteger = (
    name,
    fallback,
    maximum = Number.MAX_SAFE_INTEGER,
  ) => {
    const value = environment[name];
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum)
      throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
    return parsed;
  };
  const supabaseUrl = required("SUPABASE_URL");
  if (!["http:", "https:"].includes(new URL(supabaseUrl).protocol))
    throw new Error("SUPABASE_URL must use http or https.");
  const trustedProxies = (environment.TRUST_PROXY_CIDRS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const entry of trustedProxies) {
    const [address, prefix, ...extra] = entry.split("/");
    const version = isIP(address);
    if (
      !version ||
      extra.length ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    )
      throw new Error(
        "TRUST_PROXY_CIDRS must contain explicit IP addresses or non-zero CIDR ranges.",
      );
  }
  if (environment.TRUST_PROXY === "true" && !trustedProxies.length)
    throw new Error(
      "TRUST_PROXY=true requires explicit TRUST_PROXY_CIDRS; a hop count trusts spoofed forwarding headers on direct connections.",
    );
  const allowedOrigins = (
    environment.CORS_ORIGINS ||
    environment.CORS_ORIGIN ||
    "http://localhost:3000"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error(
          "CORS_ORIGINS must contain exact HTTP(S) origins without paths or credentials.",
        );
      return url.origin;
    });
  return Object.freeze({
    nodeEnv: environment.NODE_ENV || "development",
    port: positiveInteger("PORT", 4000, 65535),
    allowedOrigins,
    trustProxy: trustedProxies.length ? trustedProxies : false,
    rateLimitWindowMs: positiveInteger("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: positiveInteger("RATE_LIMIT_MAX", 120),
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabasePublishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
    supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
    passwordResetRedirectUrl: environment.PASSWORD_RESET_REDIRECT_URL,
  });
}

export const config = readConfig();
