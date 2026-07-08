-- ============================================================================
-- Teamfight Manager 2 League - Database Schema
-- Run this entire file once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run)
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- TEAMS
-- ----------------------------------------------------------------------------
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  logo_url text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PLAYERS
-- ----------------------------------------------------------------------------
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete set null,
  name text not null,
  role text,               -- e.g. Top / Jungle / Mid / Carry / Support (adapt to TFM2 roles)
  photo_url text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SEASONS
-- Exactly one row can have is_current = true at a time (enforced by the
-- partial unique index below). "Starting a new season" means creating a new
-- row and flipping is_current - it does NOT delete or move any past data;
-- every game/tournament/news item stays tagged with the season it happened
-- in, so past seasons remain fully browsable.
-- ----------------------------------------------------------------------------
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_current boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_one_current_season on seasons (is_current) where is_current = true;

insert into seasons (name, is_current)
select 'Season 1', true
where not exists (select 1 from seasons);

create or replace function current_season_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from seasons where is_current limit 1;
$$;

-- ----------------------------------------------------------------------------
-- TOURNAMENTS (bracket containers)
-- ----------------------------------------------------------------------------
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null check (format in ('double_elimination', 'round_robin')),
  season_id uuid references seasons(id) default current_season_id(),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- BRACKET MATCHES
-- Used for both double_elimination (bracket = 'winners' | 'losers' | 'grand_final')
-- and round_robin (bracket = 'group', group_name identifies the group/pool)
-- ----------------------------------------------------------------------------
create table if not exists bracket_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  bracket text not null check (bracket in ('winners', 'losers', 'grand_final', 'group')),
  group_name text,               -- only used for round_robin
  round int not null,
  match_number int not null,     -- ordering within the round
  team_a_id uuid references teams(id),
  team_b_id uuid references teams(id),
  winner_id uuid references teams(id),
  team_a_score int not null default 0,
  team_b_score int not null default 0,
  next_match_id uuid references bracket_matches(id),
  next_match_slot text check (next_match_slot in ('a', 'b')),
  loser_next_match_id uuid references bracket_matches(id),
  loser_next_match_slot text check (loser_next_match_slot in ('a', 'b')),
  is_bye boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bracket_matches_tournament on bracket_matches(tournament_id);

-- ----------------------------------------------------------------------------
-- SCHEDULED GAMES (calendar)
-- ----------------------------------------------------------------------------
create table if not exists scheduled_games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id) default current_season_id(),
  team_a_id uuid not null references teams(id),
  team_b_id uuid not null references teams(id),
  scheduled_at timestamptz not null,
  bracket_match_id uuid references bracket_matches(id),
  game_id uuid,  -- FK added below, after the games table exists
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_games_time on scheduled_games(scheduled_at);

-- ----------------------------------------------------------------------------
-- GAMES (one row per logged game)
-- ----------------------------------------------------------------------------
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null default now(),
  team_a_id uuid not null references teams(id),
  team_b_id uuid not null references teams(id),
  winner_id uuid references teams(id),
  duration_minutes numeric,
  bracket_match_id uuid references bracket_matches(id),
  season_id uuid references seasons(id) default current_season_id(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_games_bracket_match on games(bracket_match_id);

alter table scheduled_games add constraint scheduled_games_game_id_fkey
  foreign key (game_id) references games(id);

-- ----------------------------------------------------------------------------
-- GAME_PLAYER_STATS (one row per player per game)
-- ----------------------------------------------------------------------------
create table if not exists game_player_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id),
  team_id uuid references teams(id),
  win boolean not null default false,
  kills int not null default 0,
  deaths int not null default 0,
  assists int not null default 0,
  cs int not null default 0,
  gold int not null default 0,
  damage int not null default 0,
  towers int not null default 0,
  epic_monsters int not null default 0,   -- Dragons/Barons/Heralds-equivalent objectives in TFM2
  created_at timestamptz not null default now()
);

create index if not exists idx_gps_game on game_player_stats(game_id);
create index if not exists idx_gps_player on game_player_stats(player_id);

-- ----------------------------------------------------------------------------
-- PREDICTIONS
-- Public (no login) can predict, identified only by a self-chosen display
-- name, up until 30 minutes before the scheduled game time (enforced by RLS
-- below, not just the frontend).
-- ----------------------------------------------------------------------------
create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  scheduled_game_id uuid not null references scheduled_games(id) on delete cascade,
  predictor_name text not null,
  predicted_team_id uuid not null references teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheduled_game_id, predictor_name)
);

