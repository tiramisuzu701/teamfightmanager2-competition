import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { getSession } from "./auth.js";
import { generateDoubleElimination, generateRoundRobin, advanceMatch } from "./bracketGen.js";
import { loadSeasons, currentSeason } from "./seasons.js";

renderNav("brackets.html");

let teams = [];
let teamsById = {};
let tournaments = [];
let isAdmin = false;
let seedOrder = null; // non-null once "Seed from Standings" is used

async function init() {
  const session = await getSession();
  isAdmin = !!session;

  const [{ data: teamData }, { data: tData }] = await Promise.all([
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("tournaments").select("id, name, format").order("created_at", { ascending: false }),
  ]);
  teams = teamData || [];
  teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  tournaments = tData || [];

  const select = document.getElementById("tournament-select");
  select.innerHTML =
    tournaments.length === 0
      ? '<option value="">No tournaments yet</option>'
      : tournaments.map((t) => `<option value="${t.id}">${esc(t.name)} (${t.format === "double_elimination" ? "Double Elim" : "Round Robin"})</option>`).join("");
  select.addEventListener("change", () => loadAndRenderTournament(select.value));

  if (isAdmin) {
    document.getElementById("new-tournament-btn").style.display = "inline-flex";
  }
  document.getElementById("new-tournament-btn").addEventListener("click", openNewTournamentForm);
  document.getElementById("cancel-tournament-btn").addEventListener("click", closeNewTournamentForm);
  document.getElementById("t-format").addEventListener("change", (e) => {
    document.getElementById("rr-options").style.display = e.target.value === "round_robin" ? "block" : "none";
  });
  document.getElementById("create-tournament-btn").addEventListener("click", createTournament);
  document.getElementById("seed-from-standings-btn").addEventListener("click", useSeedFromStandings);

  if (tournaments.length > 0) {
    select.value = tournaments[0].id;
    loadAndRenderTournament(tournaments[0].id);
  }
}

function openNewTournamentForm() {
  document.getElementById("new-tournament-card").style.display = "block";
  seedOrder = null;
  renderCheckboxes();
}
function closeNewTournamentForm() {
  document.getElementById("new-tournament-card").style.display = "none";
  document.getElementById("create-msg").textContent = "";
}

function renderCheckboxes() {
  document.getElementById("team-checkboxes").innerHTML = teams
    .map((t) => `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px"><input type="checkbox" value="${t.id}" style="width:auto" />${esc(t.name)}</label>`)
    .join("");
}

async function useSeedFromStandings() {
  const msg = document.getElementById("create-msg");
  msg.textContent = "Loading current standings...";
  msg.className = "form-msg";
  try {
    const seasons = await loadSeasons();
    const season = currentSeason(seasons);
    if (!season) throw new Error("No current season found.");
    const { data, error } = await supabase
      .from("team_standings")
      .select("*")
      .eq("season_id", season.id)
      .order("win_pct", { ascending: false });
    if (error) throw error;
    const ranked = (data || []).filter((t) => teamsById[t.team_id]);
    if (ranked.length < 2) throw new Error("Need at least 2 teams with a standings record to seed from.");
    seedOrder = ranked.map((t) => t.team_id);
    renderSeedList();
    msg.textContent = `Seeded ${seedOrder.length} teams by ${season.name} win %.`;
    msg.className = "form-msg success";
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.className = "form-msg error";
  }
}

function renderSeedList() {
  const container = document.getElementById("team-checkboxes");
  container.innerHTML = `
    <ol style="margin:0;padding-left:22px">
      ${seedOrder.map((id) => `<li style="padding:4px 0">${esc(teamsById[id]?.name || "Unknown")}</li>`).join("")}
    </ol>
    <button class="btn btn-ghost btn-sm" id="clear-seed-btn" type="button">Use manual selection instead</button>`;
  document.getElementById("clear-seed-btn").addEventListener("click", () => {
    seedOrder = null;
    renderCheckboxes();
  });
}

