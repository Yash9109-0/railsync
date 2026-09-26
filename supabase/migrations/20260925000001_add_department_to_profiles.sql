-- Add department field to profiles table for maintenance users
alter table profiles add column if not exists department text check (department in ('TMS','TDMS','SMMS'));

-- Create index for faster lookups
create index if not exists profiles_role_department_idx on profiles(role, department);