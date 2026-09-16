-- Migration: Add corridor_id to block_plan_horizons so a generated horizon records
-- which corridor it was generated for.
alter table block_plan_horizons add column if not exists corridor_id int references corridors(id);
