import { supabaseAuth } from "../config/supabase-auth.js";

export async function getUserFromAccessToken(accessToken) {
  const { data, error } = await supabaseAuth.auth.getUser(accessToken);

  return {
    user: data?.user ?? null,
    error,
  };
}
