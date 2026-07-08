import { supabase } from "./supabaseClient.js";

// Shared season helpers used by Standings, Players, and Manage.

export async function loadSeasons() {
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, is_current, started_at, ended_at")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export function currentSeason(seasons) {
  return seasons.find((s) => s.is_current) || seasons[0] || null;
}

export function populateSeasonSelect(selectEl, seasons, selectedId) {
  selectEl.innerHTML = seasons
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}${s.is_current ? " (current)" : ""}</option>`)
    .join("");
  if (selectedId) selectEl.value = selectedId;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Starts a new season: marks the current one ended + not-current, creates
// and activates a new one. Returns the new season row. Two writes, not
// wrapped in a DB transaction (Supabase client doesn't expose one over
// PostgREST) - if the second insert fails, the app is left with no current
// season, so the caller should surface errors clearly and let the admin retry.
export async function startNewSeason(name) {
  const seasons = await loadSeasons();
  const current = currentSeason(seasons);

  if (current) {
    const { error: endError } = await supabase
      .from("seasons")
      .update({ is_current: false, ended_at: new Date().toISOString() })
      .eq("id", current.id);
    if (endError) throw endError;
  }

  const { data, error } = await supabase
    .from("seasons")
    .insert({ name, is_current: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}
