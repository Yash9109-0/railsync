-- Migration: Add corridors resource table so maintenance and horizon plans can be
-- scoped to a single corridor. Referenced by block_plan_horizons.corridor_id and
-- segments.corridor_id.
create table if not exists corridors (
  id integer generated always as identity primary key,
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamp with time zone default now()
);

create index if not exists corridors_idx_is_active on corridors(is_active)
  where is_active;
