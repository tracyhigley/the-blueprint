-- 10-Day Plan (replaces the This Week page): one jsonb blob holding the
-- current plan's start date, each day's picks, and a short list of past plans.
-- The old week_* columns are left in place, unused.
alter table settings
  add column if not exists ten_day_plan jsonb;
