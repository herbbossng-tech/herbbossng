-- ============================================================
-- GOLDEN COMMERCE OS — Order Operations OS, Phase 1 (0013)
-- Core tables: orders, order_items, order number generation,
-- and the status-transition rulebook.
-- ============================================================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  order_number text not null,
  source text not null default 'website'
    check (source in ('website', 'whatsapp', 'phone', 'facebook', 'instagram', 'tiktok', 'walk_in', 'staff', 'other')),
  status text not null default 'NEW'
    check (status in (
      'NEW', 'PENDING', 'WILL_CALL_BACK', 'SCHEDULED', 'PROCESSING_FOR_DISPATCH',
      'DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED', 'RETURNED', 'CANCELLED'
    )),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),

  -- Customer snapshot. Orders never join out to a customers table for
  -- display — Phase 1 doesn't have one yet, and even once it exists an
  -- order should keep showing exactly what the customer told us at the
  -- time, not whatever the customer record has been edited to since.
  customer_id uuid,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_country_code text,
  customer_state text,
  customer_city text,
  customer_address text not null,
  customer_address_2 text,
  customer_postal_code text,
  customer_notes text,

  -- Financial snapshot — always server-computed, never trust client totals.
  currency_code text not null,
  subtotal numeric(14, 2) not null default 0,
  shipping_fee numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null,
  cost_amount numeric(14, 2),
  expected_profit numeric(14, 2),

  -- COD collection.
  payment_method text not null default 'cash_on_delivery',
  cash_collection_status text not null default 'pending'
    check (cash_collection_status in ('pending', 'collected', 'failed', 'partial')),
  cash_collected_amount numeric(14, 2),
  cash_collected_at timestamptz,

  -- Attribution — light, operational only. No ROAS/marketing-attribution
  -- system in this phase; landing_page_id is a plain uuid (no FK yet,
  -- that table doesn't exist) so Phase 3 can backfill the relationship.
  landing_page_id uuid,
  source_detail text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,

  -- Operational.
  -- References profiles (not auth.users directly, unlike created_by/
  -- updated_by elsewhere) so PostgREST can embed the assignee's profile
  -- in a single query (`assigned_profile:profiles(email)`).
  assigned_to uuid references public.profiles (id),
  scheduled_at timestamptz,
  callback_at timestamptz,
  confirmed_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  return_reason text,

  internal_notes text,
  tags text[] not null default '{}',

  -- Idempotency: a client-generated key so a retried submission (flaky
  -- network, double-tap) can't create a duplicate order.
  idempotency_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.orders is
  'The COD order lifecycle record. status drives fulfillment; cash_collection_status drives revenue recognition — see get_order_stats() for the authoritative revenue rule.';

create unique index orders_workspace_order_number_unique_idx on public.orders (workspace_id, order_number);
create unique index orders_idempotency_key_unique_idx
  on public.orders (workspace_id, idempotency_key) where idempotency_key is not null;

create index orders_workspace_id_idx on public.orders (workspace_id) where deleted_at is null;
create index orders_brand_id_idx on public.orders (brand_id) where deleted_at is null;
create index orders_customer_phone_idx on public.orders (customer_phone);
create index orders_status_idx on public.orders (status) where deleted_at is null;
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_customer_id_idx on public.orders (customer_id) where customer_id is not null;
create index orders_assigned_to_idx on public.orders (assigned_to) where assigned_to is not null;
create index orders_scheduled_at_idx on public.orders (scheduled_at) where scheduled_at is not null;
-- Covers the default list view: "this brand's orders, newest first".
create index orders_workspace_brand_created_idx on public.orders (workspace_id, brand_id, created_at desc) where deleted_at is null;
create index orders_workspace_brand_status_idx on public.orders (workspace_id, brand_id, status) where deleted_at is null;

create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();


create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- Denormalized for RLS + indexing, same convention as inventory_transactions.
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  sku text,
  package_id uuid,
  package_name text,

  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  compare_price numeric(14, 2),
  discount_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null,
  free_quantity integer,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.order_items is
  'Immutable historical snapshot of what was ordered and at what price. Never re-read from products for display — if the product price changes later, existing orders must not change. Rows are only ever written by public.create_order(); there is no client insert/update policy.';

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id) where product_id is not null;
create index order_items_workspace_id_idx on public.order_items (workspace_id);


