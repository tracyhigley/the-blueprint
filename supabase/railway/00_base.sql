-- Railway only. Runs BEFORE migrations 0001+: stands in for the pieces
-- Supabase used to provide (the auth schema, auth.uid(), and its roles).
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  password_hash text,
  created_at timestamptz not null default now()
);
-- Who is asking, as set by the app at the start of each request.
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then create role app_user nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
