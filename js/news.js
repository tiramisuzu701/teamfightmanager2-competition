import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { getSession } from "./auth.js";
import { postToDiscord } from "./discord.js";

renderNav("news.html");

let teams = [];
let teamsById = {};
let players = [];
let playersById = {};
let isAdmin = false;

async function init() {
  const session = await getSession();
  isAdmin = !!session;
  if (isAdmin) document.getElementById("post-news-btn").style.display = "inline-flex";

  const [{ data: teamData }, { data: playerData }] = await Promise.all([
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("players").select("id, name, team_id").order("name"),
  ]);
  teams = teamData || [];
  teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  players = playerData || [];
  playersById = Object.fromEntries(players.map((p) => [p.id, p]));

  if (isAdmin) {
    document.getElementById("trade-player").innerHTML =
      '<option value="">Select player...</option>' +
      players.map((p) => `<option value="${p.id}">${esc(p.name)}${p.team_id ? ` (${esc(teamsById[p.team_id]?.name || "")})` : ""}</option>`).join("");
    document.getElementById("trade-to-team").innerHTML =
      '<option value="">Select team...</option>' + teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  }

  document.getElementById("post-news-btn").addEventListener("click", () => {
    document.getElementById("post-news-card").style.display = "block";
  });
  document.getElementById("cancel-news-btn").addEventListener("click", () => {
    document.getElementById("post-news-card").style.display = "none";
  });
  document.getElementById("news-type").addEventListener("change", updateFormFields);
  document.getElementById("submit-news-btn").addEventListener("click", submitNews);
  updateFormFields();

  await loadFeed();
}

function updateFormFields() {
  const type = document.getElementById("news-type").value;
  document.getElementById("trade-fields").style.display = type === "trade" ? "block" : "none";
  document.getElementById("announcement-fields").style.display = type === "announcement" ? "block" : "none";
}

async function submitNews() {
  const msg = document.getElementById("news-msg");
  const type = document.getElementById("news-type").value;

  if (type === "trade") {
    const playerId = document.getElementById("trade-player").value;
    const toTeamId = document.getElementById("trade-to-team").value;
    if (!playerId || !toTeamId) {
      msg.textContent = "Pick a player and a new team.";
      msg.className = "form-msg error";
      return;
    }
    const player = playersById[playerId];
    if (player.team_id === toTeamId) {
      msg.textContent = "That player is already on that team.";
      msg.className = "form-msg error";
      return;
    }
    const fromTeamId = player.team_id || null;
    const toTeamName = teamsById[toTeamId]?.name || "a new team";

    msg.textContent = "Saving...";
    msg.className = "form-msg";

    const { error: updateError } = await supabase.from("players").update({ team_id: toTeamId }).eq("id", playerId);
    if (updateError) {
      msg.textContent = "Error updating roster: " + updateError.message;
      msg.className = "form-msg error";
      return;
    }

    const { error: newsError } = await supabase.from("news_items").insert({
      type: "trade",
      title: `${player.name} moves to ${toTeamName}`,
      player_id: playerId,
      from_team_id: fromTeamId,
      to_team_id: toTeamId,
    });
    if (newsError) {
      msg.textContent = "Roster updated, but posting the news item failed: " + newsError.message;
      msg.className = "form-msg error";
      return;
    }
    const fromTeamName = fromTeamId ? teamsById[fromTeamId]?.name : null;
    postToDiscord(`📰 **Trade:** ${player.name}${fromTeamName ? ` (${fromTeamName})` : ""} moves to **${toTeamName}**`);
  } else {
    const title = document.getElementById("ann-title").value.trim();
    const body = document.getElementById("ann-body").value.trim() || null;
    if (!title) {
      msg.textContent = "Title is required.";
      msg.className = "form-msg error";
      return;
    }
    msg.textContent = "Saving...";
    msg.className = "form-msg";
    const { error } = await supabase.from("news_items").insert({ type: "announcement", title, body });
    if (error) {
      msg.textContent = "Error: " + error.message;
      msg.className = "form-msg error";
      return;
    }
    postToDiscord(`📢 **${title}**${body ? `\n${body}` : ""}`);
  }

  msg.textContent = "Posted!";
  msg.className = "form-msg success";
  document.getElementById("ann-title").value = "";
  document.getElementById("ann-body").value = "";
  document.getElementById("trade-player").value = "";
  document.getElementById("trade-to-team").value = "";
  document.getElementById("post-news-card").style.display = "none";

  // Refresh player roster cache since a trade may have changed it.
  const { data: playerData } = await supabase.from("players").select("id, name, team_id").order("name");
  players = playerData || [];
  playersById = Object.fromEntries(players.map((p) => [p.id, p]));
  if (isAdmin) {
    document.getElementById("trade-player").innerHTML =
      '<option value="">Select player...</option>' +
      players.map((p) => `<option value="${p.id}">${esc(p.name)}${p.team_id ? ` (${esc(teamsById[p.team_id]?.name || "")})` : ""}</option>`).join("");
  }

  await loadFeed();
}

async function loadFeed() {
  const container = document.getElementById("news-feed");
  const { data, error } = await supabase.from("news_items").select("*").order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p class="empty-state">Could not load news (${esc(error.message)}).</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `<p class="empty-state">No news posted yet.</p>`;
    return;
  }
  container.innerHTML = data.map(renderNewsItem).join("");
}

function renderNewsItem(n) {
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
