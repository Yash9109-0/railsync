-- Migration: Add corridor_id to segments table so segments can be scoped to a corridor.
-- Enables the dashboard corridor switcher to filter the maintenance page
-- segment dropdown and the defect/block-request lists by corridor.

alter table segments add column if not exists corridor_id integer references corridors(id);

create index if not exists segments_idx_corridor_id on segments(corridor_id)
  where corridor_id is not null;
