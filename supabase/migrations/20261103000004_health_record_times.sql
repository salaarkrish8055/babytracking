alter table public.health_records
  add column if not exists occurred_time time,
  add column if not exists next_due_time time,
  add column if not exists follow_up_time time;

alter table public.health_records
  drop constraint if exists health_records_next_due_time_check,
  add constraint health_records_next_due_time_check
    check (next_due_time is null or next_due_date is not null),
  drop constraint if exists health_records_follow_up_time_check,
  add constraint health_records_follow_up_time_check
    check (follow_up_time is null or follow_up_date is not null);
