-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0003
-- Profiles + dynamic Role-Based Access Control
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  email text not null,
  phone text,
  avatar_url text,
  department text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended', 'invited')),
  last_login_at timestamptz,
  default_workspace_id uuid references public.workspaces (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.profiles is
  'Extends auth.users with application-level profile data. One row per user, created on signup.';

create index profiles_status_idx on public.profiles (status);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth.users row appears.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------
-- Roles: dynamic, workspace-scoped. workspace_id null = system
-- template role available to every workspace as a starting point.
-- ---------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  unique (workspace_id, slug)
);

comment on table public.roles is
  'Dynamic roles. Never hardcode role checks in application code — always resolve via role_permissions.';

create index roles_workspace_id_idx on public.roles (workspace_id) where deleted_at is null;

create trigger set_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- Permissions: global catalogue of module.action pairs.
-- Managed by migrations only — not editable by tenants.
-- ---------------------------------------------------------------
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null,
  slug text not null unique,
  category text,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.permissions is
  'Global catalogue of grantable permissions, e.g. orders.view, orders.assign, affiliates.approve.';

create index permissions_module_idx on public.permissions (module);


create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (role_id, permission_id)
);

create index role_permissions_role_id_idx on public.role_permissions (role_id);
create index role_permissions_permission_id_idx on public.role_permissions (permission_id);


-- ---------------------------------------------------------------
-- User Roles: assigns a role to a user within a workspace
-- (optionally scoped further to a single brand).
-- ---------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table public.user_roles is
  'Grants a Role to a User inside a Workspace. A user can hold multiple roles across multiple workspaces.';

create unique index user_roles_unique_grant_idx
  on public.user_roles (user_id, role_id, workspace_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'));
create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_workspace_id_idx on public.user_roles (workspace_id);


-- ---------------------------------------------------------------
-- Helper functions used throughout RLS policies.
-- ---------------------------------------------------------------
create or replace function public.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct workspace_id
  from public.user_roles
  where user_id = auth.uid();
$$;

comment on function public.user_workspace_ids() is
  'Workspace IDs the current authenticated user belongs to. Core building block for workspace-isolation RLS policies.';

create or replace function public.user_has_permission(p_workspace_id uuid, p_permission_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.workspace_id = p_workspace_id
      and p.slug = p_permission_slug
  );
$$;

comment on function public.user_has_permission(uuid, text) is
  'True if the current authenticated user holds a role in p_workspace_id granting p_permission_slug (e.g. "orders.approve").';
