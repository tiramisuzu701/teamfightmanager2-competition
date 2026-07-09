# Teamfight Manager 2 League

A free, hostable league website for tracking team standings, player
statistics, and tournament brackets for a Teamfight Manager 2 league.

**Start here:** see [`SETUP.md`](./SETUP.md). Your Supabase backend is
already provisioned and connected (project `tfm2-league`, free tier) - only
two quick account-security clicks and a push to GitHub Pages remain.

## What's included

League play is organized around **matches** - a best-of-3, best-of-5, or
best-of-7 set between two teams. A match is what counts toward standings (1
win/1 loss per match, however many games it took); the individual games
inside it keep their own full player stats and are viewable on the match's
own page. See "How matches work" below for details.

- **Home** (`index.html`) - welcome page with Player of the Week, a
  snapshot of upcoming matches, recent news/trades, top standings, and top
  players at a glance.
- **Standings** (`standings.html`) - team win/loss records (by match), a
  Matches Played and Game Difference column, sortable, with a season picker
  to browse any past season.
- **Players** (`players.html`) - full season stat table for every player,
  plus a Top-10 leaderboard mode for any stat (kills, KDA, CS, gold,
  damage, towers, objectives, wins...), also season-aware.
- **Champions** (`champions.html`) - a sortable table of every champion's
  pick rate, ban rate, times picked/banned, wins, and win rate, season-aware.
- **Calendar** (`calendar.html`) - month-by-month view of scheduled matches
  (each with its best-of format); admins can schedule new matches and
  cancel existing ones.
- **Predictions** (`predictions.html`) - anyone can type a display name (no
  account needed) and pick winners for the day's matches, locking 30
  minutes before each match starts, with a running accuracy leaderboard.
- **Brackets** (`brackets.html`) - create and run double-elimination or
  round-robin/group tournaments, optionally auto-seeded from the current
  standings; admins report results and the bracket advances itself
  (including bye handling for uneven team counts). Tournament matches are
  still scored directly (a single reported final score) rather than
  through the regular-season match/game log.
- **Records** (`records.html`) - single-game bests (kills, assists, damage,
  CS, gold, towers, objectives, KDA) and the longest team win streak (now
  counted in consecutive match wins), all-time or filtered to any season.
- **News** (`news.html`) - reverse-chronological feed of trades/roster moves
  and free-form announcements; admins can post both (a trade automatically
  updates the player's team assignment), optionally auto-posted to Discord.
- **Rules** (`rules.html`) - a public rules/handbook page admins can edit
  in place, no code changes needed.
- **Team pages** (`team.html?id=...`) - roster, season record (wins,
  losses, matches played, game difference), recent matches, and all-time
  head-to-head vs every other team; reached by clicking any team name
  across the site.
- **Player pages** (`player.html?id=...`) - season stats, a champion pool
  (which champions they've picked, games/wins/win rate for each, season-
  aware), a KDA trend chart, and full per-game log; reached by clicking any
  player name.
- **Match pages** (`match.html?id=...`) - a single match's series score,
  best-of format, and status, with every individual game's full box score
  underneath (including each player's champion pick and each team's bans
  for that game); reached by clicking any match from Standings, Team pages,
  the Calendar, or right after logging one. Signed-in admins also see an
  "Edit" link per game to correct it later.
- **Log Game** (`log-game.html`) - admin-only flow to log a match: start a
  new best-of-3/5/7 set (or continue a scheduled one), then log each game
  one at a time as it's played, including each player's champion pick and
  each team's bans for that game. The match completes itself automatically
  once a team wins the majority, or an admin can end it early (e.g. a
  forfeit) and pick the winner directly.
- **Edit Game** (`edit-game.html`) - admin-only page (reached via an "Edit"
  link next to any game on its match page) to correct an already-logged
  game after the fact: winner, duration, notes, every player's stats and
  champion pick, and both teams' bans. See "How champion picks/bans and
  editing work" below for what happens to the parent match when a
  correction changes who won.
- **Manage** (`manage.html`) - admin-only screen to add/remove teams,
  players, and champions (with optional icons), upload team logos/player
  photos, start a new season (resets Standings/Players to zero while
  keeping every past match/game and season browsable), and set an optional
  Discord webhook for auto-announcements.
- **Login** (`login.html`) - single admin login (no public sign-up).
- **Search** - a search box in the nav bar on every page; type a few
  letters of any team, player, or champion name to jump straight to it
  (champion results land on the Champions page with that row highlighted).
- **Light/dark theme toggle** - in the nav bar on every page, persisted per
  visitor's browser.

## How matches work

- A **match** is a best-of-3, best-of-5, or best-of-7 set between two teams
  - you pick the format when you schedule or start it.
- Standings count **matches**, not individual games: winning a set 2-0 or
  2-1 is still just 1 win. The **Game Difference** column on Standings and
  Team pages separately tracks individual games won minus lost, so a team
  that always needs the full 3 games to close out a set is distinguishable
  from one that's sweeping opponents.
- Logging a match happens one game at a time from the Log Game tab - enter
  each game's winner and player stats as it's played. The match completes
  itself automatically the moment a team reaches the majority (2 of 3, 3 of
  5, or 4 of 7); you don't need to log games that were never played once a
  set is decided.
- If a match needs to end before it's decided (a forfeit, a no-show, or any
  other early stop), an admin can end it directly from the Log Game tab and
  pick the winner - the match is marked completed with whatever games were
  actually logged.
