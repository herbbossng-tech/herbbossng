-- ============================================================
-- GOLDEN COMMERCE OS — Order Operations OS, Phase 1 hardening (0019)
-- Additive only: extends the source vocabulary, adds structural
-- repeat-customer detection, extends revenue aggregation, adds a
-- day-bucketed aggregate for dashboard trend charts, and rounds out
-- the index set called for by the hardening pass.
-- ============================================================

-- ---------------------------------------------------------------
-- Order sources: add 'manual' (the default for staff-entered
-- WhatsApp/phone orders) and 'affiliate'; drop 'staff', which
-- 'manual' now supersedes. No existing rows use 'staff' — Phase 1
-- has no orders in production yet — so this is a safe replacement,
-- not a destructive migration.
-- ---------------------------------------------------------------
alter table public.orders drop constraint orders_source_check;
alter table public.orders add constraint orders_source_check
  check (source in (
    'website', 'whatsapp', 'phone', 'facebook', 'instagram', 'tiktok',
    'walk_in', 'manual', 'affiliate', 'other'
  ));

-- ---------------------------------------------------------------
-- Repeat-customer detection. Phase 1 has no customers table yet
-- (customer_id on orders is a forward-compatible placeholder), so
-- "repeat" is derived from matching customer_phone within the same
-- brand rather than a foreign-key relationship. This is a plain
-- boolean column, computed once at creation time by create_order()
-- — never a lifecycle status, and never mutated by status-change
-- triggers.
-- ---------------------------------------------------------------
alter table public.orders add column is_repeat_customer boolean not null default false;

comment on column public.orders.is_repeat_customer is
  'true if this brand already had a prior, non-deleted order from the same customer_phone at creation time. Computed once by create_order(); not a status, not recomputed retroactively if earlier orders are later edited.';

-- ---------------------------------------------------------------
-- create_order(): same signature as 0017, extended to compute
-- is_repeat_customer server-side. CREATE OR REPLACE on the existing
-- function rather than a new one, since this is the sole order-
-- creation entrypoint and must stay singular.
-- ---------------------------------------------------------------
create or replace function public.create_order(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_source text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_items jsonb,
  p_customer_email text default null,
  p_customer_country_code text default null,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_address_2 text default null,
  p_customer_postal_code text default null,
  p_customer_notes text default null,
  p_shipping_fee numeric default 0,
  p_discount_amount numeric default 0,
  p_source_detail text default null,
  p_internal_notes text default null,
  p_priority text default 'normal',
  p_idempotency_key text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_currency text;
  v_order_number text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_is_repeat boolean;
  v_phone_digits text;
begin
  if not public.user_has_permission(p_workspace_id, 'orders.create') then
    raise exception 'insufficient_permission: orders.create required';
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'customer_name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'customer_phone is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'customer_address is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
  end if;

  -- Idempotency: a retried submission with the same key returns the
  -- order already created instead of creating a duplicate.
  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select currency_code into v_currency from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  -- Repeat-customer detection: does this brand already have a prior
  -- order from the same phone number? Compare the last 9 digits
  -- rather than the full normalized string — African local numbers
  -- are typically a 9-digit subscriber number after a leading 0 or a
  -- country calling code, so "0801 234 5678" and "+234 801 234 5678"
  -- both reduce to "801234567" and correctly match. This is a
  -- pragmatic heuristic, not full phone-number parsing (no libphonenumber
  -- here) — a genuinely different customer who happens to share a
  -- carrier's last 9 digits internationally is not a realistic
  -- collision within one workspace/brand.
  v_phone_digits := right(regexp_replace(trim(p_customer_phone), '[^0-9]', '', 'g'), 9);
  select exists(
    select 1 from public.orders
    where workspace_id = p_workspace_id
      and brand_id = p_brand_id
      and deleted_at is null
      and right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 9) = v_phone_digits
  ) into v_is_repeat;

  -- Price the order. The client supplies only product_id + quantity in
  -- p_items — unit_price is always read from the live products row.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'quantity must be a positive integer for every order item';
    end if;

    select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid
        and workspace_id = p_workspace_id
        and brand_id = p_brand_id
        and deleted_at is null;
    if not found then
      raise exception 'Product % not found in this brand', v_item ->> 'product_id';
    end if;

    v_subtotal := v_subtotal + v_product.selling_price * v_quantity;
    v_cost := v_cost + coalesce(v_product.cost_price, 0) * v_quantity;
  end loop;

  v_total := v_subtotal + coalesce(p_shipping_fee, 0) - coalesce(p_discount_amount, 0);
  if v_total < 0 then
    raise exception 'Order total cannot be negative';
  end if;

  v_order_number := public.generate_order_number(p_workspace_id);

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2,
    customer_postal_code, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    source_detail, internal_notes, idempotency_key, is_repeat_customer,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_order_number, p_source, 'NEW', coalesce(p_priority, 'normal'),
    trim(p_customer_name), trim(p_customer_phone), p_customer_email, p_customer_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2,
    p_customer_postal_code, p_customer_notes,
    v_currency, v_subtotal, coalesce(p_shipping_fee, 0), coalesce(p_discount_amount, 0), v_total,
    v_cost, v_subtotal - v_cost,
    p_source_detail, p_internal_notes, p_idempotency_key, v_is_repeat,
    auth.uid(), auth.uid()
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    insert into public.order_items (
      order_id, workspace_id, brand_id, product_id, product_name, sku,
      quantity, unit_price, compare_price, total_amount
    ) values (
      v_order.id, p_workspace_id, p_brand_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.selling_price, v_product.compare_price, v_product.selling_price * v_quantity
    );

    if v_product.track_inventory then
      perform public.adjust_inventory(
        v_product.id, 'RESERVED', v_quantity,
        'Order ' || v_order_number || ' created', 'order', v_order.id
      );
    end if;
  end loop;

  return v_order;
