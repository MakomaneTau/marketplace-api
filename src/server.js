import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  let supabaseHost = "invalid";
  try {
    supabaseHost = new URL(process.env.SUPABASE_URL).hostname;
  } catch {
    // Startup validation in the Supabase client modules will handle invalid URLs.
  }

  console.log(`API running on port ${PORT}`, { supabaseHost });
});
