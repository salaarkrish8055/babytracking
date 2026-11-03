alter table public.health_records
  add column if not exists deleted_at timestamptz;

create index if not exists health_records_baby_active_date_idx
  on public.health_records (baby_id, occurred_on desc)
  where deleted_at is null;
