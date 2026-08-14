import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not defined.");
}

if (!supabaseSecretKey) {
  throw new Error("SUPABASE_SECRET_KEY is not defined.");
}

// Server-only client. The service-role key bypasses Row Level Security, so do
// not use this client for ordinary user-scoped requests or token validation.
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
