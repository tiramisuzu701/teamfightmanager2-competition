# Teamfight Manager 2 League

A free, hostable league website for tracking team standings, player
statistics, and tournament brackets for a Teamfight Manager 2 league.

**Start here:** see [`SETUP.md`](./SETUP.md). Your Supabase backend is
already provisioned and connected (project `tfm2-league`, free tier) - only
two quick account-security clicks and a push to GitHub Pages remain.

## What's included

- **Home** (`index.html`) - welcome page with a snapshot of upcoming games,
  recent news/trades, top standings, and top players at a glance.
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
- **News** (`news.html`) - reverse-chronological feed of trades/roster moves
  and free-form announcements; admins can post both (a trade automatically
  updates the player's team assignment).
- **Log Game** (`log-game.html`) - admin-only form to record a completed
  game's winner and each player's stats in one go, optionally linked to a
  scheduled game (which then gets marked completed automatically).
- **Brackets** (`brackets.html`) - create and run double-elimination or
  round-robin/group tournaments; admins report results and the bracket
  advances itself (including bye handling for uneven team counts).
- **Manage** (`manage.html`) - admin-only screen to add/remove teams and
  players, and to start a new season (resets Standings/Players to zero
  while keeping every past game and season browsable).
- **Login** (`login.html`) - single admin login (no public sign-up).

## How it's built

Plain HTML/CSS/JavaScript with no build step or framework, so it can be
hosted anywhere that serves static files (GitHub Pages, Netlify, Vercel,
or even a folder on your own web host). All data is stored in a
[Supabase](https://supabase.com) Postgres database (free tier) and read/
written directly from the browser via the Supabase JS client. Row Level
Security policies (see `sql/schema.sql`) make the whole site publicly
readable while restricting all writes to a signed-in admin account.

```
index.html          Home page (welcome + snapshot)
standings.html       Standings page (season-aware)
players.html         Player stats + leaderboards (season-aware)
calendar.html        Month-by-month schedule
predictions.html     Name-tag game predictions + leaderboard
news.html            Trades / roster moves / announcements feed
brackets.html        Tournament brackets
log-game.html        Admin: log a completed game
manage.html          Admin: add/remove teams & players, start new season
login.html           Admin login
css/style.css        Shared styling
js/                  Application code
  config.js                     <- put your Supabase URL/key here
  supabaseClient.js, auth.js, nav.js, seasons.js   Shared plumbing
  home.js, standings.js, players.js, calendar.js, predictions.js, news.js,
  brackets.js, logGame.js, manage.js, loginPage.js
  bracketGen.js                Double-elimination / round-robin generation
sql/schema.sql              Database tables, views, and security policies
sql/seed_demo_data.sql          Optional sample data
SETUP.md                          Full setup walkthrough
```

## License / ownership

This is your project - edit anything, rename it, restyle it, extend it.
