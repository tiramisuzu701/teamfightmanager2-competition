import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { loadSeasons, currentSeason, populateSeasonSelect } from "./seasons.js";

renderNav("team.html");

const teamId = new URLSearchParams(location.search).get("id");
let selectedSeasonId = null;

async function init() {
  if (!teamId) {
    document.getElementById("team-name").textContent = "Team not found";
    document.getElementById("team-subtitle").textContent = "No team id was given in the URL.";
    return;
  }

  const { data: team, error } = await supabase.from("teams").select("*").eq("id", teamId).maybeSingle();
  if (error || !team) {
    document.getElementById("team-name").textContent = "Team not found";
    document.getElementById("team-subtitle").textContent = "This team may have been deleted.";
    return;
  }

  document.title = `${team.name} - Teamfight Manager 2 League`;
  document.getElementById("team-name").textContent = team.name;
  document.getElementById("team-subtitle").textContent = team.short_name || "";
  document.getElementById("team-logo-slot").innerHTML = team.logo_url
    ? `<img src="${esc(team.logo_url)}" alt="" class="profile-logo" />`
    : `<span class="profile-logo-placeholder">${esc(initials(team.short_name || team.name))}</span>`;

  const seasonSelect = document.getElementById("season-select");
  try {
    const seasons = await loadSeasons();
    const current = currentSeason(seasons);
    selectedSeasonId = current?.id || null;
    populateSeasonSelect(seasonSelect, seasons, selectedSeasonId);
  } catch (err) {
    console.error("Could not load seasons", err);
  }
  seasonSelect.addEventListener("change", () => {
    selectedSeasonId = seasonSelect.value;
    loadRecordAndGames();
  });

  await Promise.all([loadRoster(), loadRecordAndGames(), loadHeadToHead()]);
}

async function loadRoster() {
  const container = document.getElementById("team-roster");
  const { data, error } = await supabase.from("players").select("id, name, role, photo_url").eq("team_id", teamId).order("name");
  if (error) {
    container.innerHTML = `<p class="empty-state">Could not load roster.</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">No players on this team yet.</p>`;
    return;
  }
  container.innerHTML = data
    .map(
      (p) => `
      <div class="upcoming-game-row">
        <span>${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="" class="thumb-logo" />` : ""}<a href="player.html?id=${p.id}">${esc(p.name)}</a> ${p.role ? `<span class="text-muted">(${esc(p.role)})</span>` : ""}</span>
      </div>`
    )
    .join("");
}

async function loadRecordAndGames() {
  const recordEl = document.getElementById("team-record");
  const gamesEl = document.getElementById("team-recent-games");
  if (!selectedSeasonId) {
    recordEl.innerHTML = `<p class="empty-state">No season found.</p>`;
    return;
  }

  const { data: standing } = await supabase
    .from("team_standings")
    .select("*")
    .eq("team_id", teamId)
    .eq("season_id", selectedSeasonId)
    .maybeSingle();

  recordEl.innerHTML = standing
    ? `
      <div class="field-row" style="text-align:center;flex-wrap:wrap">
        <div><div class="page-title" style="margin:0">${standing.wins ?? 0}</div><div class="text-muted" style="font-size:0.78rem">Wins</div></div>
        <div><div class="page-title" style="margin:0">${standing.losses ?? 0}</div><div class="text-muted" style="font-size:0.78rem">Losses</div></div>
        <div><div class="page-title" style="margin:0">${standing.matches_played ?? 0}</div><div class="text-muted" style="font-size:0.78rem">Matches</div></div>
        <div><div class="page-title" style="margin:0">${formatDiff(standing.game_diff)}</div><div class="text-muted" style="font-size:0.78rem">Game Diff</div></div>
        <div><div class="page-title" style="margin:0">${standing.win_pct != null ? standing.win_pct + "%" : "-"}</div><div class="text-muted" style="font-size:0.78rem">Win %</div></div>
      </div>`
    : `<p class="empty-state">No record for this season.</p>`;

  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select("*")
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .eq("season_id", selectedSeasonId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(10);

  if (mErr) {
    gamesEl.innerHTML = `<p class="empty-state">Could not load matches.</p>`;
    return;
  }
  if (!matches || matches.length === 0) {
    gamesEl.innerHTML = `<p class="empty-state">No matches played this season yet.</p>`;
    return;
  }

  const oppById = await fetchOpponents(matches);
  gamesEl.innerHTML = matches
    .map((m) => {
      const opponentId = m.team_a_id === teamId ? m.team_b_id : m.team_a_id;
      const opponent = oppById[opponentId];
      const won = m.winner_id === teamId;
      const myScore = m.team_a_id === teamId ? m.team_a_wins : m.team_b_wins;
      const oppScore = m.team_a_id === teamId ? m.team_b_wins : m.team_a_wins;
      return `
      <div class="upcoming-game-row">
        <span>${won ? `<span class="win-badge">W</span>` : `<span class="loss-badge">L</span>`} vs ${opponent ? `<a href="team.html?id=${opponent.id}">${esc(opponent.name)}</a>` : "Unknown"} <a href="match.html?id=${m.id}" class="text-muted" style="font-size:0.78rem">(${myScore}-${oppScore})</a></span>
        <span class="upcoming-game-time">${formatDate(m.completed_at)}</span>
      </div>`;
    })
    .join("");
}

async function loadHeadToHead() {
  const body = document.getElementById("head-to-head-body");
  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .eq("status", "completed");
  if (error) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">Could not load matches.</td></tr>`;
    return;
  }
  if (!matches || matches.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No matches played yet.</td></tr>`;
    return;
  }

  const oppById = await fetchOpponents(matches);
  const table = {};
  matches.forEach((m) => {
    if (!m.winner_id) return;
    const opponentId = m.team_a_id === teamId ? m.team_b_id : m.team_a_id;
    if (!opponentId) return;
    table[opponentId] = table[opponentId] || { wins: 0, losses: 0 };
    if (m.winner_id === teamId) table[opponentId].wins++;
    else table[opponentId].losses++;
  });

  const rows = Object.entries(table)
    .map(([oppId, rec]) => ({ oppId, ...rec, total: rec.wins + rec.losses }))
    .sort((a, b) => b.total - a.total);

  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No completed games yet.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td class="team-name">${oppById[r.oppId] ? `<a href="team.html?id=${r.oppId}">${esc(oppById[r.oppId].name)}</a>` : "Unknown"}</td>
        <td class="text-right num win-badge">${r.wins}</td>
        <td class="text-right num loss-badge">${r.losses}</td>
        <td class="text-right num">${r.total}</td>
      </tr>`
    )
    .join("");
}

async function fetchOpponents(games) {
  const ids = [...new Set(games.flatMap((g) => [g.team_a_id, g.team_b_id]).filter((id) => id && id !== teamId))];
  if (ids.length === 0) return {};
  const { data } = await supabase.from("teams").select("id, name").in("id", ids);
  return Object.fromEntries((data || []).map((t) => [t.id, t]));
}

function formatDiff(n) {
  const v = n ?? 0;
  if (v > 0) return `+${v}`;
  return `${v}`;
}

function initials(str) {
  return (str || "?").slice(0, 2).toUpperCase();
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
