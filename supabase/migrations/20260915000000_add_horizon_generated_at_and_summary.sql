-- Migration: extend block_plan_horizons with generated_at + summary_explanation
-- generated_at records when the horizon plan was generated (used for review ordering);
-- summary_explanation stores the AI/optimizer narrative for the generated plan.
alter table block_plan_horizons
  add column if not exists generated_at timestamp,
  add column if not exists summary_explanation text;

-- Backfill existing horizons from created_at where generated_at is not set.
update block_plan_horizons
   set generated_at = created_at
 where generated_at is null;

-- Enforce NOT NULL and a default for future inserts.
alter table block_plan_horizons
  alter column generated_at set not null,
  alter column generated_at set default now();

create index if not exists idx_block_plan_horizons_generated_at on block_plan_horizons (generated_at desc);