- Every individual game's full box score (per-player kills/deaths/assists/
  etc.) is still kept and viewable on the match's own page, alongside the
  series score - nothing about per-game stats changes, only how wins/losses
  roll up to standings.
- Tournament brackets (`brackets.html`) are a separate, existing system -
  a bracket match's score is still reported directly by an admin rather
  than being built from a logged best-of-N set.

## How champion picks/bans and editing work

- Champions are a simple admin-maintained list (Manage tab: name + optional
  icon) - the site doesn't ship with a pre-built champion list, since only
  you know which champions your league actually uses. Add them as needed;
  they immediately become selectable when logging games.
- Each **game** (not each match) has its own draft: while logging a game,
  admins optionally pick a champion for each player who played, and add as
  many bans per team as actually happened (no fixed count is enforced -
  some drafts ban more than others).
- The **Champions** page (`champions.html`) tracks, per season: how many
  games a champion was picked/banned in, its pick rate and ban rate (percent
  of that season's played games), its win count, and its win rate (percent
  of games it was picked in that were won).
- **Editing a logged game** (`edit-game.html`, via the "Edit" link on a
  match page) lets an admin fix a mistake after the fact - the winner,
  duration, notes, every player's stats and champion pick, and both teams'
  bans are all correctable. Saving replaces that game's stats/bans outright
  with whatever's on the form (so removing a row on the edit form removes
  that pick/ban, it isn't merged with what was there before).
- If editing a game changes **who won that game**, the parent match's
  score and outcome are recalculated automatically the same way live
  logging works: win counts are retotaled from every game under that match,
  and if that changes whether a team has reached the majority, the match's
  status/winner flip accordingly (e.g. correcting a game 2 result on a
  match that was 2-0 and "Final" can put it back to 1-1 and "In Progress").
  The one exception is a match that was ended early (a forfeit/no-show, not
  decided by majority) - editing a game under it only corrects the raw win
  counts; the match's status, winner, and completion time are left exactly
  as the admin set them when they ended it, since that was a deliberate
  override, not something majority-based logic should second-guess.

## How it's built

Plain HTML/CSS/JavaScript with no build step or framework, so it can be
hosted anywhere that serves static files (GitHub Pages, Netlify, Vercel,
or even a folder on your own web host). All data is stored in a
[Supabase](https://supabase.com) Postgres database (free tier) and read/
written directly from the browser via the Supabase JS client. Row Level
Security policies (see `sql/schema.sql`) make the whole site publicly
readable while restricting all writes to a signed-in admin account.

```
index.html          Home page (welcome + Player of the Week + snapshot)
standings.html       Standings page (season-aware, match-based W/L + Game Diff)
players.html         Player stats + leaderboards (season-aware)
champions.html       Champion pick/ban/win rate stats (season-aware)
calendar.html        Month-by-month schedule of matches
predictions.html     Name-tag match predictions + leaderboard
brackets.html        Tournament brackets (+ seed-from-standings)
records.html         League records / awards
news.html            Trades / roster moves / announcements feed
rules.html           Public rules/handbook (admin-editable)
team.html            Team profile (roster, record, recent matches, head-to-head)
player.html          Player profile (stats, trend, per-game log)
match.html           Match detail: series score + every game's box score + picks/bans
log-game.html        Admin: log a match, one game at a time (+ champion picks/bans)
edit-game.html       Admin: correct an already-logged game
manage.html          Admin: teams/players/champions, logos/photos, seasons, Discord
login.html           Admin login
css/style.css        Shared styling (incl. light/dark theme variables)
js/                  Application code
  config.js                     <- put your Supabase URL/key here
  supabaseClient.js, auth.js, nav.js, seasons.js, settings.js, discord.js   Shared plumbing
  gameForm.js                   Shared roster/stats/champion-pick/ban form logic (Log Game + Edit Game)
  home.js, standings.js, players.js, champions.js, calendar.js, predictions.js,
  news.js, rules.js, team.js, player.js, match.js, records.js,
  brackets.js, logGame.js, editGame.js, manage.js, loginPage.js
  bracketGen.js                Double-elimination / round-robin generation
sql/schema.sql              Database tables, views, storage buckets, and security policies
sql/seed_demo_data.sql          Optional sample data
SETUP.md                          Full setup walkthrough
```

## License / ownership

This is your project - edit anything, rename it, restyle it, extend it.