async function createTournament() {
  const msg = document.getElementById("create-msg");
  const name = document.getElementById("t-name").value.trim();
  const format = document.getElementById("t-format").value;
  const checked = seedOrder || [...document.querySelectorAll("#team-checkboxes input:checked")].map((cb) => cb.value);

  if (!name) return (msg.textContent = "Please enter a tournament name."), void (msg.className = "form-msg error");
  if (checked.length < 2) return (msg.textContent = "Select at least 2 teams."), void (msg.className = "form-msg error");

  msg.textContent = "Creating bracket...";
  msg.className = "form-msg";

  try {
    const { data: tournament, error: tErr } = await supabase.from("tournaments").insert({ name, format }).select().single();
    if (tErr) throw tErr;

    let matches;
    if (format === "double_elimination") {
      matches = generateDoubleElimination(tournament.id, checked);
    } else {
      const groupCount = Math.max(1, Number(document.getElementById("t-groups").value) || 1);
      const doubleRound = document.getElementById("t-double").checked;
      matches = generateRoundRobin(tournament.id, checked, { groupCount, doubleRound });
    }

    const { error: mErr } = await supabase.from("bracket_matches").insert(matches);
    if (mErr) throw mErr;

    msg.textContent = "Tournament created!";
    msg.className = "form-msg success";
    tournaments.unshift({ id: tournament.id, name: tournament.name, format: tournament.format });
    const select = document.getElementById("tournament-select");
    select.innerHTML = tournaments.map((t) => `<option value="${t.id}">${esc(t.name)} (${t.format === "double_elimination" ? "Double Elim" : "Round Robin"})</option>`).join("");
    select.value = tournament.id;
    closeNewTournamentForm();
    loadAndRenderTournament(tournament.id);
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.className = "form-msg error";
  }
}

let currentMatches = [];
let currentTournament = null;

async function loadAndRenderTournament(tournamentId) {
  const display = document.getElementById("bracket-display");
  if (!tournamentId) {
    display.innerHTML = `<div class="empty-state">Select a tournament above, or create a new one.</div>`;
    return;
  }
  display.innerHTML = `<div class="empty-state">Loading bracket...</div>`;
  currentTournament = tournaments.find((t) => t.id === tournamentId);
  const { data, error } = await supabase.from("bracket_matches").select("*").eq("tournament_id", tournamentId);
  if (error) {
    display.innerHTML = `<div class="empty-state">Could not load bracket (${error.message})</div>`;
    return;
  }
  currentMatches = data || [];
  render();
}

function render() {
  const display = document.getElementById("bracket-display");
  if (!currentTournament) return;
  if (currentTournament.format === "double_elimination") {
    display.innerHTML = renderDoubleElim(currentMatches);
  } else {
    display.innerHTML = renderRoundRobin(currentMatches);
  }
  wireMatchCardEvents();
}

function teamName(id) {
  if (!id) return "TBD";
  return teamsById[id]?.name || "Unknown";
}

function roundLabel(bracket, round, maxRound) {
  if (bracket === "grand_final") return "Grand Final";
  if (bracket === "winners") return round === maxRound ? "Winners Final" : `Winners Round ${round}`;
  if (bracket === "losers") return round === maxRound ? "Losers Final" : `Losers Round ${round}`;
  return `Round ${round}`;
}

function matchCard(m) {
  const canReport = isAdmin && m.status !== "completed" && m.team_a_id && m.team_b_id;
  const aWon = m.winner_id && m.winner_id === m.team_a_id;
  const bWon = m.winner_id && m.winner_id === m.team_b_id;
  return `
    <div class="match-card" data-match-id="${m.id}">
      <div class="match-slot ${aWon ? "winner" : ""}">
        <span class="slot-name">${esc(teamName(m.team_a_id))}</span>
        <span class="slot-score">${m.status === "completed" ? m.team_a_score : ""}</span>
      </div>
      <div class="match-slot ${bWon ? "winner" : ""}">
        <span class="slot-name">${esc(teamName(m.team_b_id))}</span>
        <span class="slot-score">${m.status === "completed" ? m.team_b_score : ""}</span>
      </div>
      ${m.is_bye ? '<div class="match-meta">Bye</div>' : ""}
      ${canReport ? `<div class="match-meta"><button class="btn btn-sm report-btn" data-match-id="${m.id}">Report Result</button></div>` : ""}
      <div class="report-form-slot"></div>
    </div>`;
}

function renderDoubleElim(matches) {
  const sections = ["winners", "losers", "grand_final"];
  let html = `<div class="card"><div class="bracket-scroll">`;
  sections.forEach((bracket) => {
    const ms = matches.filter((m) => m.bracket === bracket);
    if (ms.length === 0) return;
    const maxRound = Math.max(...ms.map((m) => m.round));
    html += `<div class="bracket-section-title">${bracket === "winners" ? "Winners Bracket" : bracket === "losers" ? "Losers Bracket" : "Grand Final"}</div>`;
    html += `<div class="bracket-columns">`;
    for (let r = 1; r <= maxRound; r++) {
      const roundMatches = ms.filter((m) => m.round === r).sort((a, b) => a.match_number - b.match_number);
      if (roundMatches.length === 0) continue;
      html += `<div class="bracket-round"><div class="bracket-round-title">${roundLabel(bracket, r, maxRound)}</div>`;
      roundMatches.forEach((m) => (html += matchCard(m)));
      html += `</div>`;
    }
    html += `</div>`;
  });
  html += `</div></div>`;
  return html;
}

