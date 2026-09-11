-- Minimal stand-in for what a real Supabase project provides for free
-- (auth/storage schemas, the authenticated/anon/service_role roles,
-- and a session-impersonation hook for auth.uid()), so the migration
-- chain and the regression suite in this directory can run against a
-- plain local/CI Postgres 16 server with no Supabase project at all.
--
-- Not a re-implementation of Supabase — just enough surface for the
-- application's own migrations (which only ever reference
-- auth.users/auth.uid() and storage.buckets/storage.objects) to apply
-- and be exercised.
--
-- Runs BEFORE the migration chain (roles/schemas the migrations'
-- foreign keys need must exist first). Table-level grants for
-- authenticated/anon are deliberately NOT here — see
-- 00_bootstrap_post_migration.sql for why they must come after.
create extension if not exists pgcrypto;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(name, '/');
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end
$$;

-- auth.uid() reads a session GUC (app.test_user_id) rather than a real
-- Supabase JWT, so a test file impersonates a user with:
--   select set_config('app.test_user_id', '<uuid>', false);
--   set role authenticated;
-- This is the CURRENT convention every test file in this directory
-- uses. (An older convention based on request.jwt.claim.sub exists in
-- a handful of pre-Phase-9 smoke tests that were never migrated to
-- this GUC — see README.md for why those are not part of this
-- directory's CI-run set.)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.test_user_id', true), '')::uuid;
$$;

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema auth, storage, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
grant select on storage.buckets to authenticated, anon;
grant select on auth.users to authenticated;
