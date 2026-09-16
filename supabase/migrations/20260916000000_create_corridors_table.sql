-- Migration: Add corridors resource table and per-user corridor assignment.
-- Gives each user a default corridor (profiles.assigned_corridor_id) and a
-- shared set of corridors the dashboard corridor picker selects from.

create table if not exists corridors (
  id integer generated always as identity primary key,
  name text not null unique
);

alter table profiles
  add column if not exists assigned_corridor_id integer references corridors(id);
