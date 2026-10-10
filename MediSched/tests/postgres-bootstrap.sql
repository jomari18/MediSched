-- TEST FIXTURE ONLY. Never apply this file to a Supabase project.
-- Stand-in auth.uid/auth.role/auth.users for an isolated PostgreSQL cluster.
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text unique not null,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
create table public.medisched_test_fixture(marker text primary key);
insert into public.medisched_test_fixture values ('isolated-postgres-auth-fixture');
create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;
