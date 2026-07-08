import { supabase } from "./supabaseClient.js";

// Shared league_settings helpers used by Manage (admin) and Rules (public).
// See sql/schema.sql: the public role can only ever select rules_content -
// discord_webhook_url is restricted to authenticated admins by RLS/grants.

export async function loadSettingsAdmin() {
  const { data, error } = await supabase.from("league_settings").select("*").eq("id", true).single();
  if (error) throw error;
  return data;
}

export async function saveSettingsAdmin(patch) {
  const { error } = await supabase
    .from("league_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw error;
}

export async function loadRulesPublic() {
  const { data, error } = await supabase.from("league_settings").select("rules_content").eq("id", true).single();
  if (error) throw error;
  return data?.rules_content || "";
}
