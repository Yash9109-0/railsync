-- Migration: Create defects table for the Defect Register
create table if not exists defects (
  id uuid default gen_random_uuid() primary key,
  segment_id int references segments(id),
  department text check (department in ('TMS','TDMS','SMMS')),
  asset_description text,
  work_description text,
  justification text,
  defect_type text,
  severity text check (severity in ('low','medium','high','critical')),
  due_date date,
  requested_start timestamp,
  requested_duration_mins int,
  status text check (status in ('open','block_requested','in_progress','resolved')) default 'open',
  linked_block_request_id uuid references block_requests(id),
  created_by uuid,
  created_at timestamp default now()
);

create index if not exists idx_defects_status on defects(status);
create index if not exists idx_defects_status_due_date on defects(status, due_date);
create index if not exists idx_defects_linked_block_request on defects(linked_block_request_id);
