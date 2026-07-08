import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { requireAdmin } from "./auth.js";
import { loadSeasons, currentSeason, startNewSeason } from "./seasons.js";
import { loadSettingsAdmin, saveSettingsAdmin } from "./settings.js";
import { invalidateWebhookCache } from "./discord.js";

renderNav("manage.html");
const session = await requireAdmin();

let teams = [];
let players = [];

async function loadIntegrations() {
  const input = document.getElementById("discord-webhook");
  try {
    const settings = await loadSettingsAdmin();
    input.value = settings?.discord_webhook_url || "";
  } catch (err) {
    console.error("Could not load integration settings", err);
  }
}

document.getElementById("save-webhook-btn").addEventListener("click", async () => {
  const msg = document.getElementById("webhook-msg");
  const url = document.getElementById("discord-webhook").value.trim() || null;
  msg.textContent = "Saving...";
  msg.className = "form-msg";
  try {
    await saveSettingsAdmin({ discord_webhook_url: url });
    invalidateWebhookCache();
    msg.textContent = "Saved!";
    msg.className = "form-msg success";
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.className = "form-msg error";
  }
});

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
    supabase.from("teams").select("id, name, short_name, logo_url").order("name"),
    supabase.from("players").select("id, name, role, team_id, photo_url").order("name"),
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
    body.innerHTML = `<tr><td colspan="5" class="empty-state">No teams yet - add one above.</td></tr>`;
    return;
  }
  body.innerHTML = teams
    .map((t) => {
      const playerCount = players.filter((p) => p.team_id === t.id).length;
      return `
      <tr>
        <td>
          ${t.logo_url ? `<img src="${esc(t.logo_url)}" alt="" class="thumb-logo" />` : `<span class="thumb-placeholder">?</span>`}
          <input type="file" accept="image/*" class="logo-input" data-team-id="${t.id}" style="display:none" />
          <button class="btn btn-sm btn-ghost" data-upload-logo="${t.id}">Upload</button>
        </td>
        <td class="team-name"><a href="team.html?id=${t.id}">${esc(t.name)}</a></td>
        <td class="text-muted">${esc(t.short_name || "-")}</td>
        <td class="text-right num">${playerCount}</td>
        <td><button class="btn btn-sm btn-danger" data-delete-team="${t.id}">Delete</button></td>
      </tr>`;
    })
    .join("");
  body.querySelectorAll("[data-delete-team]").forEach((btn) => {
    btn.addEventListener("click", () => deleteTeam(btn.dataset.deleteTeam));
  });
  body.querySelectorAll("[data-upload-logo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = body.querySelector(`.logo-input[data-team-id="${btn.dataset.uploadLogo}"]`);
      input.click();
    });
  });
  body.querySelectorAll(".logo-input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.files[0]) uploadTeamLogo(input.dataset.teamId, input.files[0]);
    });
  });
}

function renderPlayers() {
  const body = document.getElementById("players-body");
  if (players.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">No players yet - add one above.</td></tr>`;
    return;
  }
  body.innerHTML = players
    .map((p) => {
      const team = teams.find((t) => t.id === p.team_id);
      return `
      <tr>
        <td>
          ${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="" class="thumb-logo" />` : `<span class="thumb-placeholder">?</span>`}
          <input type="file" accept="image/*" class="photo-input" data-player-id="${p.id}" style="display:none" />
          <button class="btn btn-sm btn-ghost" data-upload-photo="${p.id}">Upload</button>
        </td>
        <td class="team-name"><a href="player.html?id=${p.id}">${esc(p.name)}</a></td>
        <td class="text-muted">${esc(p.role || "-")}</td>
        <td class="text-muted">${team ? `<a href="team.html?id=${team.id}">${esc(team.name)}</a>` : "-"}</td>
        <td><button class="btn btn-sm btn-danger" data-delete-player="${p.id}">Delete</button></td>
      </tr>`;
    })
    .join("");
  body.querySelectorAll("[data-delete-player]").forEach((btn) => {
    btn.addEventListener("click", () => deletePlayer(btn.dataset.deletePlayer));
  });
  body.querySelectorAll("[data-upload-photo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = body.querySelector(`.photo-input[data-player-id="${btn.dataset.uploadPhoto}"]`);
      input.click();
    });
  });
  body.querySelectorAll(".photo-input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.files[0]) uploadPlayerPhoto(input.dataset.playerId, input.files[0]);
    });
  });
}

async function uploadTeamLogo(teamId, file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${teamId}/logo.${ext}`;
  const { error: uploadError } = await supabase.storage.from("team-logos").upload(path, file, { upsert: true, cacheControl: "3600" });
  if (uploadError) return alert("Upload failed: " + uploadError.message);
  const { data } = supabase.storage.from("team-logos").getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`; // cache-bust so a re-upload shows immediately
  const { error: updateError } = await supabase.from("teams").update({ logo_url: publicUrl }).eq("id", teamId);
  if (updateError) return alert("Logo uploaded, but saving it to the team failed: " + updateError.message);
  loadAll();
}

async function uploadPlayerPhoto(playerId, file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${playerId}/photo.${ext}`;
  const { error: uploadError } = await supabase.storage.from("player-photos").upload(path, file, { upsert: true, cacheControl: "3600" });
  if (uploadError) return alert("Upload failed: " + uploadError.message);
  const { data } = supabase.storage.from("player-photos").getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase.from("players").update({ photo_url: publicUrl }).eq("id", playerId);
  if (updateError) return alert("Photo uploaded, but saving it to the player failed: " + updateError.message);
  loadAll();
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
  loadIntegrations();
}
