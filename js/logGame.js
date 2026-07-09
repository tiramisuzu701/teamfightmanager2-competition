import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { requireAdmin } from "./auth.js";
import { postToDiscord } from "./discord.js";

renderNav("log-game.html");
const session = await requireAdmin();
// If there's no session, requireAdmin() has already redirected to
// login.html - the guards below just stop this page's logic from doing
// any unnecessary work while that navigation completes.

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

let teams = [];
let teamsById = {};
let players = [];
let bracketMatches = [];
let tournaments = [];
let existingMatches = [];
let winnerSide = null; // 'a' | 'b' - winner of the CURRENT game being logged

let activeMatch = null; // the match currently being logged into
let activeMatchGames = []; // games already logged for activeMatch, in order

async function init() {
  const [{ data: teamData }, { data: playerData }, { data: bmData }, { data: tData }] = await Promise.all([
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("players").select("id, name, role, team_id").order("name"),
    supabase.from("bracket_matches").select("id, tournament_id, bracket, group_name, round, match_number, team_a_id, team_b_id, status").in("status", ["pending", "in_progress"]),
    supabase.from("tournaments").select("id, name"),
  ]);

  teams = teamData || [];
  teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  players = playerData || [];
  bracketMatches = bmData || [];
  tournaments = tData || [];

  const teamOptions = ['<option value="">Select team...</option>']
    .concat(teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`))
    .join("");
  document.getElementById("new-team-a").innerHTML = teamOptions;
  document.getElementById("new-team-b").innerHTML = teamOptions;

  const bmSelect = document.getElementById("new-bracket-match");
  const bmOptions = ['<option value="">None - regular season / friendly</option>']
    .concat(
      bracketMatches.map((m) => {
        const tName = tournaments.find((t) => t.id === m.tournament_id)?.name || "Tournament";
        const aName = teamsById[m.team_a_id]?.name || "TBD";
        const bName = teamsById[m.team_b_id]?.name || "TBD";
        const label = `${tName} - ${bracketLabel(m)}: ${aName} vs ${bName}`;
        return `<option value="${m.id}">${esc(label)}</option>`;
      })
    )
    .join("");
  bmSelect.innerHTML = bmOptions;

  document.getElementById("existing-match").addEventListener("change", onExistingMatchChanged);
  document.getElementById("start-match-btn").addEventListener("click", startMatch);
  document.getElementById("end-early-btn").addEventListener("click", showEndEarlyPicker);
  document.getElementById("cancel-match-btn").addEventListener("click", cancelMatch);
  document.getElementById("switch-match-btn").addEventListener("click", () => showPicker(true));

  await loadExistingMatches();
}

async function loadExistingMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, best_of, status, team_a_wins, team_b_wins, scheduled_at")
    .in("status", ["scheduled", "in_progress"])
    .order("created_at", { ascending: true });

  existingMatches = error ? [] : data || [];
  const select = document.getElementById("existing-match");
  select.innerHTML = ['<option value="">None - start a new match below</option>']
    .concat(
      existingMatches.map((m) => {
        const aName = teamsById[m.team_a_id]?.name || "TBD";
        const bName = teamsById[m.team_b_id]?.name || "TBD";
        const when = m.scheduled_at
          ? new Date(m.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : "Unscheduled";
        const score = m.status === "in_progress" ? ` (${m.team_a_wins}-${m.team_b_wins} so far)` : "";
        return `<option value="${m.id}">${esc(when)} - ${esc(aName)} vs ${esc(bName)} - Bo${m.best_of}${score}</option>`;
      })
    )
    .join("");
}

function bracketLabel(m) {
  if (m.bracket === "group") return `${m.group_name || "Group"} R${m.round}`;
  const names = { winners: "Winners", losers: "Losers", grand_final: "Grand Final" };
  return `${names[m.bracket] || m.bracket} R${m.round} M${m.match_number}`;
}

async function onExistingMatchChanged() {
  const id = document.getElementById("existing-match").value;
  if (!id) return;
  const match = existingMatches.find((m) => m.id === id);
  if (!match) return;

  const { data: games } = await supabase
    .from("games")
    .select("id, game_number, winner_id, duration_minutes")
    .eq("match_id", id)
    .order("game_number", { ascending: true });

  activeMatch = { ...match };
  activeMatchGames = games || [];
  enterMatchMode();
}

async function startMatch() {
  const msg = document.getElementById("match-picker-msg");
  const aId = document.getElementById("new-team-a").value;
  const bId = document.getElementById("new-team-b").value;
  const bestOf = Number(document.getElementById("new-best-of").value);
  const bracketMatchId = document.getElementById("new-bracket-match").value || null;
  const notes = document.getElementById("new-notes").value || null;

  if (!aId || !bId || aId === bId) {
    msg.textContent = "Pick two different teams.";
    msg.className = "form-msg error";
    return;
  }

  msg.textContent = "Starting match...";
  msg.className = "form-msg";

  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      team_a_id: aId,
      team_b_id: bId,
      best_of: bestOf,
      status: "in_progress",
      bracket_match_id: bracketMatchId,
      notes,
    })
    .select()
    .single();

  if (error) {
    msg.textContent = "Error starting match: " + error.message;
    msg.className = "form-msg error";
    return;
  }

  msg.textContent = "";
  activeMatch = match;
  activeMatchGames = [];
  enterMatchMode();
}

function enterMatchMode() {
  document.getElementById("new-team-a").value = "";
  document.getElementById("new-team-b").value = "";
  document.getElementById("new-bracket-match").value = "";
  document.getElementById("new-notes").value = "";
  document.getElementById("existing-match").value = "";
  document.getElementById("match-picker-msg").textContent = "";
  document.getElementById("end-early-btn").style.display = "";
  showPicker(false);
  renderMatchProgress();
  prepareGameForm();
}

function showPicker(show) {
  document.getElementById("match-picker-card").style.display = show ? "block" : "none";
  document.getElementById("match-progress-card").style.display = show ? "none" : "block";
  document.getElementById("game-form-card").style.display = show ? "none" : "block";
  if (show) {
    activeMatch = null;
    activeMatchGames = [];
    loadExistingMatches();
  }
}

function renderMatchProgress() {
  const aTeam = teamsById[activeMatch.team_a_id];
  const bTeam = teamsById[activeMatch.team_b_id];
  const majority = Math.ceil(activeMatch.best_of / 2);

  document.getElementById("match-progress-title").textContent = `${aTeam?.name || "Team A"} vs ${bTeam?.name || "Team B"} - Best of ${activeMatch.best_of}`;

  const summary = document.getElementById("match-progress-summary");
  summary.innerHTML = `
    <p style="margin:0 0 8px">Score: <strong>${activeMatch.team_a_wins ?? 0}-${activeMatch.team_b_wins ?? 0}</strong>
      <span class="text-muted" style="font-size:0.82rem">(first to ${majority} wins the set)</span></p>`;

  const log = document.getElementById("match-games-log");
  if (activeMatchGames.length === 0) {
    log.innerHTML = `<p class="text-muted" style="font-size:0.85rem">No games logged yet for this match.</p>`;
  } else {
    log.innerHTML = `
      <table class="roster-table">
        <thead><tr><th>Game</th><th>Winner</th><th>Duration</th></tr></thead>
        <tbody>
          ${activeMatchGames
            .map((g) => `<tr><td>${g.game_number}</td><td>${esc(teamsById[g.winner_id]?.name || "-")}</td><td>${g.duration_minutes ?? "-"}</td></tr>`)
            .join("")}
        </tbody>
      </table>`;
  }
}

function prepareGameForm() {
  const aTeam = teamsById[activeMatch.team_a_id];
  const bTeam = teamsById[activeMatch.team_b_id];
  const nextNumber = activeMatchGames.length + 1;

  document.getElementById("game-form-title").textContent = `2. Log Game ${nextNumber}`;
  document.getElementById("duration").value = "";
  document.getElementById("notes").value = "";
  document.getElementById("submit-msg").textContent = "";
  document.getElementById("submit-msg").className = "form-msg";
  winnerSide = null;

  const picker = document.getElementById("winner-picker");
  picker.innerHTML = `
    <button type="button" class="btn" data-side="a">${esc(aTeam?.name || "Team A")} won</button>
    <button type="button" class="btn" data-side="b">${esc(bTeam?.name || "Team B")} won</button>`;
  picker.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      winnerSide = btn.dataset.side;
      picker.querySelectorAll("button").forEach((b) => b.classList.toggle("btn-primary", b.dataset.side === winnerSide));
      document.getElementById("submit-btn").disabled = false;
    });
  });

  renderRosters(aTeam, bTeam);
  document.getElementById("submit-btn").disabled = true;
}

function renderRosters(aTeam, bTeam) {
  const container = document.getElementById("rosters-container");
  container.innerHTML = [aTeam, bTeam]
    .filter(Boolean)
    .map((team) => {
      const roster = players.filter((p) => p.team_id === team.id);
      if (roster.length === 0) {
        return `<h3 class="roster-team-heading">${esc(team.name)}</h3><p class="text-muted">No players found on this team yet. Add players on the <a href="manage.html">Manage</a> tab first.</p>`;
      }
      const rows = roster
        .map(
          (p) => `
        <tr data-player-id="${p.id}" data-team-id="${team.id}">
          <td><input type="checkbox" class="played-check" /></td>
          <td>${esc(p.name)}<div class="text-muted" style="font-size:0.75rem">${esc(p.role || "")}</div></td>
          ${STAT_FIELDS.map((f) => `<td><input type="number" min="0" class="stat-input" data-field="${f.key}" value="0" disabled /></td>`).join("")}
        </tr>`
        )
        .join("");
      return `
        <h3 class="roster-team-heading">${esc(team.name)}</h3>
        <table class="roster-table">
          <thead><tr><th>Played</th><th>Player</th>${STAT_FIELDS.map((f) => `<th>${f.label}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join("");

  container.querySelectorAll(".played-check").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const row = e.target.closest("tr");
      row.querySelectorAll(".stat-input").forEach((inp) => (inp.disabled = !cb.checked));
    });
  });
}

document.getElementById("submit-btn").addEventListener("click", async () => {
  const msg = document.getElementById("submit-msg");
  const aId = activeMatch.team_a_id;
  const bId = activeMatch.team_b_id;
  const winnerId = winnerSide === "a" ? aId : bId;
  const duration = document.getElementById("duration").value || null;
  const notes = document.getElementById("notes").value || null;
  const gameNumber = activeMatchGames.length + 1;

  const playedRows = [...document.querySelectorAll("#rosters-container tr[data-player-id]")].filter(
    (row) => row.querySelector(".played-check").checked
  );

  msg.textContent = "Saving...";
  msg.className = "form-msg";
  document.getElementById("submit-btn").disabled = true;

  try {
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        team_a_id: aId,
        team_b_id: bId,
        winner_id: winnerId,
        duration_minutes: duration,
        notes,
        match_id: activeMatch.id,
        game_number: gameNumber,
        bracket_match_id: activeMatch.bracket_match_id || null,
      })
      .select()
      .single();
    if (gameError) throw gameError;

    if (playedRows.length > 0) {
      const statRows = playedRows.map((row) => {
        const playerId = row.dataset.playerId;
        const teamId = row.dataset.teamId;
        const stats = { player_id: playerId, team_id: teamId, game_id: game.id, win: teamId === winnerId };
        STAT_FIELDS.forEach((f) => {
          stats[f.key] = Number(row.querySelector(`[data-field="${f.key}"]`).value) || 0;
        });
        return stats;
      });
      const { error: statsError } = await supabase.from("game_player_stats").insert(statRows);
      if (statsError) throw statsError;
    }

    activeMatchGames.push({ id: game.id, game_number: gameNumber, winner_id: winnerId, duration_minutes: duration });

    const aWins = activeMatchGames.filter((g) => g.winner_id === aId).length;
    const bWins = activeMatchGames.filter((g) => g.winner_id === bId).length;
    const majority = Math.ceil(activeMatch.best_of / 2);
    const decided = aWins >= majority || bWins >= majority;

    const matchUpdate = { team_a_wins: aWins, team_b_wins: bWins };
    if (decided) {
      matchUpdate.status = "completed";
      matchUpdate.winner_id = aWins >= majority ? aId : bId;
      matchUpdate.completed_at = new Date().toISOString();
    } else {
      matchUpdate.status = "in_progress";
    }

    const { error: matchError } = await supabase.from("matches").update(matchUpdate).eq("id", activeMatch.id);
    if (matchError) {
      msg.textContent = "Game saved, but the match record couldn't be updated: " + matchError.message;
      msg.className = "form-msg error";
      document.getElementById("submit-btn").disabled = false;
      return;
    }
    Object.assign(activeMatch, matchUpdate);

    if (decided) {
      const aName = teamsById[aId]?.name || "Team A";
      const bName = teamsById[bId]?.name || "Team B";
      const winnerName = teamsById[activeMatch.winner_id]?.name || "Unknown";
      postToDiscord(`🏆 **${winnerName}** wins the set **${aName} ${aWins}-${bWins} ${bName}** (Bo${activeMatch.best_of})`);

      renderMatchProgress();
      document.getElementById("game-form-card").style.display = "none";
      const summary = document.getElementById("match-progress-summary");
      summary.innerHTML += `<p class="form-msg success" style="margin-top:8px">Match complete! Standings have been updated. <a href="match.html?id=${activeMatch.id}">View match</a></p>`;
      document.getElementById("end-early-btn").style.display = "none";
    } else {
      renderMatchProgress();
      prepareGameForm();
      msg.textContent = "Game saved! Log the next game when it's played.";
      msg.className = "form-msg success";
    }
  } catch (err) {
    msg.textContent = "Error saving game: " + err.message;
    msg.className = "form-msg error";
    document.getElementById("submit-btn").disabled = false;
  }
});

function showEndEarlyPicker() {
  const aTeam = teamsById[activeMatch.team_a_id];
  const bTeam = teamsById[activeMatch.team_b_id];
  const btn = document.getElementById("end-early-btn");
  const wrap = document.createElement("div");
  wrap.className = "field-row";
  wrap.style.marginTop = "8px";
  wrap.innerHTML = `
    <span class="text-muted" style="font-size:0.85rem">Which team wins the set?</span>
    <button type="button" class="btn btn-sm" data-side="a">${esc(aTeam?.name || "Team A")}</button>
    <button type="button" class="btn btn-sm" data-side="b">${esc(bTeam?.name || "Team B")}</button>
    <button type="button" class="btn btn-ghost btn-sm" data-side="cancel">Never mind</button>`;
  btn.after(wrap);
  btn.style.display = "none";

  wrap.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", async () => {
      wrap.remove();
      btn.style.display = "inline-flex";
      if (b.dataset.side === "cancel") return;
      const winnerId = b.dataset.side === "a" ? activeMatch.team_a_id : activeMatch.team_b_id;
      await endMatchEarly(winnerId);
    });
  });
}

async function endMatchEarly(winnerId) {
  const { error } = await supabase
    .from("matches")
    .update({ status: "completed", winner_id: winnerId, ended_early: true, completed_at: new Date().toISOString() })
    .eq("id", activeMatch.id);
  if (error) {
    alert("Error ending match: " + error.message);
    return;
  }
  activeMatch.status = "completed";
  activeMatch.winner_id = winnerId;
  activeMatch.ended_early = true;

  const winnerName = teamsById[winnerId]?.name || "Unknown";
  postToDiscord(`🏆 **${winnerName}** wins the set **${activeMatch.team_a_wins ?? 0}-${activeMatch.team_b_wins ?? 0}** (ended early, Bo${activeMatch.best_of})`);

  renderMatchProgress();
  document.getElementById("game-form-card").style.display = "none";
  const summary = document.getElementById("match-progress-summary");
  summary.innerHTML += `<p class="form-msg success" style="margin-top:8px">Match ended early. Standings have been updated. <a href="match.html?id=${activeMatch.id}">View match</a></p>`;
  document.getElementById("end-early-btn").style.display = "none";
}

async function cancelMatch() {
  const ok = window.confirm("Cancel this match? Any games already logged for it will stay in the log, but it will no longer count toward standings.");
  if (!ok) return;
  const { error } = await supabase.from("matches").update({ status: "cancelled" }).eq("id", activeMatch.id);
  if (error) {
    alert("Error: " + error.message);
    return;
  }
  showPicker(true);
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

if (session) init();
