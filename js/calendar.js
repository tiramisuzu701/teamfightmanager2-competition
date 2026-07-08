import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { getSession } from "./auth.js";

renderNav("calendar.html");

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let viewDate = startOfMonth(new Date());
let games = [];
let teams = [];
let teamsById = {};
let isAdmin = false;
let selectedDateKey = null;

async function init() {
  const session = await getSession();
  isAdmin = !!session;
  if (isAdmin) document.getElementById("new-schedule-btn").style.display = "inline-flex";

  const { data: teamData } = await supabase.from("teams").select("id, name").order("name");
  teams = teamData || [];
  teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));

  const options = ['<option value="">Select team...</option>'].concat(teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)).join("");
  document.getElementById("s-team-a").innerHTML = options;
  document.getElementById("s-team-b").innerHTML = options;

  document.getElementById("new-schedule-btn").addEventListener("click", () => {
    document.getElementById("new-schedule-card").style.display = "block";
  });
  document.getElementById("cancel-schedule-btn").addEventListener("click", () => {
    document.getElementById("new-schedule-card").style.display = "none";
  });
  document.getElementById("create-schedule-btn").addEventListener("click", createSchedule);
  document.getElementById("prev-month-btn").addEventListener("click", () => changeMonth(-1));
  document.getElementById("next-month-btn").addEventListener("click", () => changeMonth(1));

  renderDow();
  await loadMonth();
}

function renderDow() {
  document.getElementById("calendar-dow").innerHTML = DOW.map((d) => `<div class="calendar-dow">${d}</div>`).join("");
}

async function changeMonth(delta) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
  await loadMonth();
}

async function loadMonth() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = `<div class="empty-state">Loading...</div>`;
  document.getElementById("month-label").textContent = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);

  const { data, error } = await supabase
    .from("scheduled_games")
    .select("*")
    .gte("scheduled_at", monthStart.toISOString())
    .lt("scheduled_at", monthEnd.toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) {
    grid.innerHTML = `<div class="empty-state">Could not load schedule (${esc(error.message)}).</div>`;
    return;
  }
  games = data || [];
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById("calendar-grid");
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayKey = dateKey(today);

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  grid.innerHTML = cells
    .map((date) => {
      if (!date) return `<div class="calendar-cell outside"></div>`;
      const key = dateKey(date);
      const dayGames = games.filter((g) => dateKey(new Date(g.scheduled_at)) === key);
      const isToday = key === todayKey;
      const pills = dayGames
        .slice(0, 3)
        .map((g) => {
          const a = teamsById[g.team_a_id]?.short_name || teamsById[g.team_a_id]?.name || "TBD";
          const b = teamsById[g.team_b_id]?.short_name || teamsById[g.team_b_id]?.name || "TBD";
          return `<span class="calendar-game-pill ${g.status === "completed" ? "completed" : ""}" data-day="${key}">${esc(a)} v ${esc(b)}</span>`;
        })
        .join("");
      const more = dayGames.length > 3 ? `<span class="text-muted" style="font-size:0.68rem">+${dayGames.length - 3} more</span>` : "";
      return `
        <div class="calendar-cell ${isToday ? "today" : ""}" data-day="${key}">
          <div class="cell-date">${date.getDate()}</div>
          ${pills}${more}
        </div>`;
    })
    .join("");

  grid.querySelectorAll("[data-day]").forEach((el) => {
    el.addEventListener("click", () => showDayDetail(el.dataset.day));
  });
}

function showDayDetail(key) {
  selectedDateKey = key;
  const dayGames = games.filter((g) => dateKey(new Date(g.scheduled_at)) === key);
  const card = document.getElementById("day-detail-card");
  const title = document.getElementById("day-detail-title");
  const body = document.getElementById("day-detail-body");

  card.style.display = "block";
  const [y, m, d] = key.split("-").map(Number);
  title.textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  if (dayGames.length === 0) {
    body.innerHTML = `<p class="empty-state">No games scheduled this day.</p>`;
    return;
  }

  body.innerHTML = dayGames
    .map((g) => {
      const aTeam = teamsById[g.team_a_id];
      const bTeam = teamsById[g.team_b_id];
      const a = aTeam ? `<a href="team.html?id=${aTeam.id}">${esc(aTeam.name)}</a>` : "TBD";
      const b = bTeam ? `<a href="team.html?id=${bTeam.id}">${esc(bTeam.name)}</a>` : "TBD";
      const time = new Date(g.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const cancelBtn =
        isAdmin && g.status === "scheduled"
          ? `<button class="btn btn-sm btn-danger" data-cancel="${g.id}">Cancel</button>`
          : "";
      return `
        <div class="upcoming-game-row">
          <span>${a} <span class="text-muted">vs</span> ${b} <span class="text-muted">- ${time}</span> ${statusBadge(g.status)}</span>
          ${cancelBtn}
        </div>`;
    })
    .join("");

  body.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", () => cancelSchedule(btn.dataset.cancel));
  });
}

function statusBadge(status) {
  if (status === "completed") return `<span class="text-muted" style="font-size:0.75rem">(played)</span>`;
  if (status === "cancelled") return `<span class="loss-badge" style="font-size:0.75rem">(cancelled)</span>`;
  return "";
}

async function cancelSchedule(id) {
  const ok = window.confirm("Cancel this scheduled game? Any predictions already made for it will remain but the game will no longer be predictable or listed as upcoming.");
  if (!ok) return;
  const { error } = await supabase.from("scheduled_games").update({ status: "cancelled" }).eq("id", id);
  if (error) return alert("Error: " + error.message);
  await loadMonth();
  if (selectedDateKey) showDayDetail(selectedDateKey);
}

async function createSchedule() {
  const msg = document.getElementById("schedule-msg");
  const teamA = document.getElementById("s-team-a").value;
  const teamB = document.getElementById("s-team-b").value;
  const date = document.getElementById("s-date").value;
  const time = document.getElementById("s-time").value || "18:00";
  const notes = document.getElementById("s-notes").value || null;

  if (!teamA || !teamB || teamA === teamB) {
    msg.textContent = "Pick two different teams.";
    msg.className = "form-msg error";
    return;
  }
  if (!date) {
    msg.textContent = "Pick a date.";
    msg.className = "form-msg error";
    return;
  }

  const scheduledAt = new Date(`${date}T${time}:00`);
  if (isNaN(scheduledAt.getTime())) {
    msg.textContent = "Invalid date/time.";
    msg.className = "form-msg error";
    return;
  }

  msg.textContent = "Saving...";
  msg.className = "form-msg";
  const { error } = await supabase.from("scheduled_games").insert({
    team_a_id: teamA,
    team_b_id: teamB,
    scheduled_at: scheduledAt.toISOString(),
    notes,
  });
  if (error) {
    msg.textContent = "Error: " + error.message;
    msg.className = "form-msg error";
    return;
  }

  msg.textContent = "Scheduled!";
  msg.className = "form-msg success";
  document.getElementById("s-team-a").value = "";
  document.getElementById("s-team-b").value = "";
  document.getElementById("s-date").value = "";
  document.getElementById("s-notes").value = "";
  document.getElementById("new-schedule-card").style.display = "none";

  // Jump the calendar to the month the new game was scheduled in.
  viewDate = startOfMonth(scheduledAt);
  await loadMonth();
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
