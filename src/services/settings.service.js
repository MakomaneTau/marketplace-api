import { ApiError } from "../errors/api-error.js";
import { supabaseAdmin } from "../config/supabase.js";
export class SettingsServiceError extends ApiError {
  constructor() {
    super(503, "SETTINGS_UNAVAILABLE", "Settings are temporarily unavailable.");
  }
}
const DEFAULT_PREFERENCES = {
  notify_new_orders: true,
  notify_new_messages: true,
  notify_listing_updates: true,
  notify_marketplace_tips: false,
};
const PREFERENCE_COLUMNS = Object.keys(DEFAULT_PREFERENCES).join(",");

export async function getSettings(userId) {
  const { data, error } = await supabaseAdmin
    .from("user_preferences")
    .select(PREFERENCE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new SettingsServiceError();
  return data || { ...DEFAULT_PREFERENCES };
}
export async function updateSettings(userId, input) {
  const { data, error } = await supabaseAdmin
    .from("user_preferences")
    .upsert({ user_id: userId, ...input }, { onConflict: "user_id" })
    .select(PREFERENCE_COLUMNS)
    .single();
  if (error) throw new SettingsServiceError();
  return data;
}
