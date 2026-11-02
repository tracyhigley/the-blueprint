-- Rename the "vault" concept to "blueprint" throughout the schema.
-- Tables, columns, enum type, helper functions, RLS policy names,
-- constraint/index names, defaults, and the existing row's display name.
-- RLS policies reference tables/columns/functions by OID, so they keep
-- working through the renames; only the SQL-function bodies (stored as
-- text) need recreating.

begin;

-- Tables + enum type
alter table public.vaults        rename to blueprints;
alter table public.vault_members rename to blueprint_members;
alter type  public.vault_role    rename to blueprint_role;

-- vault_id -> blueprint_id on every table that has it
do $$
declare r record;
begin
  for r in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'vault_id'
  loop
    execute format('alter table public.%I rename column vault_id to blueprint_id', r.table_name);
  end loop;
end $$;

-- Helper functions: rename (keeps OIDs so policies follow), then rewrite bodies
alter function public.current_vault_id()          rename to current_blueprint_id;
alter function public.is_vault_member(uuid, uuid) rename to is_blueprint_member;
alter function public.is_vault_owner(uuid, uuid)  rename to is_blueprint_owner;

create or replace function public.current_blueprint_id()
 returns uuid
 language sql
 stable
as $function$
  select bm.blueprint_id
  from blueprint_members bm
  where bm.user_id = auth.uid()
  order by bm.created_at desc
  limit 1;
$function$;

create or replace function public.is_blueprint_member(v uuid, u uuid default auth.uid())
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from blueprint_members where blueprint_id = v and user_id = u
  );
$function$;

create or replace function public.is_blueprint_owner(v uuid, u uuid default auth.uid())
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from blueprints where id = v and owner_id = u
  );
$function$;

-- Policy names
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and policyname ilike '%vault%'
  loop
    execute format('alter policy %I on public.%I rename to %I',
      r.policyname, r.tablename, replace(r.policyname, 'vault', 'blueprint'));
  end loop;
end $$;

-- Constraint names (renaming a pkey constraint also renames its index)
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname from pg_constraint
    where connamespace = 'public'::regnamespace and conname ilike '%vault%'
  loop
    execute format('alter table %s rename constraint %I to %I',
      r.tbl, r.conname, replace(r.conname, 'vault', 'blueprint'));
  end loop;
end $$;

-- Remaining index names
do $$
declare r record;
begin
  for r in
    select indexname from pg_indexes
    where schemaname = 'public' and indexname ilike '%vault%'
  loop
    execute format('alter index public.%I rename to %I',
      r.indexname, replace(r.indexname, 'vault', 'blueprint'));
  end loop;
end $$;

-- Defaults + data
alter table public.blueprints alter column name set default 'The Blueprint';
update public.blueprints set name = 'The Blueprint' where name = 'The Vault';

commit;
