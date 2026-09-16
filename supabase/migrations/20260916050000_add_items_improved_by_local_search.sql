-- Migration: record the number of swaps performed by the local-search
-- improvement pass so the optimizer's benefit is visible and auditable
-- on each generated horizon (see lib/optimizer.ts `allocateHorizon`).
alter table block_plan_horizons add column if not exists items_improved_by_local_search int default 0;
