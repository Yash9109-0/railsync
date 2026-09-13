-- Migration: Create block_plan_horizons (horizon anchor) and block_plan_horizon_items (per-request schedule lines)
create table if not exists block_plan_horizons (
  id uuid default gen_random_uuid() primary key,
  horizon_type text not null check (horizon_type in ('weekly', 'monthly')),
  horizon_start timestamp not null,
  horizon_end timestamp not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  projected_availability_pct float default 0,
  created_at timestamp default now()
);

create table if not exists block_plan_horizon_items (
  id uuid default gen_random_uuid() primary key,
  horizon_id uuid references block_plan_horizons(id) on delete cascade,
  block_request_id uuid references block_requests(id),
  assigned_date date,
  assigned_start_hour numeric,
  assigned_duration_mins int,
  priority_score float,
  status text not null check (status in ('scheduled', 'deferred')),
  reason text,
  created_at timestamp default now()
);

create index if not exists idx_block_plan_horizons_status on block_plan_horizons (status);
create index if not exists idx_block_plan_horizons_start on block_plan_horizons (horizon_start);
create index if not exists idx_horizon_items_horizon on block_plan_horizon_items (horizon_id);
create index if not exists idx_horizon_items_status on block_plan_horizon_items (status);
create index if not exists idx_horizon_items_request on block_plan_horizon_items (block_request_id);
