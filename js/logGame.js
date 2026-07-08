import { supabase } from "./supabaseClient.js";
import { renderNav } from "./nav.js";
import { requireAdmin } from "./auth.js";

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
let players = [];
let bracketMatches = [];
let tournaments = [];
let scheduledGames = [];
let winnerSide = null; // 'a' | 'b'

async function init() {
  const [{ data: teamData }, { data: playerData }, { data: bmData }, { data: tData }, { data: sgData }] = await Promise.all([
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("players").select("id, name, role, team_id").order("name"),
    supabase.from("bracket_matches").select("id, tournament_id, bracket, group_name, round, match_number, team_a_id, team_b_id, status").in("status", ["pending", "in_progress"]),
    supabase.from("tournaments").select("id, name"),
    supabase.from("scheduled_games").select("id, team_a_id, team_b_id, scheduled_at").eq("status", "scheduled").order("scheduled_at", { ascending: true }),
  ]);

  teams = teamData || [];
  players = playerData || [];
  bracketMatches = bmData || [];
  tournaments = tData || [];
  scheduledGames = sgData || [];

  const teamAOptions = ['<option value="">Select team...</option>']
    .concat(teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`))
    .join("");
  document.getElementById("team-a").innerHTML = teamAOptions;
  document.getElementById("team-b").innerHTML = teamAOptions;

  const sgSelect = document.getElementById("scheduled-game");
  const sgOptions = ['<option value="">None - pick teams manually below</option>']
    .concat(
      scheduledGames.map((sg) => {
        const aName = teams.find((t) => t.id === sg.team_a_id)?.name || "TBD";
        const bName = teams.find((t) => t.id === sg.team_b_id)?.name || "TBD";
        const when = new Date(sg.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return `<option value="${sg.id}">${esc(when)} - ${esc(aName)} vs ${esc(bName)}</option>`;
      })
    )
    .join("");
  sgSelect.innerHTML = sgOptions;
  sgSelect.addEventListener("change", onScheduledGameChanged);

  const bmSelect = document.getElementById("bracket-match");
  const bmOptions = ['<option value="">None - regular season / friendly</option>']
    .concat(
      bracketMatches.map((m) => {
        const tName = tournaments.find((t) => t.id === m.tournament_id)?.name || "Tournament";
        const aName = teams.find((t) => t.id === m.team_a_id)?.name || "TBD";
        const bName = teams.find((t) => t.id === m.team_b_id)?.name || "TBD";
        const label = `${tName} - ${bracketLabel(m)}: ${aName} vs ${bName}`;
        return `<option value="${m.id}">${esc(label)}</option>`;
      })
    )
    .join("");
  bmSelect.innerHTML = bmOptions;

  document.getElementById("team-a").addEventListener("change", onTeamsChanged);
  document.getElementById("team-b").addEventListener("change", onTeamsChanged);
}

function onScheduledGameChanged() {
  const sgId = document.getElementById("scheduled-game").value;
  if (!sgId) return;
  const sg = scheduledGames.find((s) => s.id === sgId);
  if (!sg) return;
  document.getElementById("team-a").value = sg.team_a_id;
  document.getElementById("team-b").value = sg.team_b_id;
  onTeamsChanged();
}

function bracketLabel(m) {
  if (m.bracket === "group") return `${m.group_name || "Group"} R${m.round}`;
  const names = { winners: "Winners", losers: "Losers", grand_final: "Grand Final" };
  return `${names[m.bracket] || m.bracket} R${m.round} M${m.match_number}`;
}

function onTeamsChanged() {
  const aId = document.getElementById("team-a").value;
  const bId = document.getElementById("team-b").value;
  winnerSide = null;

  const picker = document.getElementById("winner-picker");
  const aTeam = teams.find((t) => t.id === aId);
  const bTeam = teams.find((t) => t.id === bId);

  if (!aId || !bId) {
    picker.innerHTML = `
      <button type="button" class="btn" disabled>Select Team A first</button>
      <button type="button" class="btn" disabled>Select Team B first</button>`;
    document.getElementById("rosters-card").style.display = "none";
    document.getElementById("submit-btn").disabled = true;
    return;
  }

  if (aId === bId) {
    picker.innerHTML = `<div class="form-msg error">Team A and Team B must be different.</div>`;
    document.getElementById("rosters-card").style.display = "none";
    document.getElementById("submit-btn").disabled = true;
    return;
  }

  picker.innerHTML = `
    <button type="button" class="btn" data-side="a">${esc(aTeam.name)} won</button>
    <button type="button" class="btn" data-side="b">${esc(bTeam.name)} won</button>`;
  picker.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      winnerSide = btn.dataset.side;
      picker.querySelectorAll("button").forEach((b) => b.classList.toggle("btn-primary", b.dataset.side === winnerSide));
      updateSubmitState();
    });
  });

  renderRosters(aTeam, bTeam);
  document.getElementById("rosters-card").style.display = "block";
  updateSubmitState();
}

function renderRosters(aTeam, bTeam) {
  const container = document.getElementById("rosters-container");
  container.innerHTML = [aTeam, bTeam]
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

function updateSubmitState() {
  document.getElementById("submit-btn").disabled = !winnerSide;
}

document.getElementById("submit-btn").addEventListener("click", async () => {
  const msg = document.getElementById("submit-msg");
  const aId = document.getElementById("team-a").value;
  const bId = document.getElementById("team-b").value;
  const winnerId = winnerSide === "a" ? aId : bId;
  const duration = document.getElementById("duration").value || null;
  const notes = document.getElementById("notes").value || null;
  const bracketMatchId = document.getElementById("bracket-match").value || null;
  const scheduledGameId = document.getElementById("scheduled-game").value || null;

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
        bracket_match_id: bracketMatchId,
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

    if (scheduledGameId) {
      const { error: sgError } = await supabase
        .from("scheduled_games")
        .update({ status: "completed", game_id: game.id })
        .eq("id", scheduledGameId);
      if (sgError) {
        // The game itself saved fine - don't fail the whole submit over this,
        // just let the admin know the calendar entry needs manual cleanup.
        msg.textContent = "Game saved, but couldn't mark the scheduled game as completed: " + sgError.message;
        msg.className = "form-msg error";
        document.getElementById("submit-btn").disabled = false;
        return;
      }
      scheduledGames = scheduledGames.filter((s) => s.id !== scheduledGameId);
      document.getElementById("scheduled-game").innerHTML = ['<option value="">None - pick teams manually below</option>']
        .concat(
          scheduledGames.map((sg) => {
            const aName = teams.find((t) => t.id === sg.team_a_id)?.name || "TBD";
            const bName = teams.find((t) => t.id === sg.team_b_id)?.name || "TBD";
            const when = new Date(sg.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
            return `<option value="${sg.id}">${esc(when)} - ${esc(aName)} vs ${esc(bName)}</option>`;
          })
        )
        .join("");
    }

    msg.textContent = "Game saved! Standings and player stats have been updated.";
    msg.className = "form-msg success";
    document.getElementById("team-a").value = "";
    document.getElementById("team-b").value = "";
    document.getElementById("duration").value = "";
    document.getElementById("notes").value = "";
    document.getElementById("bracket-match").value = "";
    document.getElementById("scheduled-game").value = "";
    onTeamsChanged();
  } catch (err) {
    msg.textContent = "Error saving game: " + err.message;
    msg.className = "form-msg error";
    document.getElementById("submit-btn").disabled = false;
  }
});

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

if (session) init();
