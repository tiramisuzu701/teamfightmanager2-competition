# Teamfight Manager 2 League

A free, hostable league website for tracking team standings, player
statistics, and tournament brackets for a Teamfight Manager 2 league.

**Start here:** see [`SETUP.md`](./SETUP.md). Your Supabase backend is
already provisioned and connected (project `tfm2-league`, free tier) - only
two quick account-security clicks and a push to GitHub Pages remain.

## What's included

- **Home** (`index.html`) - welcome page with Player of the Week, a
  snapshot of upcoming games, recent news/trades, top standings, and top
  players at a glance.
- **Standings** (`standings.html`) - team win/loss records, sortable, with a
  season picker to browse any past season.
- **Players** (`players.html`) - full season stat table for every player,
  plus a Top-10 leaderboard mode for any stat (kills, KDA, CS, gold,
  damage, towers, objectives, wins...), also season-aware.
- **Calendar** (`calendar.html`) - month-by-month view of scheduled games;
  admins can schedule new games and cancel existing ones.
- **Predictions** (`predictions.html`) - anyone can type a display name (no
  account needed) and pick winners for the day's games, locking 30 minutes
  before each game starts, with a running accuracy leaderboard.
- **Brackets** (`brackets.html`) - create and run double-elimination or
  round-robin/group tournaments, optionally auto-seeded from the current
  standings; admins report results and the bracket advances itself
  (including bye handling for uneven team counts).
- **Records** (`records.html`) - single-game bests (kills, assists, damage,
  CS, gold, towers, objectives, KDA) and the longest team win streak,
  all-time or filtered to any season.
- **News** (`news.html`) - reverse-chronological feed of trades/roster moves
  and free-form announcements; admins can post both (a trade automatically
  updates the player's team assignment), optionally auto-posted to Discord.
- **Rules** (`rules.html`) - a public rules/handbook page admins can edit
  in place, no code changes needed.
- **Team pages** (`team.html?id=...`) - roster, season record, recent
  games, and all-time head-to-head vs every other team; reached by
  clicking any team name across the site.
- **Player pages** (`player.html?id=...`) - season stats, a KDA trend
  chart, and full game log; reached by clicking any player name.
- **Log Game** (`log-game.html`) - admin-only form to record a completed
  game's winner and each player's stats in one go, optionally linked to a
  scheduled game (which then gets marked completed automatically).
- **Manage** (`manage.html`) - admin-only screen to add/remove teams and
  players, upload team logos/player photos, start a new season (resets
  Standings/Players to zero while keeping every past game and season
  browsable), and set an optional Discord webhook for auto-announcements.
- **Login** (`login.html`) - single admin login (no public sign-up).
- **Light/dark theme toggle** - in the nav bar on every page, persisted per
  visitor's browser.

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
standings.html       Standings page (season-aware)
players.html         Player stats + leaderboards (season-aware)
calendar.html        Month-by-month schedule
predictions.html     Name-tag game predictions + leaderboard
brackets.html        Tournament brackets (+ seed-from-standings)
records.html         League records / awards
news.html            Trades / roster moves / announcements feed
rules.html           Public rules/handbook (admin-editable)
team.html            Team profile (roster, record, head-to-head)
player.html          Player profile (stats, trend, game log)
log-game.html        Admin: log a completed game
manage.html          Admin: teams/players, logos/photos, seasons, Discord
login.html           Admin login
css/style.css        Shared styling (incl. light/dark theme variables)
js/                  Application code
  config.js                     <- put your Supabase URL/key here
  supabaseClient.js, auth.js, nav.js, seasons.js, settings.js, discord.js   Shared plumbing
  home.js, standings.js, players.js, calendar.js, predictions.js,
  news.js, rules.js, team.js, player.js, records.js,
  brackets.js, logGame.js, manage.js, loginPage.js
  bracketGen.js                Double-elimination / round-robin generation
sql/schema.sql              Database tables, views, storage buckets, and security policies
sql/seed_demo_data.sql          Optional sample data
SETUP.md                          Full setup walkthrough
```

## License / ownership

This is your project - edit anything, rename it, restyle it, extend it.
