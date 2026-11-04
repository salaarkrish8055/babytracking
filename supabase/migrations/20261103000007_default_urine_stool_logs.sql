alter table public.baby_profiles
  alter column quick_log_order set default
    array['feed', 'sleep', 'diaper', 'custom:Urine', 'custom:Stool', 'care']::text[];

alter table public.baby_profiles
  drop constraint if exists baby_profiles_quick_log_order_check;
alter table public.baby_profiles
  add constraint baby_profiles_quick_log_order_check
  check (cardinality(quick_log_order) <= 18);
