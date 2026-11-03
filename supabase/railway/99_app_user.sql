-- Railway only. Runs AFTER migrations: lets the limited app_user role use the
-- tables (row-level rules still apply to it) and read who it is. The login
-- view exposes only what the sign-in route needs; app_user can't see it.
grant authenticated to app_user;
grant usage on schema public to app_user;
grant usage on schema auth to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant execute on all functions in schema public to app_user;
grant execute on function auth.uid() to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
create or replace view public.users_login as select id, email, password_hash from auth.users;
revoke all on public.users_login from app_user, authenticated, anon;
