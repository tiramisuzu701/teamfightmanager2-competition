import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { requireAdmin } from "./auth.js";
import { loadSeasons, currentSeason, startNewSeason } from "./seasons.js";

renderNav("manage.html");
const session = await requireAdmin();

let teams = [];
let players = [];

async function loadSeasonInfo() {
  const line = document.getElementById("current-season-line");
  try {
    const seasons = await loadSeasons();
    const current = currentSeason(seasons);
    line.textContent = current
      ? `Current season: ${current.name} (started ${new Date(current.started_at).toLocaleDateString()})`
      : "No season found.";
  } catch (err) {
    line.textContent = "Could not load season info: " + err.message;
  }
}

document.getElementById("start-season-btn").addEventListener("click", async () => {
  const msg = document.getElementById("season-msg");
  const name = document.getElementById("new-season-name").value.trim();
  if (!name) {
    msg.textContent = "Season name is required.";
    msg.className = "form-msg error";
    return;
  }
  const ok = window.confirm(
    `Start "${name}" as the new current season? Standings and Players will reset to zero going forward - all past games and stats stay intact and browsable via the season picker.`
  );
  if (!ok) return;

  msg.textContent = "Saving...";
  msg.className = "form-msg";
  try {
    await startNewSeason(name);
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.className = "form-msg error";
    return;
  }
  document.getElementById("new-season-name").value = "";
  msg.textContent = "New season started!";
  msg.className = "form-msg success";
  await loadSeasonInfo();
});

async function loadAll() {
  const [{ data: teamData, error: tErr }, { data: playerData, error: pErr }] = await Promise.all([
    supabase.from("teams").select("id, name, short_name").order("name"),
    supabase.from("players").select("id, name, role, team_id").order("name"),
  ]);
  if (tErr || pErr) {
    console.error(tErr || pErr);
    return;
  }
  teams = teamData || [];
  players = playerData || [];
  renderTeams();
  renderPlayers();
  renderTeamDropdown();
}

function renderTeams() {
  const body = document.getElementById("teams-body");
  if (teams.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No teams yet - add one above.</td></tr>`;
    return;
  }
  body.innerHTML = teams
    .map((t) => {
      const playerCount = players.filter((p) => p.team_id === t.id).length;
      return `
      <tr>
        <td class="team-name">${esc(t.name)}</td>
        <td class="text-muted">${esc(t.short_name || "-")}</td>
        <td class="text-right num">${playerCount}</td>
        <td><button class="btn btn-sm btn-danger" data-delete-team="${t.id}">Delete</button></td>
      </tr>`;
    })
    .join("");
  body.querySelectorAll("[data-delete-team]").forEach((btn) => {
    btn.addEventListener("click", () => deleteTeam(btn.dataset.deleteTeam));
  });
}

function renderPlayers() {
  const body = document.getElementById("players-body");
  if (players.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No players yet - add one above.</td></tr>`;
    return;
  }
  body.innerHTML = players
    .map((p) => {
      const team = teams.find((t) => t.id === p.team_id);
      return `
      <tr>
        <td class="team-name">${esc(p.name)}</td>
        <td class="text-muted">${esc(p.role || "-")}</td>
        <td class="text-muted">${team ? esc(team.name) : "-"}</td>
        <td><button class="btn btn-sm btn-danger" data-delete-player="${p.id}">Delete</button></td>
      </tr>`;
    })
    .join("");
  body.querySelectorAll("[data-delete-player]").forEach((btn) => {
    btn.addEventListener("click", () => deletePlayer(btn.dataset.deletePlayer));
  });
}

function renderTeamDropdown() {
  const select = document.getElementById("new-player-team");
  select.innerHTML =
    teams.length === 0
      ? '<option value="">Add a team first</option>'
      : teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
}

document.getElementById("add-team-btn").addEventListener("click", async () => {
  const msg = document.getElementById("team-msg");
  const name = document.getElementById("new-team-name").value.trim();
  const shortName = document.getElementById("new-team-short").value.trim() || null;
  if (!name) {
    msg.textContent = "Team name is required.";
    msg.className = "form-msg error";
    return;
  }
  msg.textContent = "Saving...";
  msg.className = "form-msg";
  const { error } = await supabase.from("teams").insert({ name, short_name: shortName });
  if (error) {
    msg.textContent = "Error: " + error.message;
    msg.className = "form-msg error";
    return;
  }
  document.getElementById("new-team-name").value = "";
  document.getElementById("new-team-short").value = "";
  msg.textContent = "Team added!";
  msg.className = "form-msg success";
  loadAll();
});

document.getElementById("add-player-btn").addEventListener("click", async () => {
  const msg = document.getElementById("player-msg");
  const name = document.getElementById("new-player-name").value.trim();
  const role = document.getElementById("new-player-role").value.trim() || null;
  const teamId = document.getElementById("new-player-team").value || null;
  if (!name) {
    msg.textContent = "Player name is required.";
    msg.className = "form-msg error";
    return;
  }
  msg.textContent = "Saving...";
  msg.className = "form-msg";
  const { error } = await supabase.from("players").insert({ name, role, team_id: teamId });
  if (error) {
    msg.textContent = "Error: " + error.message;
    msg.className = "form-msg error";
    return;
  }
  document.getElementById("new-player-name").value = "";
  document.getElementById("new-player-role").value = "";
  msg.textContent = "Player added!";
  msg.className = "form-msg success";
  loadAll();
});

async function deleteTeam(id) {
  const ok = window.confirm("Delete this team? Players on this team will be kept but unassigned. Past game stats are kept.");
  if (!ok) return;
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) return alert("Error: " + error.message);
  loadAll();
}

async function deletePlayer(id) {
  const ok = window.confirm("Delete this player? Their past logged game stats will be removed too.");
  if (!ok) return;
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) return alert("Error: " + error.message);
  loadAll();
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

if (session) {
  loadAll();
  loadSeasonInfo();
}
