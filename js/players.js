import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";

renderNav("players.html");

const STATS = [
  { key: "kda", label: "KDA", decimals: 2 },
  { key: "total_kills", label: "Total Kills", decimals: 0 },
  { key: "avg_kills", label: "Avg Kills / Game", decimals: 2 },
  { key: "total_assists", label: "Total Assists", decimals: 0 },
  { key: "total_deaths", label: "Fewest Deaths", decimals: 0, ascending: true },
  { key: "total_cs", label: "Total CS", decimals: 0 },
  { key: "avg_cs", label: "Avg CS / Game", decimals: 1 },
  { key: "total_gold", label: "Total Gold", decimals: 0 },
  { key: "total_damage", label: "Total Damage", decimals: 0 },
  { key: "total_towers", label: "Total Towers", decimals: 0 },
  { key: "total_epic_monsters", label: "Total Epic Monsters", decimals: 0 },
  { key: "wins", label: "Most Wins", decimals: 0 },
];

const ALL_COLUMNS = [
  { key: "name", label: "Player" },
  { key: "team_name", label: "Team" },
  { key: "role", label: "Role" },
  { key: "games_played", label: "GP", right: true },
  { key: "wins", label: "W", right: true },
  { key: "losses", label: "L", right: true },
  { key: "total_kills", label: "K", right: true },
  { key: "total_deaths", label: "D", right: true },
  { key: "total_assists", label: "A", right: true },
  { key: "kda", label: "KDA", right: true },
  { key: "total_cs", label: "CS", right: true },
  { key: "total_gold", label: "Gold", right: true },
  { key: "total_damage", label: "Damage", right: true },
  { key: "total_towers", label: "Towers", right: true },
  { key: "total_epic_monsters", label: "Epic Mons.", right: true },
];

let players = [];
let mode = "all"; // 'all' | 'top10'
let allSortKey = "kda";
let allSortDir = "desc";
let statSelectKey = STATS[0].key;

async function load() {
  const { data, error } = await supabase.from("player_stats_aggregate").select("*");
  const body = document.getElementById("players-body");
  if (error) {
    body.innerHTML = `<tr><td colspan="12" class="empty-state">Could not load player stats (${error.message}). Check js/config.js - see SETUP.md.</td></tr>`;
    return;
  }
  players = data || [];
  buildPills();
  buildStatSelect();
  render();
}

function buildPills() {
  const wrap = document.getElementById("leaderboard-pills");
  wrap.innerHTML = `
    <button class="pill ${mode === "all" ? "active" : ""}" data-mode="all">All Players</button>
    <button class="pill ${mode === "top10" ? "active" : ""}" data-mode="top10">Top 10 Leaderboard</button>
  `;
  wrap.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      buildPills();
      document.getElementById("stat-select").style.display = mode === "top10" ? "block" : "none";
      render();
    });
  });
}

function buildStatSelect() {
  const select = document.getElementById("stat-select");
  select.innerHTML = STATS.map((s) => `<option value="${s.key}">${s.label}</option>`).join("");
  select.value = statSelectKey;
  select.style.display = mode === "top10" ? "block" : "none";
  select.addEventListener("change", () => {
    statSelectKey = select.value;
    render();
  });
}

function render() {
  if (players.length === 0) {
    document.getElementById("players-body").innerHTML =
      `<tr><td colspan="12" class="empty-state">No players yet. Add players on the <a href="manage.html">Manage</a> tab, then log some games to see stats here.</td></tr>`;
    document.getElementById("players-head-row").innerHTML = "";
    return;
  }
  if (mode === "all") renderAllTable();
  else renderLeaderboard();
}

function renderAllTable() {
  document.getElementById("table-heading").textContent = "All Players";
  const head = document.getElementById("players-head-row");
  head.innerHTML = ALL_COLUMNS.map(
    (c) => `<th data-key="${c.key}" class="${c.right ? "text-right" : ""} ${allSortKey === c.key ? "sorted" : ""}">${c.label}</th>`
  ).join("");
  head.querySelectorAll("th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (allSortKey === key) allSortDir = allSortDir === "asc" ? "desc" : "asc";
      else { allSortKey = key; allSortDir = "desc"; }
      render();
    });
  });

  const sorted = [...players].sort((a, b) => {
    const av = a[allSortKey] ?? 0, bv = b[allSortKey] ?? 0;
    if (typeof av === "string") return allSortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return allSortDir === "asc" ? av - bv : bv - av;
  });

  document.getElementById("players-body").innerHTML = sorted
    .map((p) => `
      <tr>
        <td class="team-name">${esc(p.name)}</td>
        <td class="text-muted">${esc(p.team_name || "-")}</td>
        <td class="text-muted">${esc(p.role || "-")}</td>
        <td class="text-right num">${p.games_played}</td>
        <td class="text-right num win-badge">${p.wins}</td>
        <td class="text-right num loss-badge">${p.losses}</td>
        <td class="text-right num">${p.total_kills}</td>
        <td class="text-right num">${p.total_deaths}</td>
        <td class="text-right num">${p.total_assists}</td>
        <td class="text-right num">${p.kda ?? "-"}</td>
        <td class="text-right num">${p.total_cs}</td>
        <td class="text-right num">${p.total_gold}</td>
        <td class="text-right num">${p.total_damage}</td>
        <td class="text-right num">${p.total_towers}</td>
        <td class="text-right num">${p.total_epic_monsters}</td>
      </tr>`)
    .join("");
}

function renderLeaderboard() {
  const stat = STATS.find((s) => s.key === statSelectKey);
  document.getElementById("table-heading").textContent = `Top 10 - ${stat.label}`;

  const head = document.getElementById("players-head-row");
  head.innerHTML = `
    <th>#</th><th>Player</th><th>Team</th><th class="text-right sorted">${stat.label}</th>
  `;

  const ranked = [...players]
    .filter((p) => p.games_played > 0)
    .sort((a, b) => {
      const av = a[stat.key] ?? 0, bv = b[stat.key] ?? 0;
      return stat.ascending ? av - bv : bv - av;
    })
    .slice(0, 10);

  if (ranked.length === 0) {
    document.getElementById("players-body").innerHTML = `<tr><td colspan="4" class="empty-state">No games logged yet for this stat.</td></tr>`;
    return;
  }

  document.getElementById("players-body").innerHTML = ranked
    .map((p, i) => {
      const rankClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";
      const val = stat.decimals > 0 ? Number(p[stat.key] ?? 0).toFixed(stat.decimals) : (p[stat.key] ?? 0);
      return `
        <tr>
          <td class="${rankClass}">${i + 1}</td>
          <td class="team-name">${esc(p.name)}</td>
          <td class="text-muted">${esc(p.team_name || "-")}</td>
          <td class="text-right num ${rankClass}">${val}</td>
        </tr>`;
    })
    .join("");
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

load();
