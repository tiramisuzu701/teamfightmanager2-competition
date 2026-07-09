import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { requireAdmin } from "./auth.js";
import { renderRosters, collectRosterRows, renderBans, collectBans } from "./gameForm.js";

renderNav("edit-game.html");
const session = await requireAdmin();
// If there's no session, requireAdmin() has already redirected to
// login.html - the guard below just stops this page's logic from doing
// any unnecessary work while that navigation completes.

const gameId = new URLSearchParams(location.search).get("id");

let game = null;
let match = null;
let aTeam = null;
let bTeam = null;
let players = [];
let champions = [];
let winnerSide = null; // 'a' | 'b'

async function init() {
  if (!gameId) {
    showNotFound("No game id was given in the URL.");
    return;
  }

  const { data: gameData, error: gameError } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
  if (gameError || !gameData) {
    showNotFound("This game could not be found. It may have been deleted.");
    return;
  }
  game = gameData;

  const { data: matchData } = game.match_id
    ? await supabase.from("matches").select("*").eq("id", game.match_id).maybeSingle()
    : { data: null };
  match = matchData || null;

  const [{ data: teamAData }, { data: teamBData }, { data: playerData }, { data: championData }, { data: statsData }, { data: bansData }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("id", game.team_a_id).maybeSingle(),
    supabase.from("teams").select("id, name").eq("id", game.team_b_id).maybeSingle(),
    supabase.from("players").select("id, name, role, team_id").in("team_id", [game.team_a_id, game.team_b_id]).order("name"),
    supabase.from("champions").select("id, name, icon_url").order("name"),
    supabase.from("game_player_stats").select("*").eq("game_id", gameId),
    supabase.from("game_bans").select("*").eq("game_id", gameId),
  ]);

  aTeam = teamAData;
  bTeam = teamBData;
  players = playerData || [];
  champions = championData || [];

  document.getElementById("edit-card").style.display = "block";
  document.getElementById("edit-subtitle").textContent = `${aTeam?.name || "Team A"} vs ${bTeam?.name || "Team B"} - Game ${game.game_number ?? ""}. Admin only.`;
  const backLink = document.getElementById("back-to-match-link");
  if (game.match_id) backLink.href = `match.html?id=${game.match_id}`;
  else backLink.style.display = "none";

  document.getElementById("duration").value = game.duration_minutes ?? "";
  document.getElementById("notes").value = game.notes ?? "";

  winnerSide = game.winner_id === game.team_a_id ? "a" : game.winner_id === game.team_b_id ? "b" : null;
  const picker = document.getElementById("winner-picker");
  picker.innerHTML = `
    <button type="button" class="btn ${winnerSide === "a" ? "btn-primary" : ""}" data-side="a">${esc(aTeam?.name || "Team A")} won</button>
    <button type="button" class="btn ${winnerSide === "b" ? "btn-primary" : ""}" data-side="b">${esc(bTeam?.name || "Team B")} won</button>`;
  picker.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      winnerSide = btn.dataset.side;
      picker.querySelectorAll("button").forEach((b) => b.classList.toggle("btn-primary", b.dataset.side === winnerSide));
    });
  });

  const existingByPlayerId = Object.fromEntries((statsData || []).map((row) => [row.player_id, row]));
  renderRosters(document.getElementById("rosters-container"), [aTeam, bTeam], players, champions, existingByPlayerId);
  renderBans(
    document.getElementById("team-a-bans"),
    aTeam?.name || "Team A",
    champions,
    (bansData || []).filter((b) => b.team_id === game.team_a_id)
  );
  renderBans(
    document.getElementById("team-b-bans"),
    bTeam?.name || "Team B",
    champions,
    (bansData || []).filter((b) => b.team_id === game.team_b_id)
  );

  document.getElementById("save-btn").addEventListener("click", save);
}

function showNotFound(text) {
  document.getElementById("not-found-card").style.display = "block";
  document.getElementById("not-found-msg").textContent = text;
}

async function save() {
  const msg = document.getElementById("save-msg");
  if (!winnerSide) {
    msg.textContent = "Pick a winner for this game.";
    msg.className = "form-msg error";
    return;
  }

  const winnerId = winnerSide === "a" ? game.team_a_id : game.team_b_id;
  const duration = document.getElementById("duration").value || null;
  const notes = document.getElementById("notes").value || null;

  const rosterRows = collectRosterRows(document.getElementById("rosters-container"), winnerId);
  const banRows = [
    ...collectBans(document.getElementById("team-a-bans"), game.team_a_id),
    ...collectBans(document.getElementById("team-b-bans"), game.team_b_id),
  ];

  msg.textContent = "Saving...";
  msg.className = "form-msg";
  document.getElementById("save-btn").disabled = true;

  try {
    const { error: gameError } = await supabase
      .from("games")
      .update({ winner_id: winnerId, duration_minutes: duration, notes })
      .eq("id", game.id);
    if (gameError) throw gameError;
    game.winner_id = winnerId;

    const { error: delStatsError } = await supabase.from("game_player_stats").delete().eq("game_id", game.id);
    if (delStatsError) throw delStatsError;
    if (rosterRows.length > 0) {
      const { error: insStatsError } = await supabase
        .from("game_player_stats")
        .insert(rosterRows.map((row) => ({ ...row, game_id: game.id })));
      if (insStatsError) throw insStatsError;
    }

    const { error: delBansError } = await supabase.from("game_bans").delete().eq("game_id", game.id);
    if (delBansError) throw delBansError;
    if (banRows.length > 0) {
      const { error: insBansError } = await supabase.from("game_bans").insert(banRows.map((row) => ({ ...row, game_id: game.id })));
      if (insBansError) throw insBansError;
    }

    if (match) {
      await recomputeMatch();
    }

    msg.textContent = "Game updated.";
    msg.className = "form-msg success";
    document.getElementById("save-btn").disabled = false;
  } catch (err) {
    msg.textContent = "Error saving corrections: " + err.message;
    msg.className = "form-msg error";
    document.getElementById("save-btn").disabled = false;
  }
}

// Recomputes the parent match's win counts (and, unless the match was ended
// early by explicit admin action, its status/winner/completed_at) from the
// full set of games now on record - mirroring the majority-based
// auto-complete logic used while live-logging a match. A match that was
// ended_early was a deliberate override not tied to majority, so editing a
// game under it only corrects the raw win counts and leaves status/winner/
// completed_at exactly as the admin left them.
async function recomputeMatch() {
  const { data: games, error } = await supabase
    .from("games")
    .select("winner_id")
    .eq("match_id", match.id);
  if (error) throw error;

  const aWins = (games || []).filter((g) => g.winner_id === match.team_a_id).length;
  const bWins = (games || []).filter((g) => g.winner_id === match.team_b_id).length;

  const update = { team_a_wins: aWins, team_b_wins: bWins };

  if (!match.ended_early) {
    const majority = Math.ceil(match.best_of / 2);
    const decided = aWins >= majority || bWins >= majority;
    if (decided) {
      update.status = "completed";
      update.winner_id = aWins >= majority ? match.team_a_id : match.team_b_id;
      update.completed_at = match.completed_at || new Date().toISOString();
    } else {
      update.status = "in_progress";
      update.winner_id = null;
      update.completed_at = null;
    }
  }

  const { error: updateError } = await supabase.from("matches").update(update).eq("id", match.id);
  if (updateError) throw updateError;
  Object.assign(match, update);
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

if (session) init();
