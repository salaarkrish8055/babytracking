create table if not exists public.health_records (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.baby_profiles (id) on delete cascade,
  record_type text not null check (record_type in ('vaccination', 'visit')),
  title text not null check (char_length(title) between 1 and 120),
  occurred_on date not null,
  category text check (category is null or char_length(category) <= 60),
  provider_name text check (provider_name is null or char_length(provider_name) <= 120),
  facility_name text check (facility_name is null or char_length(facility_name) <= 160),
  manufacturer text check (manufacturer is null or char_length(manufacturer) <= 120),
  dose text check (dose is null or char_length(dose) <= 40),
  lot_number text check (lot_number is null or char_length(lot_number) <= 80),
  next_due_date date,
  reason text check (reason is null or char_length(reason) <= 500),
  results text check (results is null or char_length(results) <= 2000),
  follow_up_date date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  constraint health_records_vaccination_details_check check (
    record_type <> 'vaccination'
    or (category is null and reason is null and results is null and follow_up_date is null)
  ),
  constraint health_records_visit_details_check check (
    record_type <> 'visit'
    or (manufacturer is null and dose is null and lot_number is null and next_due_date is null)
  )
);

create index if not exists health_records_baby_date_idx
  on public.health_records (baby_id, occurred_on desc);

create index if not exists health_records_baby_due_idx
  on public.health_records (baby_id, next_due_date)
  where next_due_date is not null;

create index if not exists health_records_baby_follow_up_idx
  on public.health_records (baby_id, follow_up_date)
  where follow_up_date is not null;

alter table public.health_records enable row level security;

drop policy if exists "Users manage health records for their own baby" on public.health_records;
create policy "Users manage health records for their own baby"
  on public.health_records
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.baby_profiles
      where baby_profiles.id = health_records.baby_id
        and baby_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.baby_profiles
      where baby_profiles.id = health_records.baby_id
        and baby_profiles.user_id = (select auth.uid())
    )
  );

revoke all on public.health_records from anon, public;
grant select, insert, update, delete on public.health_records to authenticated;
