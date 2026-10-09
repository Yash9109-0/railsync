-- Add work_done_notes column to execution_logs for optional field worker notes
alter table execution_logs add column if not exists work_done_notes text;

