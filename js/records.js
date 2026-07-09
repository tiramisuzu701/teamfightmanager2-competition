import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { loadSeasons } from "./seasons.js";

renderNav("records.html");

const STAT_RECORDS = [
  { key: "kills", label: "Most Kills (Single Game)" },
  { key: "assists", label: "Most Assists (Single Game)" },
  { key: "damage", label: "Most Damage (Single Game)" },
  { key: "cs", label: "Most CS (Single Game)" },
  { key: "gold", label: "Most Gold (Single Game)" },
  { key: "towers", label: "Most Towers (Single Game)" },
  { key: "epic_monsters", label: "Most Epic Monsters (Single Game)" },
  { key: "kda", label: "Best KDA (Single Game)", derived: true },
];

let selectedSeasonId = "";

async function init() {
  const seasonSelect = document.getElementById("season-select");
  try {
    const seasons = await loadSeasons();
    seasonSelect.innerHTML =
      `<option value="">All-Time</option>` +
      seasons.map((s) => `<option value="${s.id}">${esc(s.name)}${s.is_current ? " (current)" : ""}</option>`).join("");
  } catch (err) {
    console.error("Could not load seasons", err);
  }
  seasonSelect.addEventListener("change", () => {
    selectedSeasonId = seasonSelect.value;
    loadRecords();
  });
  await loadRecords();
}

async function loadRecords() {
  const grid = document.getElementById("records-grid");
  grid.innerHTML = `<p class="empty-state">Loading records...</p>`;

  let gamesQuery = supabase.from("games").select("*").order("played_at", { ascending: true });
  if (selectedSeasonId) gamesQuery = gamesQuery.eq("season_id", selectedSeasonId);
  const { data: games, error: gamesError } = await gamesQuery;

  if (gamesError) {
    grid.innerHTML = `<p class="empty-state">Could not load games (${esc(gamesError.message)}).</p>`;
    return;
  }
  if (!games || games.length === 0) {
    grid.innerHTML = `<p class="empty-state">No games logged yet${selectedSeasonId ? " for this season" : ""}.</p>`;
    return;
  }

  const gameIds = games.map((g) => g.id);
  const gamesById = Object.fromEntries(games.map((g) => [g.id, g]));

  const { data: gps, error: gpsError } = await supabase.from("game_player_stats").select("*").in("game_id", gameIds);
  if (gpsError) {
    grid.innerHTML = `<p class="empty-state">Could not load player stats (${esc(gpsError.message)}).</p>`;
    return;
  }

  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase.from("players").select("id, name"),
    supabase.from("teams").select("id, name"),
  ]);
  const playersById = Object.fromEntries((players || []).map((p) => [p.id, p]));
  const teamsById = Object.fromEntries((teams || []).map((t) => [t.id, t]));

  const rows = (gps || []).map((row) => ({ ...row, kda: (row.kills + row.assists) / Math.max(1, row.deaths) }));

  let matchesQuery = supabase.from("matches").select("*").eq("status", "completed").order("completed_at", { ascending: true });
  if (selectedSeasonId) matchesQuery = matchesQuery.eq("season_id", selectedSeasonId);
  const { data: matches } = await matchesQuery;

  const statCards = STAT_RECORDS.map((stat) => renderStatRecord(stat, rows, gamesById, playersById, teamsById)).join("");
  const streakCard = renderWinStreak(matches || [], teamsById);

  grid.innerHTML = statCards + streakCard;
}

function renderStatRecord(stat, rows, gamesById, playersById, teamsById) {
  if (rows.length === 0) {
    return recordCard(stat.label, `<p class="empty-state">No games logged yet.</p>`);
  }
  const top = rows.reduce((best, row) => (row[stat.key] > (best?.[stat.key] ?? -Infinity) ? row : best), null);
  if (!top) return recordCard(stat.label, `<p class="empty-state">No data yet.</p>`);

  const player = playersById[top.player_id];
  const team = teamsById[top.team_id];
  const game = gamesById[top.game_id];
  const opponentId = game ? (game.team_a_id === top.team_id ? game.team_b_id : game.team_a_id) : null;
  const opponent = opponentId ? teamsById[opponentId] : null;
  const value = stat.derived ? top[stat.key].toFixed(2) : top[stat.key];

  const context = [
    team ? `<a href="team.html?id=${team.id}">${esc(team.name)}</a>` : null,
    opponent ? `vs <a href="team.html?id=${opponent.id}">${esc(opponent.name)}</a>` : null,
    game ? formatDate(game.played_at) : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  return recordCard(
    stat.label,
    `
    <div class="record-value">${value}</div>
    <div class="record-holder">${player ? `<a href="player.html?id=${player.id}">${esc(player.name)}</a>` : "Unknown player"}</div>
    <div class="text-muted" style="font-size:0.78rem">${context}</div>`
  );
}

function renderWinStreak(matches, teamsById) {
  const byTeam = {};
  matches.forEach((m) => {
    if (!m.winner_id) return;
    [m.team_a_id, m.team_b_id].forEach((teamId) => {
      if (!teamId) return;
      byTeam[teamId] = byTeam[teamId] || [];
      byTeam[teamId].push(m);
    });
  });

  let best = { teamId: null, streak: 0 };
  Object.entries(byTeam).forEach(([teamId, teamMatches]) => {
    const sorted = [...teamMatches].sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
    let current = 0;
    let longest = 0;
    sorted.forEach((m) => {
      if (m.winner_id === teamId) {
        current++;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    });
    if (longest > best.streak) best = { teamId, streak: longest };
  });

  if (!best.teamId || best.streak === 0) {
    return recordCard("Longest Win Streak", `<p class="empty-state">No completed matches yet.</p>`);
  }
  const team = teamsById[best.teamId];
  return recordCard(
    "Longest Win Streak",
    `
    <div class="record-value">${best.streak}</div>
    <div class="record-holder">${team ? `<a href="team.html?id=${team.id}">${esc(team.name)}</a>` : "Unknown team"}</div>
    <div class="text-muted" style="font-size:0.78rem">consecutive match wins</div>`
  );
}

function recordCard(title, bodyHtml) {
  return `<div class="card record-card"><h2 class="card-title">${esc(title)}</h2>${bodyHtml}</div>`;
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