end;
$$;

comment on function public.create_order(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text
) is
  'The only way to create an order. Prices are always read from the live products row server-side — p_items only carries product_id and quantity, so a tampered client-submitted price has nothing to attach to. Also computes is_repeat_customer from prior orders with a matching phone number.';

-- ---------------------------------------------------------------
-- get_order_stats(): extended with the three additional revenue
-- metrics the hardening pass calls for. Definitions (documented here
-- because they are easy to conflate):
--
--   total_sales_value    — gross value of every non-cancelled order
--                           (delivered, in-flight, and returned),
--                           all-time. "Was this a legitimate order?"
--                           not "did it get delivered?" — that
--                           distinction is delivered_revenue.
--   today_sales_value    — total_sales_value scoped to orders
--                           created today.
--   today_delivered_revenue — delivered_revenue scoped to orders
--                           *delivered* today (by delivered_at, not
--                           created_at — an order placed yesterday
--                           and delivered today counts today).
--
-- delivered_revenue itself stays all-time/cumulative on purpose: a
-- business with 6 orders delivered yesterday and 0 today must not
-- see Total Delivered Revenue collapse to 0.
-- ---------------------------------------------------------------
-- The output row shape is changing (new columns inserted between
-- existing ones, not just appended), so Postgres requires a drop
-- before recreate rather than a plain CREATE OR REPLACE.
drop function if exists public.get_order_stats(uuid, uuid);

