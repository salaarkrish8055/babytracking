alter table public.care_logs
  add column if not exists left_duration_minutes integer
    check (left_duration_minutes is null or left_duration_minutes between 0 and 600),
  add column if not exists right_duration_minutes integer
    check (right_duration_minutes is null or right_duration_minutes between 0 and 600);
