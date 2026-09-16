process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY ||= "test-publishable-key";
process.env.SUPABASE_SECRET_KEY ||= "test-secret-key";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class TestWebSocket {};
}
