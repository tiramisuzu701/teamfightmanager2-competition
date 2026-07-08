import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { loadSeasons, currentSeason } from "./seasons.js";
import { LEAGUE_NAME } from "./config.js";

renderNav("index.html");

async function init() {
  document.getElementById("welcome-title").textContent = `Welcome to the ${LEAGUE_NAME}`;

  let season = null;
  try {
    const seasons = await loadSeasons();
    season = currentSeason(seasons);
  } catch (err) {
    console.error("Could not load seasons", err);
  }

  document.getElementById("welcome-subtitle").textContent = season
    ? `Here's what's happening in ${season.name} - team records, upcoming games, and the latest league news.`
    : "Here's what's happening around the league.";

  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase.from("teams").select("id, name"),
    supabase.from("players").select("id, name"),
  ]);
  const teamsById = Object.fromEntries((teams || []).map((t) => [t.id, t]));
  const playersById = Object.fromEntries((players || []).map((p) => [p.id, p]));

  await Promise.all([
    loadUpcomingGames(teamsById),
    loadRecentNews(teamsById, playersById),
    season ? loadStandingsSnapshot(season.id) : Promise.resolve(),
    season ? loadPlayersSnapshot(season.id) : Promise.resolve(),
  ]);

  if (!season) {
    document.getElementById("standings-snapshot").innerHTML = `<tr><td colspan="5" class="empty-state">No season found yet.</td></tr>`;
    document.getElementById("players-snapshot").innerHTML = `<tr><td colspan="4" class="empty-state">No season found yet.</td></tr>`;
  }
}

async function loadUpcomingGames(teamsById) {
  const container = document.getElementById("upcoming-games");
  const { data, error } = await supabase
    .from("scheduled_games")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error) {
    container.innerHTML = `<p class="empty-state">Could not load upcoming games (${esc(error.message)}).</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">Nothing on the calendar yet. Log in as admin to schedule a game on the <a href="calendar.html">Calendar</a> tab.</p>`;
    return;
  }
  container.innerHTML = data
    .map((g) => {
      const a = teamsById[g.team_a_id]?.name || "TBD";
      const b = teamsById[g.team_b_id]?.name || "TBD";
      return `
        <div class="upcoming-game-row">
          <span>${esc(a)} <span class="text-muted">vs</span> ${esc(b)}</span>
          <span class="upcoming-game-time">${formatDateTime(g.scheduled_at)}</span>
        </div>`;
    })
    .join("");
}

async function loadRecentNews(teamsById, playersById) {
  const container = document.getElementById("recent-news");
  const { data, error } = await supabase
    .from("news_items")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    container.innerHTML = `<p class="empty-state">Could not load news (${esc(error.message)}).</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">No news posted yet. Check the <a href="news.html">News</a> tab once trades or announcements go up.</p>`;
    return;
  }
  container.innerHTML = data.map((n) => renderNewsItem(n, teamsById, playersById)).join("");
}

function renderNewsItem(n, teamsById, playersById) {
  const badge = `<span class="news-type-badge ${n.type}">${n.type === "trade" ? "Trade" : "Announcement"}</span>`;
  let body = n.body ? `<div class="text-muted" style="font-size:0.85rem;margin-top:2px">${esc(n.body)}</div>` : "";
  if (n.type === "trade") {
    const player = playersById[n.player_id]?.name || "A player";
    const from = teamsById[n.from_team_id]?.name;
    const to = teamsById[n.to_team_id]?.name || "a new team";
    body = `<div class="text-muted" style="font-size:0.85rem;margin-top:2px">${esc(player)} moved${from ? ` from ${esc(from)}` : ""} to ${esc(to)}.</div>`;
  }
  return `
    <div class="news-item">
      <div class="news-item-title">${badge}${esc(n.title)}</div>
      ${body}
      <div class="news-item-meta">${formatDateTime(n.created_at)}</div>
    </div>`;
}

async function loadStandingsSnapshot(seasonId) {
  const body = document.getElementById("standings-snapshot");
  const { data, error } = await supabase
    .from("team_standings")
    .select("*")
    .eq("season_id", seasonId)
    .order("win_pct", { ascending: false })
    .limit(5);

  if (error) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">Could not load standings.</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">No teams yet.</td></tr>`;
    return;
  }
  body.innerHTML = data
    .map(
      (t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="team-name">${esc(t.name)}</td>
        <td class="text-right num win-badge">${t.wins}</td>
        <td class="text-right num loss-badge">${t.losses}</td>
        <td class="text-right num">${t.win_pct != null ? t.win_pct + "%" : "-"}</td>
      </tr>`
    )
    .join("");
}

async function loadPlayersSnapshot(seasonId) {
  const body = document.getElementById("players-snapshot");
  const { data, error } = await supabase
    .from("player_stats_aggregate")
    .select("*")
    .eq("season_id", seasonId)
    .gt("games_played", 0)
    .order("kda", { ascending: false })
    .limit(5);

  if (error) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">Could not load player stats.</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No games logged yet.</td></tr>`;
    return;
  }
  body.innerHTML = data
    .map(
      (p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="team-name">${esc(p.name)}</td>
        <td class="text-muted">${esc(p.team_name || "-")}</td>
        <td class="text-right num">${p.kda ?? "-"}</td>
      </tr>`
    )
    .join("");
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
