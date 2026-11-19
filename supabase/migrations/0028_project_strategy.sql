-- Project strategy: which of its building's strategy groups an Idea belongs
-- to (key from settings.buildings[].strategies). Null = not sorted yet.
alter table projects
  add column if not exists strategy text;
