import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not defined.");
}

if (!supabasePublishableKey) {
  throw new Error("SUPABASE_PUBLISHABLE_KEY is not defined.");
}

function safeAuthErrorPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  return {
    code: payload.code,
    errorCode: payload.error_code,
    message: payload.message ?? payload.msg ?? payload.error_description,
  };
}

async function logFailedSignupResponse(response) {
  if (process.env.NODE_ENV === "test") return;

  const logPayload = {
    level: "error",
    event: "signup_provider_raw_error",
    service: "auth",
    status: response.status,
    bodyType: "empty",
  };

  try {
    const text = await response.clone().text();

    if (text) {
      try {
        Object.assign(logPayload, {
          bodyType: "json",
          ...safeAuthErrorPayload(JSON.parse(text)),
        });
      } catch {
        logPayload.bodyType = "non_json";
      }
    }
  } catch {
    logPayload.bodyType = "unreadable";
  }

  console.error(JSON.stringify(logPayload));
}

async function authFetch(input, init) {
  const response = await fetch(input, init);
  const url = typeof input === "string" ? input : input?.url;

  if (!response.ok && url?.includes("/auth/v1/signup")) {
    await logFailedSignupResponse(response);
  }

  return response;
}

// This client operates with the public project key. It validates caller access
// tokens without granting the service-role privileges held by supabaseAdmin.
export const supabaseAuth = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    global: {
      fetch: authFetch,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
