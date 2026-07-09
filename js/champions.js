import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { loadSeasons, currentSeason, populateSeasonSelect } from "./seasons.js";

renderNav("champions.html");

let rows = [];
let sortKey = "pick_rate";
let sortDir = "desc";
let selectedSeasonId = null;
let highlightId = new URLSearchParams(location.search).get("highlight");

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
  const body = document.getElementById("champions-body");
  if (!selectedSeasonId) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">No season found yet.</td></tr>`;
    return;
  }

  const { data, error } = await supabase
    .from("champion_stats")
    .select("*")
    .eq("season_id", selectedSeasonId);

  if (error) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">Could not load champions (${error.message}). Check js/config.js is set up - see SETUP.md.</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">No champions yet. Log in as admin and add champions on the <a href="manage.html">Manage</a> tab.</td></tr>`;
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

  const body = document.getElementById("champions-body");
  body.innerHTML = sorted
    .map(
      (c) => `
        <tr data-champion-id="${c.champion_id}">
          <td class="team-name">${c.icon_url ? `<img src="${escapeHtml(c.icon_url)}" alt="" class="thumb-logo" />` : ""}${escapeHtml(c.name)}</td>
          <td class="text-right num">${c.times_picked ?? 0}</td>
          <td class="text-right num">${c.pick_rate != null ? c.pick_rate + "%" : "-"}</td>
          <td class="text-right num">${c.times_banned ?? 0}</td>
          <td class="text-right num">${c.ban_rate != null ? c.ban_rate + "%" : "-"}</td>
          <td class="text-right num win-badge">${c.wins ?? 0}</td>
          <td class="text-right num">${c.win_rate != null ? c.win_rate + "%" : "-"}</td>
        </tr>`
    )
    .join("");

  document.querySelectorAll("#champions-table thead th").forEach((th) => {
    th.classList.toggle("sorted", th.dataset.key === sortKey);
  });

  if (highlightId) {
    const row = body.querySelector(`tr[data-champion-id="${highlightId}"]`);
    if (row) {
      row.classList.add("row-highlight");
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => row.classList.remove("row-highlight"), 3000);
    }
    highlightId = null; // only auto-highlight/scroll once, not on every re-sort
  }
}

document.querySelectorAll("#champions-table thead th").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
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
