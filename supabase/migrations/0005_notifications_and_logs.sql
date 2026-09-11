-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0005
-- Notifications, audit logs, system logs, activity logs
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  link text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.notifications is
  'user_id = null means a workspace-wide broadcast notification. Powers the dashboard notification center and (future) realtime/email/WhatsApp/SMS/push fan-out.';

create index notifications_workspace_id_idx on public.notifications (workspace_id);
create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_unread_idx on public.notifications (workspace_id, user_id) where is_read = false and is_archived = false;


-- ---------------------------------------------------------------
-- Audit logs: append-only. Nothing happens silently.
-- No updated_at / no update or delete RLS policy — writes are
-- permanent. Only the service role (Super Admin tooling) can
-- purge rows, bypassing RLS entirely.
-- ---------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  user_id uuid references auth.users (id),
  module text not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  device text,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Immutable record of every important action: who, workspace, brand, module, action, before/after values, IP, browser, device, timestamp.';

create index audit_logs_workspace_id_idx on public.audit_logs (workspace_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);


create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info'
    check (level in ('debug', 'info', 'warning', 'error', 'critical')),
  source text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  workspace_id uuid references public.workspaces (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.system_logs is
  'Infrastructure/system-level log stream (edge functions, webhooks, cron jobs) — distinct from business audit_logs.';

create index system_logs_level_idx on public.system_logs (level);
create index system_logs_created_at_idx on public.system_logs (created_at desc);


create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id),
  activity_type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

comment on table public.activity_logs is
  'Lightweight user activity stream (logins, views, staff status) — feeds "Recent Activities" widgets.';

create index activity_logs_workspace_id_idx on public.activity_logs (workspace_id);
create index activity_logs_user_id_idx on public.activity_logs (user_id);
