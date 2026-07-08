# Setup Guide - Teamfight Manager 2 League Site

Good news: your Supabase backend is **already provisioned and connected**.
I created the project, ran the schema, and filled in `js/config.js` for you.
Just two quick account-security clicks and one push to GitHub, and you're
live.

Project: **tfm2-league** (`https://ktqxolhqjlbjqaervuqh.supabase.co`), free tier ($0/month).

## 1. Turn off public sign-ups (2 minutes, important)

This site has no public "create account" page on purpose - only you (the
league admin) should be able to log games or edit brackets. Supabase
projects allow email sign-up via their API by default though, so close that
door:

1. Open: https://supabase.com/dashboard/project/ktqxolhqjlbjqaervuqh/auth/providers
2. Under the **Email** provider, turn **off** "Allow new users to sign up".
3. Save.

This means the *only* way an admin account can ever be created is by you,
manually, in the dashboard (next step) - nobody can self-register from the
public site.

## 2. Create your own admin login (2 minutes)

1. Open: https://supabase.com/dashboard/project/ktqxolhqjlbjqaervuqh/auth/users
2. Click **Add user** -> **Create new user**.
3. Enter the email and password you want to use to log into the site as
   admin. Check "Auto Confirm User" if offered.

You can add more admin accounts the same way later (e.g. for co-organizers).

## 3. (Optional) Load sample data to try it out

If you want to see the site populated with a few example teams/players
before your real season starts, open `sql/seed_demo_data.sql` in this
project, copy its contents, paste into the SQL Editor here:
https://supabase.com/dashboard/project/ktqxolhqjlbjqaervuqh/sql/new
and click **Run**. You can delete this sample data later from the Table
Editor, or just start adding your real teams on the **Manage** tab instead.

## 4. Try it locally (optional but recommended)

Because the pages use JS modules, you can't just double-click `index.html`
- open it through a local web server instead. From this folder, run one of:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then visit `http://localhost:8080` in your browser. Log in at `/login.html`
with the admin account you created in step 2, add a team or two on the
**Manage** tab, add some players, and log a test game.

## 5. Publish it for free on GitHub Pages

1. Create a new GitHub repository (needs to be **public** for Pages to work
   on a free personal GitHub account).
2. Push this entire folder to that repository:

   ```bash
   git init
   git add .
   git commit -m "Initial league site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. In the repository on GitHub, go to **Settings -> Pages**.
4. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   branch `main`, folder `/ (root)`. Save.
5. GitHub will give you a URL like `https://<your-username>.github.io/<your-repo>/`
   within a minute or two - that's your public league site. Share it with
   your players!

Whenever you want to change the site's look or add a feature, edit the
files and push again - GitHub Pages redeploys automatically on every push.
Adding teams, players, games, and tournaments is all done live on the
deployed site itself (via the Manage / Log Game / Brackets tabs while
logged in) - you never need to touch GitHub for day-to-day league admin.

## Day-to-day use once it's live

- **Manage tab**: add/remove teams and players, and start a new season
  when you're ready to move on from the current one.
- **Calendar tab**: schedule upcoming games (pick two teams, a date/time,
  optional notes). Anyone can browse the month-by-month schedule; only
  admins see the "+ Schedule Game" button and can cancel a scheduled game.
- **Log Game tab**: after each game, log the winner and each player's stats.
  If the game was on the calendar, pick it from the "Link to scheduled
  game" dropdown first - it auto-fills the teams and marks that calendar
  entry as completed. Standings and player leaderboards update immediately.
- **Predictions tab**: open to everyone, no login required - visitors type
  a display name once (remembered on their device) and pick winners for
  the day's games. Picks lock 30 minutes before each game starts, and a
  leaderboard tracks who predicts best over time.
- **News tab**: admins can log a trade (pick a player and their new team -
  this also updates the player's roster assignment automatically) or post
  a free-form announcement. Everyone sees the combined feed, newest first,
  and the 5 most recent items also show up on the Home page.
- **Brackets tab**: create a double-elimination or round-robin tournament
  from your teams, and report results as they happen - the bracket
  advances itself automatically.
- **Starting a new season** (Manage tab): give it a name (e.g. "Season 2")
  and confirm. This ends the current season and starts a fresh one -
  Standings and Players immediately reset to 0-0-0 for the new season, but
  every past game, team record, and player stat stays intact and can still
  be viewed any time via the season-picker dropdown on the Standings and
  Players pages.
- Only people logged in with an admin account (created in step 2) can do
  any of the above admin-only actions; everyone else sees a read-only
  public site (except for making predictions, which never requires login).

## Notes and limitations

- **Bracket resets**: in double elimination, if the team coming from the
  losers' bracket wins the Grand Final, true double-elimination rules say
  a single deciding match should be played (since both finalists would now
  have exactly one loss). This site doesn't auto-generate that reset match
  for you - if it happens, just log the decider as a follow-up game and
  note it in your standings/announcements.
- **Team/player deletion**: deleting a team keeps its players (they become
  unassigned) and keeps historical stats intact. Deleting a player removes
  their logged game stats along with them.
- **Predictions identity**: predictions use a simple typed display name,
  not a real account - anyone who types the same name as someone else
  shares that person's picks and leaderboard record, so encourage your
  league to each pick something unique.
- Want more stat columns, a different color scheme, or another tab? Just
  ask - the codebase is plain HTML/CSS/JS with no build step, so changes
  are quick to make.

## Managing the Supabase project directly

You can view data, logs, and settings any time at:
https://supabase.com/dashboard/project/ktqxolhqjlbjqaervuqh
