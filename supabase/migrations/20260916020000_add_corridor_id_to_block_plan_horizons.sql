-- Migration: Add corridor_id to block_plan_horizons so generated plans can be
-- scoped to a corridor and the planning calendar can filter past horizons by
-- the currently selected corridor.
alter table block_plan_horizons add column if not exists corridor_id integer references corridors(id);

create index if not exists idx_block_plan_horizons_corridor_id on block_plan_horizons (corridor_id)
  where corridor_id is not null;
