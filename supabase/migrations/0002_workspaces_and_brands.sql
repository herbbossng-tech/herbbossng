-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0002
-- Workspaces (tenants) and Brands
-- ============================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code text,
  currency_code text,
  timezone text not null default 'Africa/Lagos',
  logo_url text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.workspaces is
  'Top-level tenant. One Workspace = one country/operational business (e.g. Nigeria, Ghana). Complete data isolation between workspaces.';

create index workspaces_status_idx on public.workspaces (status) where deleted_at is null;
create index workspaces_country_code_idx on public.workspaces (country_code);

create trigger set_workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();


create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  logo_url text,
  domain text,
  theme jsonb not null default '{}'::jsonb,
  meta_pixel_id text,
  meta_capi_access_token text,
  meta_capi_test_event_code text,
  google_analytics_id text,
  google_tag_manager_id text,
  microsoft_clarity_id text,
  email_sender_name text,
  email_sender_address text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  unique (workspace_id, slug)
);

comment on table public.brands is
  'A brand belongs to a workspace and owns its own products, landing pages, pixel/CAPI config, domain and theme. Customers interact with Brands; staff interact with Workspaces.';

create index brands_workspace_id_idx on public.brands (workspace_id) where deleted_at is null;
create index brands_status_idx on public.brands (status);

create trigger set_brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();
