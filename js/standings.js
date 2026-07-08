import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { loadSeasons, currentSeason, populateSeasonSelect } from "./seasons.js";

renderNav("standings.html");

let rows = [];
let sortKey = "win_pct";
let sortDir = "desc";
let selectedSeasonId = null;

async function init() {
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
    load();
  });
  load();
}

async function load() {
  const body = document.getElementById("standings-body");
  if (!selectedSeasonId) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">No season found yet.</td></tr>`;
    return;
  }

  const { data, error } = await supabase
    .from("team_standings")
    .select("*")
    .eq("season_id", selectedSeasonId);

  if (error) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">Could not load standings (${error.message}). Check js/config.js is set up - see SETUP.md.</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="empty-state">No teams yet. Log in as admin, add teams on the <a href="manage.html">Manage</a> tab, then log some games.</td></tr>`;
    return;
  }

  rows = data;
  render();
}

function render() {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const body = document.getElementById("standings-body");
  body.innerHTML = sorted
    .map((t, i) => {
      const rankClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";
      return `
        <tr>
          <td class="${rankClass}">${i + 1}</td>
          <td class="team-name">${t.logo_url ? `<img src="${escapeHtml(t.logo_url)}" alt="" class="thumb-logo" />` : ""}<a href="team.html?id=${t.team_id}">${escapeHtml(t.name)}</a>${t.short_name ? ` <span class="text-muted">(${escapeHtml(t.short_name)})</span>` : ""}</td>
          <td class="text-right num win-badge">${t.wins ?? 0}</td>
          <td class="text-right num loss-badge">${t.losses ?? 0}</td>
          <td class="text-right num">${t.games_played ?? 0}</td>
          <td class="text-right num">${t.win_pct != null ? t.win_pct + "%" : "-"}</td>
        </tr>`;
    })
    .join("");

  document.querySelectorAll("#standings-table thead th").forEach((th) => {
    th.classList.toggle("sorted", th.dataset.key === sortKey);
  });
}

document.querySelectorAll("#standings-table thead th").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (key === "rank") return;
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "desc";
    }
    render();
  });
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
