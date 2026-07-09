import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";

renderNav("predictions.html");

const NAME_KEY = "tfm2_predictor_name";
const LOCK_MINUTES = 30;

let teamsById = {};
let matches = [];
let predictionsByMatch = {}; // match_id -> array of predictions

function getName() {
  return (localStorage.getItem(NAME_KEY) || "").trim();
}
function setName(name) {
  localStorage.setItem(NAME_KEY, name.trim());
}

async function init() {
  const nameInput = document.getElementById("predictor-name");
  nameInput.value = getName();
  nameInput.addEventListener("change", () => {
    setName(nameInput.value);
    render();
  });

  // Delegate pick-button clicks to the (stable) container instead of
  // attaching listeners to individual buttons in render(). Buttons get torn
  // down and recreated on every render, and a render can happen mid-click -
  // e.g. clicking a pick button blurs the focused name input, which fires a
  // native "change" event that re-renders the list between mousedown and
  // click. A listener bound directly to the old button would never fire
  // since that node no longer exists by the time the click lands; a
  // listener on the container (which is never replaced, only its contents)
  // always catches it via event bubbling.
  document.getElementById("games-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-match]");
    if (btn) submitPrediction(btn.dataset.match, btn.dataset.team);
  });

  const { data: teams } = await supabase.from("teams").select("id, name, short_name");
  teamsById = Object.fromEntries((teams || []).map((t) => [t.id, t]));

  await loadTodaysMatches();
  await loadLeaderboard();
}

async function loadTodaysMatches() {
  const list = document.getElementById("games-list");
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), startOfDay.getDate() + 1);

  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .gte("scheduled_at", startOfDay.toISOString())
    .lt("scheduled_at", endOfDay.toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) {
    list.innerHTML = `<p class="empty-state">Could not load today's matches (${esc(error.message)}).</p>`;
    return;
  }
  matches = data || [];
  if (matches.length === 0) {
    list.innerHTML = `<p class="empty-state">No matches scheduled today. Check the <a href="calendar.html">Calendar</a> for what's coming up.</p>`;
    return;
  }

  const { data: preds } = await supabase
    .from("predictions")
    .select("*")
    .in("match_id", matches.map((m) => m.id));
  predictionsByMatch = {};
  (preds || []).forEach((p) => {
    predictionsByMatch[p.match_id] = predictionsByMatch[p.match_id] || [];
    predictionsByMatch[p.match_id].push(p);
  });

  render();
}

function render() {
  const list = document.getElementById("games-list");
  if (matches.length === 0) return;
  const myName = getName();

  list.innerHTML = matches
    .map((m) => {
      const a = teamsById[m.team_a_id];
      const b = teamsById[m.team_b_id];
      const preds = predictionsByMatch[m.id] || [];
      const aCount = preds.filter((p) => p.predicted_team_id === m.team_a_id).length;
      const bCount = preds.filter((p) => p.predicted_team_id === m.team_b_id).length;
      const mine = myName ? preds.find((p) => p.predictor_name === myName) : null;
      const lockTime = new Date(new Date(m.scheduled_at).getTime() - LOCK_MINUTES * 60000);
      const isLocked = new Date() >= lockTime || m.status !== "scheduled";
      const time = new Date(m.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

      let statusLine;
      if (m.status === "cancelled") statusLine = `<span class="loss-badge">Cancelled</span>`;
      else if (m.status === "completed") statusLine = `<span class="text-muted">Final ${m.team_a_wins}-${m.team_b_wins}</span>`;
      else if (m.status === "in_progress") statusLine = `<span class="text-muted">In progress ${m.team_a_wins}-${m.team_b_wins}</span>`;
      else if (isLocked) statusLine = `<span class="text-muted">Predictions locked</span>`;
      else statusLine = `<span class="win-badge">Open until ${lockTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>`;

      const disableForm = isLocked || !myName;
      const aSelected = mine?.predicted_team_id === m.team_a_id;
      const bSelected = mine?.predicted_team_id === m.team_b_id;

      return `
        <div class="card" style="background:var(--bg);margin-bottom:14px">
          <div class="stat-toggle-row" style="margin-bottom:10px">
            <strong>${time} &middot; Bo${m.best_of}</strong>
            ${statusLine}
          </div>
          <div class="field-row">
            <button class="btn ${aSelected ? "btn-primary" : ""}" data-match="${m.id}" data-team="${m.team_a_id}" ${disableForm ? "disabled" : ""}>
              ${esc(a?.name || "TBD")} <span class="text-muted">(${aCount})</span>
            </button>
            <button class="btn ${bSelected ? "btn-primary" : ""}" data-match="${m.id}" data-team="${m.team_b_id}" ${disableForm ? "disabled" : ""}>
              ${esc(b?.name || "TBD")} <span class="text-muted">(${bCount})</span>
            </button>
          </div>
          ${!myName ? `<p class="text-muted" style="font-size:0.78rem;margin-top:8px">Enter your name above to make a pick.</p>` : ""}
          ${mine ? `<p class="text-muted" style="font-size:0.78rem;margin-top:8px">Your pick: <strong>${esc(teamsById[mine.predicted_team_id]?.name || "-")}</strong>${!isLocked ? " (click the other team to change it)" : ""}</p>` : ""}
        </div>`;
    })
    .join("");
}

async function submitPrediction(matchId, teamId) {
  const name = getName();
  if (!name) return;

  const { error } = await supabase
    .from("predictions")
    .upsert(
      {
        match_id: matchId,
        predictor_name: name,
        predicted_team_id: teamId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id,predictor_name" }
    );

  if (error) {
    alert("Could not save your prediction: " + error.message + "\nIt may have just locked - refresh the page to check.");
    return;
  }
  await loadTodaysMatches();
}

async function loadLeaderboard() {
  const body = document.getElementById("leaderboard-body");
  const { data, error } = await supabase
    .from("prediction_leaderboard")
    .select("*")
    .gt("total_predictions", 0)
    .order("accuracy_pct", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">Could not load leaderboard.</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">No completed predictions yet - check back once matches have been played.</td></tr>`;
    return;
  }
  body.innerHTML = data
    .map(
      (p, i) => `
      <tr>
        <td class="${i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : ""}">${i + 1}</td>
        <td class="team-name">${esc(p.predictor_name)}</td>
        <td class="text-right num win-badge">${p.correct_predictions}</td>
        <td class="text-right num">${p.total_predictions}</td>
        <td class="text-right num">${p.accuracy_pct != null ? p.accuracy_pct + "%" : "-"}</td>
      </tr>`
    )
    .join("");
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
