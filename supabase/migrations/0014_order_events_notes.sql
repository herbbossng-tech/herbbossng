-- ============================================================
-- GOLDEN COMMERCE OS — Order Operations OS, Phase 1 (0014)
-- Order timeline (order_events) and operational notes (order_notes)
-- ============================================================

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.order_events is
  'Append-only order timeline: ORDER_CREATED, STATUS_CHANGED, NOTE_ADDED, TAG_ADDED, TAG_REMOVED, ASSIGNED, CASH_COLLECTED. Written exclusively by triggers on orders/order_notes (see 0016) — never inserted directly by the client, and never updated or deleted.';

create index order_events_order_id_idx on public.order_events (order_id, created_at);
create index order_events_workspace_id_idx on public.order_events (workspace_id);


create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  body text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.order_notes is
  'Internal operational notes on an order (e.g. "customer asked for evening delivery"). Phase 1 has no customer-visible note distinction. Each insert fires a NOTE_ADDED order_events row via trigger.';

create index order_notes_order_id_idx on public.order_notes (order_id, created_at);
create index order_notes_workspace_id_idx on public.order_notes (workspace_id);

create trigger set_order_notes_updated_at
  before update on public.order_notes
  for each row execute function public.set_updated_at();
