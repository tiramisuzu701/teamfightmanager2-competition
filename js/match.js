import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { getSession } from "./auth.js";

renderNav("match.html");

const matchId = new URLSearchParams(location.search).get("id");

const STAT_FIELDS = [
  { key: "kills", label: "K" },
  { key: "deaths", label: "D" },
  { key: "assists", label: "A" },
  { key: "cs", label: "CS" },
  { key: "gold", label: "Gold" },
  { key: "damage", label: "Damage" },
  { key: "towers", label: "Towers" },
  { key: "epic_monsters", label: "Epic Mon." },
];

async function init() {
  if (!matchId) {
    document.getElementById("match-title").textContent = "Match not found";
    document.getElementById("match-subtitle").textContent = "No match id was given in the URL.";
    return;
  }

  const { data: match, error } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (error || !match) {
    document.getElementById("match-title").textContent = "Match not found";
    document.getElementById("match-subtitle").textContent = "This match may have been deleted.";
    return;
  }

  const [{ data: aTeam }, { data: bTeam }] = await Promise.all([
    supabase.from("teams").select("id, name, short_name, logo_url").eq("id", match.team_a_id).maybeSingle(),
    supabase.from("teams").select("id, name, short_name, logo_url").eq("id", match.team_b_id).maybeSingle(),
  ]);

  document.title = `${aTeam?.name || "Team A"} vs ${bTeam?.name || "Team B"} - Teamfight Manager 2 League`;
  const session = await getSession();
  renderHeader(match, aTeam, bTeam);
  await loadGames(match, aTeam, bTeam, !!session);
}

