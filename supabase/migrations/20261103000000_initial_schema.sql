create table if not exists public.baby_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.care_logs (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.baby_profiles (id) on delete cascade,
  type text not null check (type in ('feed', 'sleep', 'diaper', 'care')),
  occurred_at timestamptz not null,
  note text check (char_length(note) <= 1000),
  method text check (method in ('Breastfeeding', 'Bottle', 'Solids')),
  amount_ml integer check (amount_ml is null or amount_ml between 0 and 2000),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 600),
  change_type text check (change_type in ('Wet', 'Dirty', 'Wet & dirty', 'Dry')),
  care_label text check (care_label is null or char_length(care_label) between 1 and 60),
  created_at timestamptz not null default now()
);

create index if not exists care_logs_baby_time_idx
  on public.care_logs (baby_id, occurred_at desc);

alter table public.baby_profiles enable row level security;
alter table public.care_logs enable row level security;

drop policy if exists "Users manage their own baby profile" on public.baby_profiles;
create policy "Users manage their own baby profile"
  on public.baby_profiles
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage logs for their own baby" on public.care_logs;
create policy "Users manage logs for their own baby"
  on public.care_logs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.baby_profiles
      where baby_profiles.id = care_logs.baby_id
        and baby_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.baby_profiles
      where baby_profiles.id = care_logs.baby_id
        and baby_profiles.user_id = (select auth.uid())
    )
  );

revoke all on public.baby_profiles from anon, public;
revoke all on public.care_logs from anon, public;
grant select, insert, update, delete on public.baby_profiles to authenticated;
grant select, insert, update, delete on public.care_logs to authenticated;
