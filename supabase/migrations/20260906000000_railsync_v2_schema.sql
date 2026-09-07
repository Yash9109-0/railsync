-- Migration: Add department + AI plan columns to block_requests, create plan options & segment stats tables, add two-step execution log fields

-- New fields on block_requests for department + text the AI will read
alter table block_requests add column if not exists department text check (department in ('TMS','TDMS','SMMS'));
alter table block_requests add column if not exists work_description text;
alter table block_requests add column if not exists justification text;

-- Stores the 3 AI-generated plan options per request
create table if not exists block_plan_options (
  id uuid default gen_random_uuid() primary key,
  block_request_id uuid references block_requests(id),
  option_label text,
  adjusted_start timestamp,
  adjusted_duration_mins int,
  priority_score float,
  delay_risk text,
  is_recommended boolean default false,
  explanation text,
  what_if_note text,
  created_at timestamp default now()
);

-- Real, auto-updating stats per segment+work_type, fed by actual field results
create table if not exists segment_stats (
  segment_id int references segments(id),
  work_type text,
  historical_overrun_rate float default 0.15,
  sample_count int default 0,
  last_updated timestamp default now(),
  primary key (segment_id, work_type)
);

-- Field crews now do Start Work and Complete Work as two separate steps
alter table execution_logs add column if not exists status text default 'in_progress';
alter table execution_logs add column if not exists verified boolean default false;
