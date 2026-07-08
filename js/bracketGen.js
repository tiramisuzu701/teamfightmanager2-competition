// ============================================================================
// Bracket generation algorithms - pure functions, no network/DOM calls.
//
// Given an ordered list of team IDs (seed order, best team first), returns
// an array of "match" objects ready to be inserted into bracket_matches.
// Each match already has its final `id` assigned (crypto.randomUUID()) so
// that next_match_id / loser_next_match_id can reference each other before
// any database round-trip.
//
// IMPORTANT distinction used throughout: `is_bye` means "this match will
// structurally only ever have one real team - no opponent will ever arrive"
// (from seed padding, or a cascade of padding). It is NOT the same as "we
// don't know this match's second team yet because an earlier real match
// hasn't been played" - that second case must stay status='pending' with a
// null slot until the real feeding match is reported, at which point
// advanceMatch() below fills it in.
// ============================================================================

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

// Standard "1 vs N" seeding order: ensures seed 1 and seed 2 can only meet
// in the final, seed 1/2 and 3/4 only meet in the semis, etc.
function seedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const nextSize = seeds.length * 2;
    const newSeeds = [];
    for (const s of seeds) newSeeds.push(s, nextSize + 1 - s);
    seeds = newSeeds;
  }
  return seeds;
}

function newMatch({ tournamentId, bracket, groupName = null, round, matchNumber }) {
  return {
    id: crypto.randomUUID(),
    tournament_id: tournamentId,
    bracket,
    group_name: groupName,
    round,
    match_number: matchNumber,
    team_a_id: null,
    team_b_id: null,
    winner_id: null,
    team_a_score: 0,
    team_b_score: 0,
    next_match_id: null,
    next_match_slot: null,
    loser_next_match_id: null,
    loser_next_match_slot: null,
    is_bye: false,
    status: "pending",
  };
}

function placeInSlot(match, slot, teamId) {
  if (slot === "a") match.team_a_id = teamId;
  else match.team_b_id = teamId;
}

/**
 * Runtime + generation-time settlement: if `match` is a structural bye and
 * its one real slot is now known, mark it completed and push its winner
 * (and, for non-bye real matches, the loser too) onward - recursively
 * cascading through any further bye-through matches. Returns the list of
 * matches that were mutated, so callers can persist the changes.
 */
function settleCascade(match, matchesById, touched = []) {
  if (!match || match.status === "completed") return touched;
  if (!match.is_bye) return touched;
  const knownTeam = match.team_a_id || match.team_b_id;
  if (!knownTeam) return touched; // still waiting on the real feeding match
  match.winner_id = knownTeam;
  match.status = "completed";
  touched.push(match);
  if (match.next_match_id) {
    const next = matchesById[match.next_match_id];
    if (next) {
      placeInSlot(next, match.next_match_slot, knownTeam);
      if (!touched.includes(next)) touched.push(next);
      settleCascade(next, matchesById, touched);
    }
  }
  return touched;
}

/**
 * Call this whenever an admin reports the real result of a match (winner_id
 * + scores already applied to `match` by the caller). Propagates the winner
 * into next_match_id and the loser into loser_next_match_id, cascading
 * through any bye-through matches those land on. Returns every match object
 * that was changed (including `match` itself) so the caller can persist them.
 */
export function advanceMatch(match, winnerId, matchesById) {
  const loserId = match.team_a_id === winnerId ? match.team_b_id : match.team_a_id;
  match.winner_id = winnerId;
  match.status = "completed";
  const touched = [match];

  if (match.next_match_id) {
    const next = matchesById[match.next_match_id];
    if (next) {
      placeInSlot(next, match.next_match_slot, winnerId);
      if (!touched.includes(next)) touched.push(next);
      settleCascade(next, matchesById, touched);
    }
  }
  if (match.loser_next_match_id && loserId) {
    const loserNext = matchesById[match.loser_next_match_id];
    if (loserNext) {
      placeInSlot(loserNext, match.loser_next_match_slot, loserId);
      if (!touched.includes(loserNext)) touched.push(loserNext);
      settleCascade(loserNext, matchesById, touched);
    }
  }
  return touched;
}

