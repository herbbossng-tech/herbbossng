-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0006
-- Settings, email templates, API keys, media library
-- ============================================================

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  category text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  unique (workspace_id, brand_id, category, key)
);

comment on table public.settings is
  'Modular key/value settings store. category examples: general, email, notifications, countries, currencies, taxes, shipping, marketing, security, appearance.';

create index settings_workspace_id_idx on public.settings (workspace_id);
create index settings_category_idx on public.settings (category);

create trigger set_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();


create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  key text not null,
  name text not null,
  subject text not null,
  html_body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  unique (workspace_id, brand_id, key)
);

comment on table public.email_templates is
  'Reusable Resend email templates: welcome, password_reset, new_order, order_assigned, order_completed, low_inventory, affiliate_approved, affiliate_withdrawal_approved, daily_summary.';

create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();


create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table public.api_keys is
  'Workspace-scoped API keys. Only key_prefix + key_hash are stored — the raw key is shown once at creation time.';

create index api_keys_workspace_id_idx on public.api_keys (workspace_id);

create trigger set_api_keys_updated_at
  before update on public.api_keys
  for each row execute function public.set_updated_at();


create table public.media_library (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  bucket text not null
    check (bucket in ('products', 'brands', 'landing-pages', 'avatars', 'documents', 'affiliates', 'uploads')),
  file_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  mime_type text,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.media_library is
  'Metadata index over Supabase Storage objects across the products/brands/landing-pages/avatars/documents/affiliates/uploads buckets.';

create index media_library_workspace_id_idx on public.media_library (workspace_id) where deleted_at is null;
create index media_library_bucket_idx on public.media_library (bucket);

create trigger set_media_library_updated_at
  before update on public.media_library
  for each row execute function public.set_updated_at();
