import { createClient } from "@supabase/supabase-js";
import { config } from "./env.js";

// Server-only client. The service-role key bypasses Row Level Security, so do
// not use this client for ordinary user-scoped requests or token validation.
export const supabaseAdmin = createClient(
  config.supabaseUrl,
  config.supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