/**
 * Generates a full double-elimination bracket (winners bracket, losers
 * bracket, grand final). Supports any team count >= 2 by padding to the
 * next power of two with byes, which auto-advance in round 1 (and cascade
 * further if needed - e.g. a losers-bracket match with no real entrants).
 */
export function generateDoubleElimination(tournamentId, teamIds) {
  const n = teamIds.length;
  if (n < 2) throw new Error("Need at least 2 teams for a double elimination bracket.");
  const P = nextPowerOfTwo(n);
  const k = Math.log2(P);
  const order = seedOrder(P);
  const bySeed = order.map((seed) => (seed <= n ? teamIds[seed - 1] : null));

  const allMatches = [];
  const matchesById = {};
  const addMatch = (m) => {
    allMatches.push(m);
    matchesById[m.id] = m;
    return m;
  };

  // ---- Winners bracket, round 1 (the only round where structural byes
  // can occur - see README/derivation notes in bracketGen tests) ----
  const wbRounds = [];
  const round1 = [];
  for (let i = 0; i < bySeed.length; i += 2) {
    const m = addMatch(newMatch({ tournamentId, bracket: "winners", round: 1, matchNumber: i / 2 + 1 }));
    const a = bySeed[i];
    const b = bySeed[i + 1];
    placeInSlot(m, "a", a);
    placeInSlot(m, "b", b);
    if (!!a !== !!b) {
      // exactly one real team - permanent structural bye
      m.is_bye = true;
      m.winner_id = a || b;
      m.status = "completed";
    }
    round1.push(m);
  }
  wbRounds.push(round1);

  // ---- Winners bracket, rounds 2..k. NEVER structural byes here: every
  // round-1 match (bye or not) eventually yields exactly one real winner,
  // so every round-2+ slot will always be filled eventually - just maybe
  // not yet. Leave unresolved slots null; advanceMatch() fills them later.
  for (let r = 1; r < k; r++) {
    const prevRound = wbRounds[r - 1];
    const roundMatches = [];
    for (let i = 0; i < prevRound.length; i += 2) {
      const m = addMatch(newMatch({ tournamentId, bracket: "winners", round: r + 1, matchNumber: i / 2 + 1 }));
      roundMatches.push(m);
    }
    prevRound.forEach((prevMatch, i) => {
      const nextMatch = roundMatches[Math.floor(i / 2)];
      prevMatch.next_match_id = nextMatch.id;
      prevMatch.next_match_slot = i % 2 === 0 ? "a" : "b";
      if (prevMatch.winner_id) placeInSlot(nextMatch, prevMatch.next_match_slot, prevMatch.winner_id);
    });
    wbRounds.push(roundMatches);
  }
  const wbFinal = wbRounds[k - 1][0];

  // ---- Grand Final ----
  const grandFinal = addMatch(newMatch({ tournamentId, bracket: "grand_final", round: 1, matchNumber: 1 }));
  wbFinal.next_match_id = grandFinal.id;
  wbFinal.next_match_slot = "a";
  if (wbFinal.winner_id) placeInSlot(grandFinal, "a", wbFinal.winner_id);

  if (k === 1) {
    // Only two teams: there are no losers-bracket games at all - the loser
    // of the single winners-bracket match waits directly for the grand final.
    wbFinal.loser_next_match_id = grandFinal.id;
    wbFinal.loser_next_match_slot = "b";
    return allMatches;
  }

  // ---- Losers bracket ----
  // `frontier` represents, in bracket order, either:
  //   - null: a permanently empty branch (both structural feeds were byes)
  //   - { fromMatch, isLoser }: a real match exists here; `isLoser` says
  //     whether we take its *loser* (feed is a WB match) or its *winner*
  //     (feed is a previous LB match) once it resolves.
  let frontier = wbRounds[0].map((m) => (m.is_bye ? null : { fromMatch: m, isLoser: true }));
  let lbRoundNum = 0;

  const wireFeed = (m, slot, feed) => {
    if (feed.fromMatch.winner_id) placeInSlot(m, slot, feed.fromMatch.winner_id);
    if (feed.isLoser) {
      feed.fromMatch.loser_next_match_id = m.id;
      feed.fromMatch.loser_next_match_slot = slot;
    } else {
      feed.fromMatch.next_match_id = m.id;
      feed.fromMatch.next_match_slot = slot;
    }
  };

  const buildRound = (pairs) => {
    lbRoundNum++;
    const roundMatches = [];
    const out = [];
    for (const [left, right] of pairs) {
      if (!left && !right) {
        out.push(null);
        continue;
      }
      const m = addMatch(newMatch({ tournamentId, bracket: "losers", round: lbRoundNum, matchNumber: roundMatches.length + 1 }));
      if (left) wireFeed(m, "a", left);
      if (right) wireFeed(m, "b", right);
      m.is_bye = !left !== !right; // exactly one present => structural bye
      roundMatches.push(m);
      out.push({ fromMatch: m, isLoser: false });
    }
    return out;
  };

  for (let wbRoundIdx = 1; wbRoundIdx < k; wbRoundIdx++) {
    // "Minor" round: pair up the current frontier amongst itself.
    const minorPairs = [];
    for (let i = 0; i < frontier.length; i += 2) minorPairs.push([frontier[i], frontier[i + 1]]);
    const minorOut = buildRound(minorPairs);

    // "Major" round: minor-round winners face this WB round's losers.
    const wbLosers = wbRounds[wbRoundIdx].map((m) => (m.is_bye ? null : { fromMatch: m, isLoser: true }));
    const majorPairs = minorOut.map((slot, i) => [slot, wbLosers[i]]);
    frontier = buildRound(majorPairs);
  }

  const lbFinal = frontier.find(Boolean)?.fromMatch;
  if (lbFinal) {
    lbFinal.next_match_id = grandFinal.id;
    lbFinal.next_match_slot = "b";
    if (lbFinal.winner_id) placeInSlot(grandFinal, "b", lbFinal.winner_id);
  }

  // Resolve any byes that are already fully determined (round-1 byes
  // cascading into a losers-bracket match with no real opponent, etc.)
  allMatches.filter((m) => m.is_bye).forEach((m) => settleCascade(m, matchesById));

  return allMatches;
}

