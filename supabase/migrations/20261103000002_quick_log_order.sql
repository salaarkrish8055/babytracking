alter table public.baby_profiles
  add column if not exists quick_log_order text[] not null
  default array['feed', 'sleep', 'diaper', 'care']::text[];

alter table public.baby_profiles
  drop constraint if exists baby_profiles_quick_log_order_check;
alter table public.baby_profiles
  add constraint baby_profiles_quick_log_order_check
  check (cardinality(quick_log_order) <= 16);