function renderHeader(match, aTeam, bTeam) {
  document.getElementById("match-title").innerHTML = `
    ${teamChip(aTeam)}
    <span class="text-muted" style="margin:0 10px">vs</span>
    ${teamChip(bTeam)}`;

  const statusLabel = { scheduled: "Scheduled", in_progress: "In Progress", completed: "Final", cancelled: "Cancelled" }[match.status] || match.status;
  const statusClass = match.status === "completed" ? "win-badge" : match.status === "cancelled" ? "loss-badge" : "";
  const scoreLine = match.status === "scheduled" ? "Not yet played" : `${match.team_a_wins ?? 0} - ${match.team_b_wins ?? 0}`;
  const when = match.scheduled_at
    ? new Date(match.scheduled_at).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  document.getElementById("match-subtitle").innerHTML = [
    `Best of ${match.best_of}`,
    `<span class="${statusClass}">${esc(statusLabel)}</span>`,
    match.status !== "scheduled" ? `Score: <strong>${scoreLine}</strong>` : null,
    match.ended_early ? `<span class="text-muted">(ended early)</span>` : null,
    when ? esc(when) : null,
    match.notes ? esc(match.notes) : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");
}

function teamChip(team) {
  if (!team) return `<span class="text-muted">TBD</span>`;
  const logo = team.logo_url ? `<img src="${esc(team.logo_url)}" alt="" class="thumb-logo" />` : "";
  return `${logo}<a href="team.html?id=${team.id}">${esc(team.name)}</a>`;
}

async function loadGames(match, aTeam, bTeam, isAdmin) {
  const container = document.getElementById("games-breakdown");
  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .eq("match_id", matchId)
    .order("game_number", { ascending: true });

  if (error) {
    container.innerHTML = `<p class="empty-state">Could not load games (${esc(error.message)}).</p>`;
    return;
  }
  if (!games || games.length === 0) {
    container.innerHTML = `<p class="empty-state">No games logged for this match yet.</p>`;
    return;
  }

  const gameIds = games.map((g) => g.id);
  const [{ data: gps }, { data: playerData }, { data: championData }, { data: bans }] = await Promise.all([
    supabase.from("game_player_stats").select("*").in("game_id", gameIds),
    supabase.from("players").select("id, name, photo_url"),
    supabase.from("champions").select("id, name, icon_url"),
    supabase.from("game_bans").select("*").in("game_id", gameIds),
  ]);
  const playersById = Object.fromEntries((playerData || []).map((p) => [p.id, p]));
  const champsById = Object.fromEntries((championData || []).map((c) => [c.id, c]));

  const statsByGame = {};
  (gps || []).forEach((row) => {
    statsByGame[row.game_id] = statsByGame[row.game_id] || [];
    statsByGame[row.game_id].push(row);
  });

  const bansByGame = {};
  (bans || []).forEach((row) => {
    bansByGame[row.game_id] = bansByGame[row.game_id] || [];
    bansByGame[row.game_id].push(row);
  });

  container.innerHTML = games
    .map((g) => renderGameCard(g, statsByGame[g.id] || [], bansByGame[g.id] || [], aTeam, bTeam, playersById, champsById, isAdmin))
    .join("");
}

function champChip(champ) {
  if (!champ) return `<span class="text-muted">-</span>`;
  const icon = champ.icon_url ? `<img src="${esc(champ.icon_url)}" alt="" class="thumb-logo" style="width:20px;height:20px;margin-right:5px" />` : "";
  return `${icon}${esc(champ.name)}`;
}

function renderBansLine(bans, teamName, champsById) {
  if (!bans || bans.length === 0) return `<span class="text-muted">${esc(teamName)} bans: none recorded</span>`;
  const names = bans.map((b) => (champsById[b.champion_id] ? esc(champsById[b.champion_id].name) : "Unknown")).join(", ");
  return `<span class="text-muted">${esc(teamName)} bans:</span> ${names}`;
}

function renderGameCard(game, stats, bans, aTeam, bTeam, playersById, champsById, isAdmin) {
  const winner = game.winner_id === aTeam?.id ? aTeam : game.winner_id === bTeam?.id ? bTeam : null;

  const sorted = stats.slice().sort((r1, r2) => {
    const r1First = r1.team_id === game.team_a_id ? 0 : 1;
    const r2First = r2.team_id === game.team_a_id ? 0 : 1;
    return r1First - r2First;
  });

  const rowsHtml =
    sorted.length === 0
      ? `<tr><td colspan="${STAT_FIELDS.length + 3}" class="empty-state">No player stats logged for this game.</td></tr>`
      : sorted
          .map((row) => {
            const p = playersById[row.player_id];
            return `
          <tr>
            <td>${row.win ? `<span class="win-badge">W</span>` : `<span class="loss-badge">L</span>`}</td>
            <td>${p ? `<a href="player.html?id=${p.id}">${esc(p.name)}</a>` : "Unknown"}</td>
            <td>${champChip(champsById[row.champion_id])}</td>
            ${STAT_FIELDS.map((f) => `<td class="text-right num">${row[f.key]}</td>`).join("")}
          </tr>`;
          })
          .join("");

  const aBans = bans.filter((b) => b.team_id === game.team_a_id);
  const bBans = bans.filter((b) => b.team_id === game.team_b_id);

  return `
    <div class="card" style="margin-bottom:14px">
      <div class="stat-toggle-row">
        <h3 class="card-title" style="margin:0">Game ${game.game_number}</h3>
        <span class="text-muted" style="font-size:0.85rem">
          ${winner ? `<strong>${esc(winner.name)}</strong> won` : "No winner recorded"}
          ${game.duration_minutes ? ` &middot; ${game.duration_minutes} min` : ""}
          ${isAdmin ? ` &middot; <a href="edit-game.html?id=${game.id}">Edit</a>` : ""}
        </span>
      </div>
      ${game.notes ? `<p class="text-muted" style="font-size:0.82rem;margin:6px 0">${esc(game.notes)}</p>` : ""}
      <div class="field-row" style="font-size:0.82rem;margin:6px 0">
        <div>${renderBansLine(aBans, aTeam?.name || "Team A", champsById)}</div>
        <div>${renderBansLine(bBans, bTeam?.name || "Team B", champsById)}</div>
      </div>
      <table class="roster-table" style="margin-top:8px">
        <thead><tr><th></th><th>Player</th><th>Champion</th>${STAT_FIELDS.map((f) => `<th>${f.label}</th>`).join("")}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