/**
 * Generates a round-robin schedule (circle method) for one or more groups.
 * teamIds are split sequentially into `groupCount` groups. Every team in a
 * group plays every other team in that group once (set doubleRound=true for
 * a home/away style double round-robin).
 */
export function generateRoundRobin(tournamentId, teamIds, { groupCount = 1, doubleRound = false } = {}) {
  if (teamIds.length < 2) throw new Error("Need at least 2 teams for a round robin.");
  const groups = splitIntoGroups(teamIds, groupCount);
  const allMatches = [];

  groups.forEach((groupTeams, gi) => {
    const groupName = groupCount > 1 ? `Group ${String.fromCharCode(65 + gi)}` : "Season";
    const schedule = circleMethodSchedule(groupTeams);
    let matchNumber = 1;
    schedule.forEach((roundPairs, roundIdx) => {
      roundPairs.forEach(([a, b]) => {
        if (a == null || b == null) return; // bye (odd team count)
        const m = newMatch({ tournamentId, bracket: "group", groupName, round: roundIdx + 1, matchNumber: matchNumber++ });
        placeInSlot(m, "a", a);
        placeInSlot(m, "b", b);
        allMatches.push(m);
      });
    });
    if (doubleRound) {
      const roundOffset = schedule.length;
      matchNumber = 1;
      schedule.forEach((roundPairs, roundIdx) => {
        roundPairs.forEach(([a, b]) => {
          if (a == null || b == null) return;
          // Reverse home/away for the second leg
          const m = newMatch({ tournamentId, bracket: "group", groupName, round: roundOffset + roundIdx + 1, matchNumber: matchNumber++ });
          placeInSlot(m, "a", b);
          placeInSlot(m, "b", a);
          allMatches.push(m);
        });
      });
    }
  });

  return allMatches;
}

function splitIntoGroups(teamIds, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  teamIds.forEach((id, i) => groups[i % groupCount].push(id));
  return groups.filter((g) => g.length > 0);
}

// Classic circle method: fixes one team, rotates the rest. Handles odd
// counts by padding with a `null` bye.
function circleMethodSchedule(teamIds) {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push(null);
  const n = teams.length;
  const rounds = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // rotate all but the first element
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}
