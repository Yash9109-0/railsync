create table if not exists goods_train_forecast (
  id bigint generated always as identity primary key,
  segment_id int references segments(id),
  forecast_date date not null,
  expected_goods_trains int not null default 0,
  peak_hour_start int,
  peak_hour_end int,
  created_at timestamp default now(),
  unique (segment_id, forecast_date)
);

create index if not exists idx_goods_forecast_segment_date
  on goods_train_forecast (segment_id, forecast_date);
