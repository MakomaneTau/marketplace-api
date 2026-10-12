import "dotenv/config";

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
  return Object.freeze({
    nodeEnv: environment.NODE_ENV || "development",
    port: positiveInteger("PORT", 4000, 65535),
    allowedOrigins: (
      environment.CORS_ORIGINS ||
      environment.CORS_ORIGIN ||
      "http://localhost:3000"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: environment.TRUST_PROXY === "true",
    rateLimitWindowMs: positiveInteger("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: positiveInteger("RATE_LIMIT_MAX", 120),
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabasePublishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
    supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
    passwordResetRedirectUrl: environment.PASSWORD_RESET_REDIRECT_URL,
  });
}

export const config = readConfig();
