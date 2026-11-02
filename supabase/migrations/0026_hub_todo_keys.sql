-- To-dos sent by the hub (finance, author, Ron): each carries where it came
-- from (source, e.g. 'finance') and a key that is the same every time the
-- same problem is reported (e.g. 'categorize-backlog:swb'). Sending the same
-- key again updates the existing to-do instead of adding a duplicate.
-- New, empty columns only; nothing existing changes.
alter table future_tasks add column if not exists source text check (source is null or char_length(source) <= 40);
alter table future_tasks add column if not exists external_key text check (external_key is null or char_length(external_key) <= 100);
alter table items add column if not exists source text check (source is null or char_length(source) <= 40);
alter table items add column if not exists external_key text check (external_key is null or char_length(external_key) <= 100);

create unique index if not exists future_tasks_hub_key_idx
  on future_tasks (blueprint_id, source, external_key) where external_key is not null;
create unique index if not exists items_hub_key_idx
  on items (blueprint_id, source, external_key) where external_key is not null;
