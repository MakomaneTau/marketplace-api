import { createClient } from "@supabase/supabase-js";
import { config } from "./env.js";
import { boundedFetch } from "../http/bounded-fetch.js";

// This client operates with the public project key. It validates caller access
// tokens without granting the service-role privileges held by supabaseAdmin.
export const supabaseAuth = createClient(
  config.supabaseUrl,
  config.supabasePublishableKey,
  {
    global: { fetch: boundedFetch },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
