create table notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read boolean default false,
  created_at timestamp with time zone default now()
);

create index notifications_user_id_idx on notifications(user_id);
create index notifications_read_idx on notifications(read);
create index notifications_created_at_idx on notifications(created_at desc);

-- Enable Row Level Security
alter table notifications enable row level security;

-- Users can only see their own notifications
create policy "Users can view own notifications"
  on notifications for select
  using (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
create policy "Users can update own notifications"
  on notifications for update
  using (auth.uid() = user_id);

-- Service role can insert notifications for any user
create policy "Service role can insert notifications"
  on notifications for insert
  with check (true);

-- Enable realtime for notifications
alter publication supabase_realtime add table notifications;