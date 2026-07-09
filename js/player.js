import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { loadSeasons, currentSeason, populateSeasonSelect } from "./seasons.js";

renderNav("player.html");

const playerId = new URLSearchParams(location.search).get("id");
let selectedSeasonId = null;
let champsById = {};
let playerGames = []; // all-time game_player_stats rows merged with their game (incl. season_id), populated once by loadGameLogAndTrend

async function init() {
  if (!playerId) {
    document.getElementById("player-name").textContent = "Player not found";
    document.getElementById("player-subtitle").textContent = "No player id was given in the URL.";
    return;
  }

  const { data: player, error } = await supabase.from("players").select("*").eq("id", playerId).maybeSingle();

  if (error || !player) {
    document.getElementById("player-name").textContent = "Player not found";
    document.getElementById("player-subtitle").textContent = "This player may have been deleted.";
    return;
  }

  let team = null;
  if (player.team_id) {
    const { data: teamData } = await supabase.from("teams").select("id, name").eq("id", player.team_id).maybeSingle();
    team = teamData || null;
  }

  document.title = `${player.name} - Teamfight Manager 2 League`;
  document.getElementById("player-name").textContent = player.name;
  document.getElementById("player-subtitle").innerHTML = [
    player.role ? esc(player.role) : null,
    team ? `<a href="team.html?id=${team.id}">${esc(team.name)}</a>` : `<span class="text-muted">Unassigned</span>`,
  ]
    .filter(Boolean)
    .join(" &middot; ");
  document.getElementById("player-photo-slot").innerHTML = player.photo_url
    ? `<img src="${esc(player.photo_url)}" alt="" class="profile-logo" />`
    : `<span class="profile-logo-placeholder">${esc(initials(player.name))}</span>`;

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
    loadSeasonStats();
    renderChampionPool();
  });

  const { data: championData } = await supabase.from("champions").select("id, name, icon_url");
  champsById = Object.fromEntries((championData || []).map((c) => [c.id, c]));

  await Promise.all([loadSeasonStats(), loadGameLogAndTrend()]);
  renderChampionPool();
}

async function loadSeasonStats() {
  const container = document.getElementById("player-stats");
  if (!selectedSeasonId) {
    container.innerHTML = `<p class="empty-state">No season found.</p>`;
    return;
  }
  const { data: stats } = await supabase
    .from("player_stats_aggregate")
    .select("*")
    .eq("player_id", playerId)
    .eq("season_id", selectedSeasonId)
    .maybeSingle();

  if (!stats || stats.games_played === 0) {
    container.innerHTML = `<p class="empty-state">No games logged this season yet.</p>`;
    return;
  }

  const tiles = [
    ["GP", stats.games_played],
    ["W", stats.wins],
    ["L", stats.losses],
    ["KDA", stats.kda ?? "-"],
    ["Kills", stats.total_kills],
    ["Deaths", stats.total_deaths],
    ["Assists", stats.total_assists],
    ["CS", stats.total_cs],
    ["Damage", stats.total_damage],
  ];
  container.innerHTML = `<div class="field-row" style="text-align:center;flex-wrap:wrap">${tiles
    .map(([label, val]) => `<div><div class="page-title" style="margin:0;font-size:1.3rem">${val}</div><div class="text-muted" style="font-size:0.72rem">${label}</div></div>`)
    .join("")}</div>`;
}