function renderRoundRobin(matches) {
  const groupNames = [...new Set(matches.map((m) => m.group_name))];
  let html = "";
  groupNames.forEach((gname) => {
    const groupMatches = matches.filter((m) => m.group_name === gname);
    const standings = computeGroupStandings(groupMatches);
    html += `<div class="card group-table-wrap">
      <h2 class="group-heading">${esc(gname)}</h2>
      <table>
        <thead><tr><th>#</th><th>Team</th><th class="text-right">W</th><th class="text-right">L</th><th class="text-right">Pts</th></tr></thead>
        <tbody>
          ${standings
            .map(
              (s, i) => `<tr><td>${i + 1}</td><td class="team-name">${esc(teamName(s.teamId))}</td><td class="text-right num win-badge">${s.wins}</td><td class="text-right num loss-badge">${s.losses}</td><td class="text-right num">${s.points}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

    const maxRound = Math.max(...groupMatches.map((m) => m.round));
    html += `<div class="card"><h3 class="card-title">${esc(gname)} - Matches</h3>`;
    for (let r = 1; r <= maxRound; r++) {
      const roundMatches = groupMatches.filter((m) => m.round === r).sort((a, b) => a.match_number - b.match_number);
      if (roundMatches.length === 0) continue;
      html += `<div class="bracket-round-title" style="text-align:left;margin-top:10px">Round ${r}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">`;
      roundMatches.forEach((m) => (html += matchCard(m)));
      html += `</div>`;
    }
    html += `</div>`;
  });
  return html;
}

function computeGroupStandings(groupMatches) {
  const table = {};
  groupMatches.forEach((m) => {
    [m.team_a_id, m.team_b_id].forEach((id) => {
      if (id && !table[id]) table[id] = { teamId: id, wins: 0, losses: 0, points: 0 };
    });
    if (m.status === "completed" && m.winner_id) {
      const loserId = m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id;
      table[m.winner_id].wins++;
      table[m.winner_id].points += 3;
      if (loserId) table[loserId].losses++;
    }
  });
  return Object.values(table).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function wireMatchCardEvents() {
  document.querySelectorAll(".report-btn").forEach((btn) => {
    btn.addEventListener("click", () => showReportForm(btn.dataset.matchId));
  });
}

function showReportForm(matchId) {
  const match = currentMatches.find((m) => m.id === matchId);
  const card = document.querySelector(`.match-card[data-match-id="${matchId}"] .report-form-slot`);
  card.innerHTML = `
    <div style="padding:10px;border-top:1px solid var(--border)">
      <div class="field-row">
        <div class="field">
          <label>${esc(teamName(match.team_a_id))} score</label>
          <input type="number" min="0" id="score-a-${matchId}" value="0" />
        </div>
        <div class="field">
          <label>${esc(teamName(match.team_b_id))} score</label>
          <input type="number" min="0" id="score-b-${matchId}" value="0" />
        </div>
      </div>
      <div class="field">
        <label>Winner</label>
        <select id="winner-${matchId}">
          <option value="${match.team_a_id}">${esc(teamName(match.team_a_id))}</option>
          <option value="${match.team_b_id}">${esc(teamName(match.team_b_id))}</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" id="confirm-report-${matchId}">Confirm</button>
      <div class="form-msg" id="report-msg-${matchId}"></div>
    </div>`;
  document.getElementById(`confirm-report-${matchId}`).addEventListener("click", () => submitReport(matchId));
}

async function submitReport(matchId) {
  const msg = document.getElementById(`report-msg-${matchId}`);
  msg.textContent = "Saving...";
  msg.className = "form-msg";

  const scoreA = Number(document.getElementById(`score-a-${matchId}`).value) || 0;
  const scoreB = Number(document.getElementById(`score-b-${matchId}`).value) || 0;
  const winnerId = document.getElementById(`winner-${matchId}`).value;

  const matchesById = Object.fromEntries(currentMatches.map((m) => [m.id, m]));
  const target = matchesById[matchId];
  target.team_a_score = scoreA;
  target.team_b_score = scoreB;

  const touched = advanceMatch(target, winnerId, matchesById);

  try {
    for (const m of touched) {
      const { error } = await supabase
        .from("bracket_matches")
        .update({
          team_a_id: m.team_a_id,
          team_b_id: m.team_b_id,
          winner_id: m.winner_id,
          status: m.status,
          team_a_score: m.team_a_score,
          team_b_score: m.team_b_score,
        })
        .eq("id", m.id);
      if (error) throw error;
    }
    await loadAndRenderTournament(currentTournament.id);
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.className = "form-msg error";
  }
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
