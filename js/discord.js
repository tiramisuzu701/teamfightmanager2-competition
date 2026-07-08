import { supabase } from "./supabaseClient.js";

// Best-effort Discord webhook notifications. Only ever called from
// admin-gated pages (Log Game, News) right after a successful save, so the
// webhook URL - which is really a write credential, since anyone holding it
// can post into the league's Discord channel - is only ever read into an
// already-authenticated admin session. RLS (see sql/schema.sql) additionally
// enforces that the anon/public role can never read this column at all.

let cachedWebhook; // undefined = not loaded yet, null = loaded but not set

async function getWebhookUrl() {
  if (cachedWebhook !== undefined) return cachedWebhook;
  try {
    const { data, error } = await supabase.from("league_settings").select("discord_webhook_url").eq("id", true).single();
    cachedWebhook = error ? null : data?.discord_webhook_url || null;
  } catch {
    cachedWebhook = null;
  }
  return cachedWebhook;
}

// Call this after saving a new webhook URL on the Manage page so the next
// post in this same page session picks up the fresh value.
export function invalidateWebhookCache() {
  cachedWebhook = undefined;
}

// Posts a message to the configured Discord webhook, if any. Never throws -
// a Discord outage or missing webhook should never block the admin action
// (logging a game, posting news) that triggered it.
export async function postToDiscord(content) {
  const url = await getWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.warn("Discord webhook post failed (this does not affect the save that just happened):", err.message);
  }
}
