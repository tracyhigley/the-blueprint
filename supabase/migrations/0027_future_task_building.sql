-- Future Tasks can name a building (a key from settings.buildings, e.g. THE_PRESS).
-- Additive only: a new nullable column; existing rows are untouched (all NULL).
alter table future_tasks add column if not exists building text
  check (building is null or char_length(building) <= 60);
