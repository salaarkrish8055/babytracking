alter table public.baby_profiles
  add column if not exists custom_log_types text[] not null default '{}'::text[];

alter table public.baby_profiles
  drop constraint if exists baby_profiles_custom_log_types_check;
alter table public.baby_profiles
  add constraint baby_profiles_custom_log_types_check
  check (cardinality(custom_log_types) <= 12);

alter table public.care_logs
  drop constraint if exists care_logs_type_check;
alter table public.care_logs
  add constraint care_logs_type_check
  check (type in ('feed', 'sleep', 'diaper', 'care', 'custom'));

alter table public.care_logs
  drop constraint if exists care_logs_custom_type_label_check;
alter table public.care_logs
  add constraint care_logs_custom_type_label_check
  check (type <> 'custom' or care_label is not null);
