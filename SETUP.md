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
**Manage** tab, add some players, and log a test match.

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
Adding teams, players, matches, and tournaments is all done live on the
deployed site itself (via the Manage / Log Game / Brackets tabs while
logged in) - you never need to touch GitHub for day-to-day league admin.

## Day-to-day use once it's live

- **Manage tab**: add/remove teams and players, upload a logo/photo for
  each (click "Upload" next to a team or player row), start a new season,
  and set an optional Discord webhook URL for auto-announcements.
- **Calendar tab**: schedule upcoming matches (pick two teams, a best-of
  format - 3, 5, or 7 - a date/time, optional notes). Anyone can browse the
  month-by-month schedule; only admins see the "+ Schedule Match" button
  and can cancel a scheduled match.
- **Log Game tab**: matches are played in sets of 3, 5, or 7 games. Pick a
  scheduled match to continue (or start a new one on the spot by choosing
  two teams and a best-of format), then log each game's winner and each
  player's stats as it's played. The match completes itself automatically
  the moment a team wins the majority (e.g. 2 of 3) - you never need to log
  a game that wasn't actually played. If a match needs to end before it's
  decided (a forfeit or no-show), hit "End Match Now" and pick the winner
  directly. Standings, Game Difference, and player leaderboards all update
  as soon as a match completes, and (if a Discord webhook is set) the
  result posts to your channel.
- **Match pages**: click any match - from Standings, a Team page, the
  Calendar, or right after logging one - to see its full series score and
  every individual game's box score (per-player kills/deaths/assists/etc.).
- **Predictions tab**: open to everyone, no login required - visitors type
  a display name once (remembered on their device) and pick winners for
  the day's matches. Picks lock 30 minutes before each match starts, and a
  leaderboard tracks who predicts best over time.
- **News tab**: admins can log a trade (pick a player and their new team -
  this also updates the player's roster assignment automatically) or post
  a free-form announcement. Everyone sees the combined feed, newest first,
  the 5 most recent items also show up on the Home page, and (if a Discord
  webhook is set) both post to your channel automatically.
- **Brackets tab**: create a double-elimination or round-robin tournament
  from your teams, and report results as they happen - the bracket
  advances itself automatically. Click "Seed from Standings" while
  creating a tournament to auto-order teams by the current season's win %
  instead of picking the order by hand.
- **Records tab**: single-game bests (most kills, best KDA, most damage,
  etc.) and the longest team win streak (consecutive match wins), browsable
  all-time or by season - updates automatically as matches are logged, no
  admin action needed.
- **Rules tab**: a public page for your league's rules/handbook. Admins see
  an "Edit" button to write or update it directly on the site - no code
  or GitHub push required.
- **Team and player pages**: click any team or player name anywhere on the
  site to open their profile - roster, match record (wins, losses, matches
  played, game difference), recent matches, and head-to-head for teams;
  season stats, a KDA trend chart, and full per-game log for players.
- **Theme toggle**: the sun/moon button in the nav switches between dark
  and light mode; it's remembered per visitor's browser.
- **Starting a new season** (Manage tab): give it a name (e.g. "Season 2")
  and confirm. This ends the current season and starts a fresh one -
  Standings and Players immediately reset to 0-0-0 for the new season, but
  every past match/game, team record, and player stat stays intact and can
  still be viewed any time via the season-picker dropdown on the Standings,
  Players, and Records pages.
- Only people logged in with an admin account (created in step 2) can do
  any of the above admin-only actions; everyone else sees a read-only
  public site (except for making predictions, which never requires login).

## Setting up Discord announcements (optional)

1. In Discord, go to your server's **Server Settings -> Integrations ->
   Webhooks -> New Webhook**, pick the channel you want announcements in,
   and copy the webhook URL.
2. Paste it into the **Integrations** card on the **Manage** tab and save.
3. From then on, every completed match and every posted news item (trade or
   announcement) will automatically post a short message to that channel.
   Leave the field blank at any time to turn this off.

This URL is only ever visible to signed-in admins - it's stored the same
way the Discord webhook URL would be treated as a password, since anyone
holding it could post into your channel.

## Notes and limitations

- **Team logos / player photos**: stored in two Supabase Storage buckets
  (`team-logos`, `player-photos`) I already created and configured - public
  read, admin-only upload. Nothing extra to set up; just use the "Upload"
  button next to any team/player row on the Manage tab.
- **Player of the Week**: a simple weighted formula (kills, assists,
  deaths, and a win bonus) over the last 7 days of logged games - it's meant
  to spotlight a standout performer, not serve as an official award.
- **League Records**: recalculated live from all logged games every time
  you open the page - there's nothing to "reset" and no separate records
  table to maintain. Single-game bests stay per-game; the win streak is
  per-match.
- **Matches vs. tournament brackets**: the best-of-N match/game system
  above is for regular-season play only. Tournament brackets (`brackets.html`)
  are a separate, existing system where an admin reports a match's final
  score directly - they aren't currently built from a logged set of
  individual games the way regular-season matches are.
- **Bracket resets**: in double elimination, if the team coming from the
  losers' bracket wins the Grand Final, true double-elimination rules say
  a single deciding match should be played (since both finalists would now
  have exactly one loss). This site doesn't auto-generate that reset match
  for you - if it happens, just log the decider as a follow-up match and
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
