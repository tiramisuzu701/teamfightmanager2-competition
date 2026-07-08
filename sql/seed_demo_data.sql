-- ============================================================================
-- OPTIONAL demo data - lets you see the site populated before your real
-- league starts. Safe to skip entirely, or run once and delete later from
-- the Supabase Table Editor.
-- ============================================================================

insert into teams (name, short_name) values
  ('Phoenix Talons', 'PTX'),
  ('Iron Wolves', 'IWL'),
  ('Void Sentinels', 'VSN'),
  ('Crimson Vanguard', 'CRV')
on conflict (name) do nothing;

insert into players (team_id, name, role)
select t.id, p.name, p.role
from (values
  ('Phoenix Talons', 'Aeris',  'Carry'),
  ('Phoenix Talons', 'Bramm',  'Support'),
  ('Phoenix Talons', 'Coz',    'Mid'),
  ('Iron Wolves',    'Draven2','Carry'),
  ('Iron Wolves',    'Ember',  'Jungle'),
  ('Iron Wolves',    'Fenrix', 'Top'),
  ('Void Sentinels', 'Grimm',  'Mid'),
  ('Void Sentinels', 'Halo',   'Support'),
  ('Crimson Vanguard','Ionis', 'Carry'),
  ('Crimson Vanguard','Juno',  'Jungle')
) as p(team_name, name, role)
join teams t on t.name = p.team_name;