-- ---------------------------------------------------------------
-- Order number generation: unique, human-readable, concurrency-safe,
-- workspace/country-aware, generated server-side only.
-- ---------------------------------------------------------------
create table public.order_number_counters (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prefix text not null,
  next_value bigint not null default 1,
  primary key (workspace_id, prefix)
);

comment on table public.order_number_counters is
  'Backing store for generate_order_number(). One row per (workspace, prefix); incremented atomically via INSERT ... ON CONFLICT DO UPDATE, which takes a row lock and is safe under concurrent order creation.';

create or replace function public.generate_order_number(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text;
  v_prefix text;
  v_next bigint;
begin
  select coalesce(country_code, 'XX') into v_country
  from public.workspaces where id = p_workspace_id;

  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  v_prefix := 'GC-' || upper(v_country);

  insert into public.order_number_counters (workspace_id, prefix, next_value)
  values (p_workspace_id, v_prefix, 2)
  on conflict (workspace_id, prefix)
    do update set next_value = public.order_number_counters.next_value + 1
  returning next_value - 1 into v_next;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

comment on function public.generate_order_number(uuid) is
  'Atomically issues the next order number for a workspace, e.g. GC-NG-000001. Never generate order numbers client-side.';


-- ---------------------------------------------------------------
-- The central status transition rulebook — a real table, not a
-- hardcoded list buried in application code, so it's inspectable
-- and the enforcing trigger (0016) can query it directly.
-- ---------------------------------------------------------------
create table public.order_status_transitions (
  from_status text not null,
  to_status text not null,
  -- Transitions into these statuses touch revenue/inventory, so the
  -- enforcing trigger additionally requires orders.approve, not just
  -- orders.update, before allowing them.
  requires_approval boolean not null default false,
  primary key (from_status, to_status)
);

comment on table public.order_status_transitions is
  'The only legal order.status transitions. Enforced by a BEFORE UPDATE trigger (see 0016) — a plain client UPDATE cannot set an arbitrary status.';

insert into public.order_status_transitions (from_status, to_status, requires_approval) values
  -- Primary COD lifecycle.
  ('NEW', 'PENDING', false),
  ('PENDING', 'WILL_CALL_BACK', false),
  ('WILL_CALL_BACK', 'SCHEDULED', false),
  ('SCHEDULED', 'PROCESSING_FOR_DISPATCH', false),
  ('PROCESSING_FOR_DISPATCH', 'DISPATCHED', false),
  ('DISPATCHED', 'IN_TRANSIT', false),
  ('IN_TRANSIT', 'PARTIALLY_DELIVERED', false),
  ('PARTIALLY_DELIVERED', 'DELIVERED', true),
  -- Operational exceptions explicitly called for by the spec.
  ('PENDING', 'SCHEDULED', false),
  ('PENDING', 'CANCELLED', true),
  ('WILL_CALL_BACK', 'PENDING', false),
  ('WILL_CALL_BACK', 'CANCELLED', true),
  ('SCHEDULED', 'CANCELLED', true),
  ('PROCESSING_FOR_DISPATCH', 'CANCELLED', true),
  ('IN_TRANSIT', 'DELIVERED', true),
  ('DISPATCHED', 'RETURNED', true),
  ('IN_TRANSIT', 'RETURNED', true),
  ('PARTIALLY_DELIVERED', 'RETURNED', true),
  -- Reasonable operational allowance not explicitly enumerated by the
  -- spec but clearly required: reject a brand-new junk/duplicate
  -- submission immediately without forcing it through PENDING first.
  ('NEW', 'CANCELLED', true);