async function loadGameLogAndTrend() {
  const body = document.getElementById("player-gamelog-body");
  const sparkline = document.getElementById("player-sparkline");

  const { data: gps, error } = await supabase
    .from("game_player_stats")
    .select("*")
    .eq("player_id", playerId);

  if (error) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">Could not load game log.</td></tr>`;
    sparkline.innerHTML = `<p class="empty-state">Could not load trend.</p>`;
    return;
  }
  if (!gps || gps.length === 0) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">No games logged for this player yet.</td></tr>`;
    sparkline.innerHTML = `<p class="empty-state">Not enough games yet for a trend chart.</p>`;
    return;
  }

  const gameIds = [...new Set(gps.map((g) => g.game_id))];
  const { data: games } = await supabase.from("games").select("*").in("id", gameIds);
  const gamesById = Object.fromEntries((games || []).map((g) => [g.id, g]));

  const opponentIds = [...new Set(gps.map((g) => {
    const game = gamesById[g.game_id];
    if (!game) return null;
    return game.team_a_id === g.team_id ? game.team_b_id : game.team_a_id;
  }).filter(Boolean))];
  const { data: opponents } = await supabase.from("teams").select("id, name").in("id", opponentIds.length ? opponentIds : ["00000000-0000-0000-0000-000000000000"]);
  const oppById = Object.fromEntries((opponents || []).map((t) => [t.id, t]));

  const merged = gps
    .map((g) => ({ ...g, game: gamesById[g.game_id] }))
    .filter((g) => g.game)
    .sort((a, b) => new Date(b.game.played_at) - new Date(a.game.played_at));
  playerGames = merged;

  body.innerHTML = merged
    .slice(0, 20)
    .map((g) => {
      const opponentId = g.game.team_a_id === g.team_id ? g.game.team_b_id : g.game.team_a_id;
      const opponent = oppById[opponentId];
      return `
      <tr>
        <td class="text-muted">${formatDate(g.game.played_at)}</td>
        <td class="team-name">${opponent ? `<a href="team.html?id=${opponent.id}">${esc(opponent.name)}</a>` : "Unknown"}</td>
        <td>${g.win ? `<span class="win-badge">W</span>` : `<span class="loss-badge">L</span>`}</td>
        <td class="text-right num">${g.kills}</td>
        <td class="text-right num">${g.deaths}</td>
        <td class="text-right num">${g.assists}</td>
        <td class="text-right num">${g.cs}</td>
        <td class="text-right num">${g.damage}</td>
      </tr>`;
    })
    .join("");

  // Sparkline reads oldest -> newest left to right, so reverse chronological order.
  const chronological = [...merged].reverse();
  const kdaValues = chronological.map((g) => (g.kills + g.assists) / Math.max(1, g.deaths));
  sparkline.innerHTML = renderSparkline(kdaValues);
}

function renderChampionPool() {
  const body = document.getElementById("player-champions-body");
  if (!selectedSeasonId) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No season found.</td></tr>`;
    return;
  }

  const seasonGames = playerGames.filter((g) => g.game.season_id === selectedSeasonId && g.champion_id);
  if (seasonGames.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No champion picks logged this season yet.</td></tr>`;
    return;
  }

  const byChampion = {};
  seasonGames.forEach((g) => {
    const bucket = (byChampion[g.champion_id] = byChampion[g.champion_id] || { games: 0, wins: 0 });
    bucket.games += 1;
    if (g.win) bucket.wins += 1;
  });

  const rows = Object.entries(byChampion)
    .map(([championId, s]) => ({ championId, ...s, winPct: Math.round((s.wins / s.games) * 100) }))
    .sort((a, b) => b.games - a.games);

  body.innerHTML = rows
    .map((r) => {
      const champ = champsById[r.championId];
      const icon = champ?.icon_url ? `<img src="${esc(champ.icon_url)}" alt="" class="thumb-logo" />` : "";
      const name = champ ? esc(champ.name) : "Unknown";
      return `
      <tr>
        <td class="team-name">${icon}${name}</td>
        <td class="text-right num">${r.games}</td>
        <td class="text-right num win-badge">${r.wins}</td>
        <td class="text-right num">${r.winPct}%</td>
      </tr>`;
    })
    .join("");
}

function renderSparkline(values) {
  if (values.length < 2) {
    return `<p class="empty-state">Not enough games yet for a trend chart.</p>`;
  }
  const w = 560;
  const h = 100;
  const pad = 10;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `
    <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="sparkline">
      <polyline points="${points}" fill="none" stroke="var(--accent-2)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
    </svg>`;
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
