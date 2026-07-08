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
-- TOURNAMENTS (bracket containers)
-- ----------------------------------------------------------------------------
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null check (format in ('double_elimination', 'round_robin')),
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
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_games_bracket_match on games(bracket_match_id);

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

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Note: count() returns bigint and round() returns numeric - PostgREST
-- serializes both as JSON *strings* (to avoid precision loss), which would
-- silently break numeric sorting in the frontend. Casting to int/float8
-- below makes these come back as native JSON numbers instead.
-- `security_invoker = true` makes the view respect the querying role's own
-- RLS/grants instead of the view owner's (Supabase security best practice).

create view team_standings
with (security_invoker = true) as
select
  t.id as team_id,
  t.name,
  t.short_name,
  t.logo_url,
  count(g.id) filter (where g.winner_id is not null)::int as games_played,
  count(g.id) filter (where g.winner_id = t.id)::int as wins,
  count(g.id) filter (where g.winner_id is not null and g.winner_id <> t.id)::int as losses,
  round(
    100.0 * count(g.id) filter (where g.winner_id = t.id) /
    nullif(count(g.id) filter (where g.winner_id is not null), 0), 1
  )::float8 as win_pct
from teams t
left join games g on g.team_a_id = t.id or g.team_b_id = t.id
group by t.id, t.name, t.short_name, t.logo_url;

create view player_stats_aggregate
with (security_invoker = true) as
select
  p.id as player_id,
  p.name,
  p.role,
  p.photo_url,
  p.team_id,
  t.name as team_name,
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
left join game_player_stats gps on gps.player_id = p.id
group by p.id, p.name, p.role, p.photo_url, p.team_id, t.name;

-- ============================================================================
-- ROW LEVEL SECURITY
-- Public (anon) can read everything. Only a signed-in admin can write.
-- There is no public sign-up flow in this app - you create your own single
-- admin login directly in the Supabase dashboard (Authentication -> Users).
-- ============================================================================

alter table teams enable row level security;
alter table players enable row level security;
alter table tournaments enable row level security;
alter table bracket_matches enable row level security;
alter table games enable row level security;
alter table game_player_stats enable row level security;

-- Public read access
create policy "public read teams" on teams for select using (true);
create policy "public read players" on players for select using (true);
create policy "public read tournaments" on tournaments for select using (true);
create policy "public read bracket_matches" on bracket_matches for select using (true);
create policy "public read games" on games for select using (true);
create policy "public read game_player_stats" on game_player_stats for select using (true);

-- Admin (any authenticated user) write access
create policy "admin write teams" on teams for insert with check (auth.role() = 'authenticated');
create policy "admin update teams" on teams for update using (auth.role() = 'authenticated');
create policy "admin delete teams" on teams for delete using (auth.role() = 'authenticated');

create policy "admin write players" on players for insert with check (auth.role() = 'authenticated');
create policy "admin update players" on players for update using (auth.role() = 'authenticated');
create policy "admin delete players" on players for delete using (auth.role() = 'authenticated');

create policy "admin write tournaments" on tournaments for insert with check (auth.role() = 'authenticated');
create policy "admin update tournaments" on tournaments for update using (auth.role() = 'authenticated');
create policy "admin delete tournaments" on tournaments for delete using (auth.role() = 'authenticated');

create policy "admin write bracket_matches" on bracket_matches for insert with check (auth.role() = 'authenticated');
create policy "admin update bracket_matches" on bracket_matches for update using (auth.role() = 'authenticated');
create policy "admin delete bracket_matches" on bracket_matches for delete using (auth.role() = 'authenticated');

create policy "admin write games" on games for insert with check (auth.role() = 'authenticated');
create policy "admin update games" on games for update using (auth.role() = 'authenticated');
create policy "admin delete games" on games for delete using (auth.role() = 'authenticated');

create policy "admin write game_player_stats" on game_player_stats for insert with check (auth.role() = 'authenticated');
create policy "admin update game_player_stats" on game_player_stats for update using (auth.role() = 'authenticated');
create policy "admin delete game_player_stats" on game_player_stats for delete using (auth.role() = 'authenticated');

-- Explicit grants (Supabase usually sets these up, but this makes it explicit)
grant select on team_standings to anon, authenticated;
grant select on player_stats_aggregate to anon, authenticated;
grant select, insert, update, delete on teams, players, tournaments, bracket_matches, games, game_player_stats to authenticated;
grant select on teams, players, tournaments, bracket_matches, games, game_player_stats to anon;