create function public.get_order_stats(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  total_orders bigint,
  today_orders bigint,
  new_count bigint,
  pending_count bigint,
  will_call_back_count bigint,
  scheduled_count bigint,
  processing_count bigint,
  dispatched_count bigint,
  in_transit_count bigint,
  partially_delivered_count bigint,
  delivered_count bigint,
  returned_count bigint,
  cancelled_count bigint,
  total_sales_value numeric,
  today_sales_value numeric,
  delivered_revenue numeric,
  today_delivered_revenue numeric,
  pending_revenue numeric,
  returned_value numeric,
  cancelled_value numeric,
  delivery_success_rate numeric
)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (where created_at >= date_trunc('day', now())),
    count(*) filter (where status = 'NEW'),
    count(*) filter (where status = 'PENDING'),
    count(*) filter (where status = 'WILL_CALL_BACK'),
    count(*) filter (where status = 'SCHEDULED'),
    count(*) filter (where status = 'PROCESSING_FOR_DISPATCH'),
    count(*) filter (where status = 'DISPATCHED'),
    count(*) filter (where status = 'IN_TRANSIT'),
    count(*) filter (where status = 'PARTIALLY_DELIVERED'),
    count(*) filter (where status = 'DELIVERED'),
    count(*) filter (where status = 'RETURNED'),
    count(*) filter (where status = 'CANCELLED'),
    coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0),
    coalesce(sum(total_amount) filter (where status <> 'CANCELLED' and created_at >= date_trunc('day', now())), 0),
    coalesce(sum(total_amount) filter (where status = 'DELIVERED' and cash_collection_status = 'collected'), 0),
    coalesce(sum(total_amount) filter (where status = 'DELIVERED' and cash_collection_status = 'collected' and delivered_at >= date_trunc('day', now())), 0),
    coalesce(sum(total_amount) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')), 0),
    coalesce(sum(total_amount) filter (where status = 'RETURNED'), 0),
    coalesce(sum(total_amount) filter (where status = 'CANCELLED'), 0),
    case
      when count(*) filter (where status in ('DELIVERED', 'RETURNED', 'CANCELLED')) > 0
        then round(100.0 * count(*) filter (where status = 'DELIVERED') / count(*) filter (where status in ('DELIVERED', 'RETURNED', 'CANCELLED')), 1)
      else 0
    end
  from public.orders
  where workspace_id = p_workspace_id
    and (p_brand_id is null or brand_id = p_brand_id)
    and deleted_at is null;
$$;

comment on function public.get_order_stats(uuid, uuid) is
  'Authoritative order KPI aggregation — the single source of order financial metrics for the Dashboard and Orders page alike. delivered_revenue/total_sales_value are all-time and must not be confused with their today_* counterparts. See the migration comment for exact definitions.';

-- ---------------------------------------------------------------
-- get_order_daily_stats(): day-bucketed order volume + delivered
-- revenue, powering the dashboard's trend charts so they stop
-- rendering hardcoded arrays. order_count is bucketed by the day the
-- order was created (submission volume); delivered_revenue is
-- bucketed by the day it was *delivered* (cash-collection trend) —
-- these are deliberately different day dimensions on the same row.
-- ---------------------------------------------------------------
create or replace function public.get_order_daily_stats(p_workspace_id uuid, p_brand_id uuid default null, p_days integer default 7)
returns table (
  day date,
  order_count bigint,
  delivered_revenue numeric
)
language sql
stable
as $$
  with days as (
    select generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day')::date as day
  )
  select
    days.day,
    coalesce((
      select count(*) from public.orders o
      where o.workspace_id = p_workspace_id
        and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null
        and o.created_at >= days.day and o.created_at < days.day + interval '1 day'
    ), 0),
    coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id
        and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null
        and o.status = 'DELIVERED'
        and o.cash_collection_status = 'collected'
        and o.delivered_at >= days.day and o.delivered_at < days.day + interval '1 day'
    ), 0)
  from days
  order by days.day;
$$;

comment on function public.get_order_daily_stats(uuid, uuid, integer) is
  'Day-bucketed order count + delivered revenue for the last p_days days (inclusive of today). Backs the Dashboard revenue/orders trend charts — never hand-roll this aggregation client-side.';

-- ---------------------------------------------------------------
-- Indexes: "recently updated" sorting and the delivered_at-scoped
-- queries introduced above (today_delivered_revenue,
-- get_order_daily_stats) both need support that 0013 didn't add
-- because nothing queried on those columns yet.
-- ---------------------------------------------------------------
create index orders_updated_at_idx on public.orders (updated_at desc);
create index orders_delivered_at_idx on public.orders (delivered_at) where delivered_at is not null;
