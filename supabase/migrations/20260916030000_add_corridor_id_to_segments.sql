-- Migration: Add corridor_id to segments so block requests and goods-train
-- forecasts can be filtered to a single corridor through the segment relationship.
alter table segments add column if not exists corridor_id integer references corridors(id);

create index if not exists segments_idx_corridor_id on segments(corridor_id)
  where corridor_id is not null;
