// Shared roster/stats/champion-pick/ban rendering + collection helpers used
// by both Log Game (logging a brand new game) and Edit Game (correcting an
// already-logged one), so the two forms stay in sync and don't duplicate
// this markup/logic.

export const STAT_FIELDS = [
  { key: "kills", label: "K" },
  { key: "deaths", label: "D" },
  { key: "assists", label: "A" },
  { key: "cs", label: "CS" },
  { key: "gold", label: "Gold" },
  { key: "damage", label: "Damage" },
  { key: "towers", label: "Towers" },
  { key: "epic_monsters", label: "Epic Mon." },
];

export function champOptionsHtml(champions, selectedId) {
  return ['<option value="">No pick</option>']
    .concat(champions.map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${esc(c.name)}</option>`))
    .join("");
}

// existingByPlayerId: { [player_id]: { champion_id, kills, deaths, ... } } -
// pass rows already logged for a player to pre-fill the form (edit mode);
// omit/leave empty for a blank "log a new game" form.
export function renderRosters(container, teamsList, playersList, champions, existingByPlayerId = {}) {
  container.innerHTML = teamsList
    .filter(Boolean)
    .map((team) => {
      const roster = playersList.filter((p) => p.team_id === team.id);
      if (roster.length === 0) {
        return `<h3 class="roster-team-heading">${esc(team.name)}</h3><p class="text-muted">No players found on this team yet. Add players on the <a href="manage.html">Manage</a> tab first.</p>`;
      }
      const rows = roster
        .map((p) => {
          const existing = existingByPlayerId[p.id];
          const played = !!existing;
          return `
        <tr data-player-id="${p.id}" data-team-id="${team.id}">
          <td><input type="checkbox" class="played-check" ${played ? "checked" : ""} /></td>
          <td>${esc(p.name)}<div class="text-muted" style="font-size:0.75rem">${esc(p.role || "")}</div></td>
          <td><select class="champion-select" ${played ? "" : "disabled"}>${champOptionsHtml(champions, existing?.champion_id ?? null)}</select></td>
          ${STAT_FIELDS.map(
            (f) => `<td><input type="number" min="0" class="stat-input" data-field="${f.key}" value="${existing ? existing[f.key] ?? 0 : 0}" ${played ? "" : "disabled"} /></td>`
          ).join("")}
        </tr>`;
        })
        .join("");
      return `
        <h3 class="roster-team-heading">${esc(team.name)}</h3>
        <table class="roster-table">
          <thead><tr><th>Played</th><th>Player</th><th>Champion</th>${STAT_FIELDS.map((f) => `<th>${f.label}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join("");

  container.querySelectorAll(".played-check").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const row = e.target.closest("tr");
      row.querySelectorAll(".stat-input, .champion-select").forEach((inp) => (inp.disabled = !cb.checked));
    });
  });
}

// Reads back every checked ("played") row into a game_player_stats-shaped
// object (minus game_id, which the caller adds after inserting the game).
export function collectRosterRows(container, winnerTeamId) {
  const playedRows = [...container.querySelectorAll("tr[data-player-id]")].filter((row) => row.querySelector(".played-check").checked);
  return playedRows.map((row) => {
    const playerId = row.dataset.playerId;
    const teamId = row.dataset.teamId;
    const championId = row.querySelector(".champion-select").value || null;
    const stats = { player_id: playerId, team_id: teamId, champion_id: championId, win: teamId === winnerTeamId };
    STAT_FIELDS.forEach((f) => {
      stats[f.key] = Number(row.querySelector(`[data-field="${f.key}"]`).value) || 0;
    });
    return stats;
  });
}

// Renders one team's dynamic ban list (add/remove rows, each a champion
// select) into `container`. existingBans: array of { champion_id }.
export function renderBans(container, teamName, champions, existingBans = []) {
  container.innerHTML = `
    <h4 style="margin:0 0 6px;font-size:0.9rem">${esc(teamName)} bans</h4>
    <div class="ban-rows"></div>
    <button type="button" class="btn btn-sm btn-ghost" data-add-ban>+ Add Ban</button>`;
  const rowsContainer = container.querySelector(".ban-rows");

  function addRow(championId) {
    const row = document.createElement("div");
    row.className = "field-row ban-row";
    row.style.marginBottom = "6px";
    row.innerHTML = `
      <select class="ban-champion-select">${champOptionsHtml(champions, championId)}</select>
      <button type="button" class="btn btn-sm btn-ghost" data-remove-ban>Remove</button>`;
    row.querySelector("[data-remove-ban]").addEventListener("click", () => row.remove());
    rowsContainer.appendChild(row);
  }

  existingBans.forEach((b) => addRow(b.champion_id));
  container.querySelector("[data-add-ban]").addEventListener("click", () => addRow(null));
}

// Reads back every non-empty ban select in `container` into a
// game_bans-shaped object (minus game_id, which the caller adds).
export function collectBans(container, teamId) {
  return [...container.querySelectorAll(".ban-champion-select")]
    .map((sel) => sel.value)
    .filter(Boolean)
    .map((championId) => ({ team_id: teamId, champion_id: championId }));
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
