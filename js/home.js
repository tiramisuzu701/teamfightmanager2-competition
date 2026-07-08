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
    loadPlayerOfWeek(),
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
      const a = teamsById[g.team_a_id];
      const b = teamsById[g.team_b_id];
      const aLabel = a ? `<a href="team.html?id=${a.id}">${esc(a.name)}</a>` : "TBD";
      const bLabel = b ? `<a href="team.html?id=${b.id}">${esc(b.name)}</a>` : "TBD";
      return `
        <div class="upcoming-game-row">
          <span>${aLabel} <span class="text-muted">vs</span> ${bLabel}</span>
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
    const player = playersById[n.player_id];
    const from = teamsById[n.from_team_id];
    const to = teamsById[n.to_team_id];
    const playerLabel = player ? `<a href="player.html?id=${player.id}">${esc(player.name)}</a>` : "A player";
    const toLabel = to ? `<a href="team.html?id=${to.id}">${esc(to.name)}</a>` : "a new team";
    body = `<div class="text-muted" style="font-size:0.85rem;margin-top:2px">${playerLabel} moved${from ? ` from ${esc(from.name)}` : ""} to ${toLabel}.</div>`;
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
        <td class="team-name">${t.logo_url ? `<img src="${esc(t.logo_url)}" alt="" class="thumb-logo" />` : ""}<a href="team.html?id=${t.team_id}">${esc(t.name)}</a></td>
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
        <td class="team-name">${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="" class="thumb-logo" />` : ""}<a href="player.html?id=${p.player_id}">${esc(p.name)}</a></td>
        <td class="text-muted">${p.team_id ? `<a href="team.html?id=${p.team_id}">${esc(p.team_name || "-")}</a>` : esc(p.team_name || "-")}</td>
        <td class="text-right num">${p.kda ?? "-"}</td>
      </tr>`
    )
    .join("");
}

async function loadPlayerOfWeek() {
  const container = document.getElementById("potw-content");
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: games, error: gErr } = await supabase.from("games").select("id, played_at").gte("played_at", weekAgo);
  if (gErr) {
    container.innerHTML = `<p class="empty-state">Could not compute Player of the Week.</p>`;
    return;
  }
  if (!games || games.length === 0) {
    container.innerHTML = `<p class="empty-state">No games logged in the last 7 days.</p>`;
    return;
  }

  const { data: gps, error: gpsErr } = await supabase
    .from("game_player_stats")
    .select("*")
    .in("game_id", games.map((g) => g.id));
  if (gpsErr || !gps || gps.length === 0) {
    container.innerHTML = `<p class="empty-state">No games logged in the last 7 days.</p>`;
    return;
  }

  // Simple weighted score: rewards kills and assists, penalizes deaths, and
  // gives a bonus for wins - not meant to be a rigorous formula, just enough
  // to surface a standout performer for the week.
  const byPlayer = {};
  gps.forEach((row) => {
    const p = (byPlayer[row.player_id] = byPlayer[row.player_id] || { kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0, score: 0 });
    p.kills += row.kills;
    p.deaths += row.deaths;
    p.assists += row.assists;
    if (row.win) p.wins++;
    else p.losses++;
    p.score += row.kills * 2 + row.assists * 1.5 - row.deaths + (row.win ? 3 : 0);
  });

  const topEntry = Object.entries(byPlayer).sort((a, b) => b[1].score - a[1].score)[0];
  if (!topEntry) {
    container.innerHTML = `<p class="empty-state">No games logged in the last 7 days.</p>`;
    return;
  }
  const [topId, stats] = topEntry;

  const { data: player } = await supabase.from("players").select("id, name, team_id, photo_url").eq("id", topId).maybeSingle();
  let team = null;
  if (player?.team_id) {
    const { data: teamData } = await supabase.from("teams").select("id, name").eq("id", player.team_id).maybeSingle();
    team = teamData || null;
  }

  container.innerHTML = `
    <div class="profile-header">
      ${
        player?.photo_url
          ? `<img src="${esc(player.photo_url)}" class="profile-logo" alt="" />`
          : `<span class="profile-logo-placeholder">${esc((player?.name || "?").slice(0, 2).toUpperCase())}</span>`
      }
      <div>
        <div class="page-title" style="margin:0;font-size:1.2rem">${player ? `<a href="player.html?id=${player.id}">${esc(player.name)}</a>` : "Unknown player"}</div>
        <div class="text-muted" style="font-size:0.85rem">${team ? `<a href="team.html?id=${team.id}">${esc(team.name)}</a>` : ""}</div>
        <div class="text-muted" style="font-size:0.8rem;margin-top:4px">${stats.kills}/${stats.deaths}/${stats.assists} &middot; ${stats.wins}-${stats.losses} this week</div>
      </div>
    </div>`;
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