-- ----------------------------------------------------------------------------
-- NEWS ITEMS (trades + announcements feed)
-- ----------------------------------------------------------------------------
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id) default current_season_id(),
  type text not null check (type in ('trade', 'announcement')),
  title text not null,
  body text,
  player_id uuid references players(id),
  from_team_id uuid references teams(id),
  to_team_id uuid references teams(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_news_items_created on news_items(created_at desc);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Note: count() returns bigint and round() returns numeric - PostgREST
-- serializes both as JSON *strings* (to avoid precision loss), which would
-- silently break numeric sorting in the frontend. Casting to int/float8
-- below makes these come back as native JSON numbers instead.
-- `security_invoker = true` makes the view respect the querying role's own
-- RLS/grants instead of the view owner's (Supabase security best practice).
--
-- Both standings views are cross-joined against `seasons` so every team/
-- player gets a row (even a 0-0-0 one) for every season, letting the
-- frontend filter to whichever season is selected with a plain .eq().

create or replace view team_standings
with (security_invoker = true) as
select
  t.id as team_id,
  t.name,
  t.short_name,
  t.logo_url,
  s.id as season_id,
  s.name as season_name,
  count(g.id) filter (where g.winner_id is not null)::int as games_played,
  count(g.id) filter (where g.winner_id = t.id)::int as wins,
  count(g.id) filter (where g.winner_id is not null and g.winner_id <> t.id)::int as losses,
  round(
    100.0 * count(g.id) filter (where g.winner_id = t.id) /
    nullif(count(g.id) filter (where g.winner_id is not null), 0), 1
  )::float8 as win_pct
from teams t
cross join seasons s
left join games g on (g.team_a_id = t.id or g.team_b_id = t.id) and g.season_id = s.id
group by t.id, t.name, t.short_name, t.logo_url, s.id, s.name;

create or replace view player_stats_aggregate
with (security_invoker = true) as
select
  p.id as player_id,
  p.name,
  p.role,
  p.photo_url,
  p.team_id,
  t.name as team_name,
  s.id as season_id,
  s.name as season_name,
  count(gps.id)::int as games_played,
  count(gps.id) filter (where gps.win)::int as wins,
  count(gps.id) filter (where not gps.win)::int as losses,
  coalesce(sum(gps.kills), 0)::int as total_kills,
  coalesce(sum(gps.deaths), 0)::int as total_deaths,
  coalesce(sum(gps.assists), 0)::int as total_assists,
  coalesce(sum(gps.cs), 0)::int as total_cs,
  coalesce(sum(gps.gold), 0)::int as total_gold,
  coalesce(sum(gps.damage), 0)::int as total_damage,
  coalesce(sum(gps.towers), 0)::int as total_towers,
  coalesce(sum(gps.epic_monsters), 0)::int as total_epic_monsters,
  round(coalesce(avg(gps.kills), 0)::numeric, 2)::float8 as avg_kills,
  round(coalesce(avg(gps.deaths), 0)::numeric, 2)::float8 as avg_deaths,
  round(coalesce(avg(gps.assists), 0)::numeric, 2)::float8 as avg_assists,
  round(coalesce(avg(gps.cs), 0)::numeric, 1)::float8 as avg_cs,
  round(coalesce(avg(gps.gold), 0)::numeric, 0)::float8 as avg_gold,
  round(coalesce(avg(gps.damage), 0)::numeric, 0)::float8 as avg_damage,
  round(
    (coalesce(sum(gps.kills), 0) + coalesce(sum(gps.assists), 0))::numeric /
    nullif(coalesce(sum(gps.deaths), 0), 0), 2
  )::float8 as kda
from players p
left join teams t on t.id = p.team_id
cross join seasons s
left join games g on g.season_id = s.id
left join game_player_stats gps on gps.player_id = p.id and gps.game_id = g.id
group by p.id, p.name, p.role, p.photo_url, p.team_id, t.name, s.id, s.name;

create or replace view prediction_leaderboard
with (security_invoker = true) as
select
  pr.predictor_name,
  count(*) filter (where sg.status = 'completed')::int as total_predictions,
  count(*) filter (where sg.status = 'completed' and pr.predicted_team_id = g.winner_id)::int as correct_predictions,
  round(
    100.0 * count(*) filter (where sg.status = 'completed' and pr.predicted_team_id = g.winner_id) /
    nullif(count(*) filter (where sg.status = 'completed'), 0), 1
  )::float8 as accuracy_pct
from predictions pr
join scheduled_games sg on sg.id = pr.scheduled_game_id
left join games g on g.id = sg.game_id
group by pr.predictor_name;

-- ============================================================================
-- ROW LEVEL SECURITY
-- Public (anon) can read everything. Only a signed-in admin can write -
-- EXCEPT `predictions`, where anyone can submit/update their own pick (by
-- name, no login) up until 30 minutes before the game.
-- There is no public sign-up flow in this app - you create your own single
-- admin login directly in the Supabase dashboard (Authentication -> Users).
-- ============================================================================

alter table teams enable row level security;
alter table players enable row level security;
alter table seasons enable row level security;
alter table tournaments enable row level security;
alter table bracket_matches enable row level security;
alter table scheduled_games enable row level security;
alter table games enable row level security;
alter table game_player_stats enable row level security;
alter table predictions enable row level security;
alter table news_items enable row level security;

-- Public read access
create policy "public read teams" on teams for select using (true);
create policy "public read players" on players for select using (true);
create policy "public read seasons" on seasons for select using (true);
create policy "public read tournaments" on tournaments for select using (true);
create policy "public read bracket_matches" on bracket_matches for select using (true);
create policy "public read scheduled_games" on scheduled_games for select using (true);
create policy "public read games" on games for select using (true);
create policy "public read game_player_stats" on game_player_stats for select using (true);
create policy "public read predictions" on predictions for select using (true);
create policy "public read news_items" on news_items for select using (true);

-- Admin (any authenticated user) write access
create policy "admin write teams" on teams for insert with check (auth.role() = 'authenticated');
create policy "admin update teams" on teams for update using (auth.role() = 'authenticated');
create policy "admin delete teams" on teams for delete using (auth.role() = 'authenticated');

create policy "admin write players" on players for insert with check (auth.role() = 'authenticated');
create policy "admin update players" on players for update using (auth.role() = 'authenticated');
create policy "admin delete players" on players for delete using (auth.role() = 'authenticated');

create policy "admin write seasons" on seasons for insert with check (auth.role() = 'authenticated');
create policy "admin update seasons" on seasons for update using (auth.role() = 'authenticated');
create policy "admin delete seasons" on seasons for delete using (auth.role() = 'authenticated');

create policy "admin write tournaments" on tournaments for insert with check (auth.role() = 'authenticated');
create policy "admin update tournaments" on tournaments for update using (auth.role() = 'authenticated');
create policy "admin delete tournaments" on tournaments for delete using (auth.role() = 'authenticated');

create policy "admin write bracket_matches" on bracket_matches for insert with check (auth.role() = 'authenticated');
create policy "admin update bracket_matches" on bracket_matches for update using (auth.role() = 'authenticated');
create policy "admin delete bracket_matches" on bracket_matches for delete using (auth.role() = 'authenticated');

create policy "admin write scheduled_games" on scheduled_games for insert with check (auth.role() = 'authenticated');
create policy "admin update scheduled_games" on scheduled_games for update using (auth.role() = 'authenticated');
create policy "admin delete scheduled_games" on scheduled_games for delete using (auth.role() = 'authenticated');

create policy "admin write games" on games for insert with check (auth.role() = 'authenticated');
create policy "admin update games" on games for update using (auth.role() = 'authenticated');
create policy "admin delete games" on games for delete using (auth.role() = 'authenticated');

create policy "admin write game_player_stats" on game_player_stats for insert with check (auth.role() = 'authenticated');
create policy "admin update game_player_stats" on game_player_stats for update using (auth.role() = 'authenticated');
create policy "admin delete game_player_stats" on game_player_stats for delete using (auth.role() = 'authenticated');

create policy "admin write news_items" on news_items for insert with check (auth.role() = 'authenticated');
create policy "admin update news_items" on news_items for update using (auth.role() = 'authenticated');
create policy "admin delete news_items" on news_items for delete using (auth.role() = 'authenticated');

-- Predictions: anyone can insert/update their own pick up until 30 minutes
-- before the scheduled game time; only admin can delete (e.g. spam cleanup).
create policy "public insert predictions before lock" on predictions for insert to anon, authenticated
  with check (
    exists (
      select 1 from scheduled_games sg
      where sg.id = scheduled_game_id
        and sg.status = 'scheduled'
        and now() < sg.scheduled_at - interval '30 minutes'
    )
  );
create policy "public update own predictions before lock" on predictions for update to anon, authenticated
  using (
    exists (
      select 1 from scheduled_games sg
      where sg.id = scheduled_game_id
        and sg.status = 'scheduled'
        and now() < sg.scheduled_at - interval '30 minutes'
    )
  )
  with check (
    exists (
      select 1 from scheduled_games sg
      where sg.id = scheduled_game_id
        and sg.status = 'scheduled'
        and now() < sg.scheduled_at - interval '30 minutes'
    )
  );
create policy "admin delete predictions" on predictions for delete using (auth.role() = 'authenticated');

-- Explicit grants (Supabase usually sets these up, but this makes it explicit)
grant select on team_standings, player_stats_aggregate, prediction_leaderboard to anon, authenticated;
grant select, insert, update, delete on
  teams, players, seasons, tournaments, bracket_matches, scheduled_games,
  games, game_player_stats, news_items
  to authenticated;
grant select on
  teams, players, seasons, tournaments, bracket_matches, scheduled_games,
  games, game_player_stats, news_items
  to anon;
grant select, insert, update on predictions to anon;
grant select, insert, update, delete on predictions to authenticated;
