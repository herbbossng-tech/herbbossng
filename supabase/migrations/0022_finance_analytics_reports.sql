-- ============================================================
-- GOLDEN COMMERCE OS — Finance + Analytics + Reporting (0022)
-- Adds no new "orders"/"customers"/"products" tables — Phase 4 is an
-- intelligence layer over data those phases already capture. This
-- migration adds: the finance permission slugs, two small schema
-- extensions needed for honest cost/delivery-cost accounting, and a
-- set of SECURITY INVOKER aggregation RPCs that are the ONLY place
-- Delivered/Pending/Returned/Cancelled revenue, AOV, gross profit and
-- funnel/rate figures are computed. Every screen (Finance, Analytics,
-- Reports, Dashboard) must read these, never re-derive them.
--
-- ---------------------------------------------------------------
-- CENTRAL DEFINITIONS (documented once, here — do not redefine
-- elsewhere):
--
--   total_sales_value / total_orders
--     Every non-CANCELLED order, scoped by created_at (order placed).
--     "Was this a legitimate order?", not "did it get delivered?".
--
--   delivered_revenue / delivered_orders
--     status = DELIVERED and cash_collection_status = 'collected',
--     scoped by delivered_at (when cash was actually realized) — NOT
--     created_at. Matches get_order_stats()'s existing rule exactly
--     (Phase 1), so Dashboard and Finance can never disagree.
--
--   pending_revenue / pending_orders
--     status not in (DELIVERED, RETURNED, CANCELLED), scoped by
--     created_at. "How much value is currently still in the pipeline
--     from orders placed in this period."
--
--   returned_value / returned_orders
--     status = RETURNED, scoped by returned_at.
--
--   cancelled_value / cancelled_orders
--     status = CANCELLED, scoped by cancelled_at.
--
--   average_order_value = total_sales_value / total_orders
--   average_delivered_order_value = delivered_revenue / delivered_orders
--     (both zero-guarded, never divide by zero).
--
--   delivery_success_rate / return_rate / cancellation_rate
--     Reuse get_order_stats()'s existing convention exactly:
--     denominator = delivered + returned + cancelled counts, all
--     drawn from the SAME created_at-scoped population used for
--     total_sales_value/pending_revenue above (so a null date range
--     reproduces get_order_stats() bit-for-bit). This is a DIFFERENT,
--     narrower rate than the funnel conversion rates in
--     get_delivery_funnel_stats() (confirmation/dispatch rate),
--     which describe stage-to-stage progression, not final outcome
--     share — the two are deliberately not the same number and are
--     labelled differently in the UI.
--
--   gross_profit (delivered only)
--     delivered_revenue - cogs_delivered, where cogs_delivered sums
--     orders.cost_amount (the historical, order-time snapshot written
--     by create_order()/create_public_order()) over the same
--     delivered_at-scoped population as delivered_revenue. An
--     order-in-flight or returned/cancelled order never contributes —
--     COD businesses only realize margin on what was actually
--     collected.
--
-- A NULL p_date_from/p_date_to pair means "all time" everywhere below
-- unless a function's own comment says otherwise (get_revenue_trend
-- defaults to a bounded recent window — an unbounded trend chart is
-- not meaningful).
-- ============================================================


-- ---------------------------------------------------------------
-- Finance permission catalogue. Kept deliberately small: this phase
-- has no user-editable finance *records* (no manual adjustments/
-- refunds UI), so there is nothing for finance.create/update/delete
-- to gate yet — view/export/manage mirrors the already-established
-- analytics/reports pattern (view + export only) plus manage for a
-- future finance-configuration screen.
-- ---------------------------------------------------------------
insert into public.permissions (module, action, slug, category, description) values
  ('finance', 'view', 'finance.view', 'Finance', 'View finance dashboards, reports and financial figures'),
  ('finance', 'export', 'finance.export', 'Finance', 'Export finance/report data as CSV'),
  ('finance', 'manage', 'finance.manage', 'Finance', 'Full finance module access')
on conflict (slug) do nothing;

-- Owner/Admin already get every permission via their historical
-- cross-join in 0008 for permissions that existed *then* — that join
-- cannot retroactively pick up rows inserted just above, so grant the
-- three new slugs explicitly to every role that should have them.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and p.slug in ('finance.view', 'finance.export', 'finance.manage')
  and r.slug in ('owner', 'admin')
on conflict do nothing;

-- Manager: operational visibility + export, no finance.manage (mirrors
-- how 0008 excluded action='manage' from the Manager grant).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and p.slug in ('finance.view', 'finance.export')
on conflict do nothing;

-- Finance role: the whole point of this role.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'finance'
  and p.slug in ('finance.view', 'finance.export', 'finance.manage')
on conflict do nothing;

-- Viewer: read-only, consistent with its existing "every action='view'" grant.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer'
  and p.slug = 'finance.view'
on conflict do nothing;

-- Deliberately NOT granted to Customer Support or Warehouse Staff —
-- the spec explicitly calls out that neither should see financial
-- controls just because they can manage orders/inventory.


-- ---------------------------------------------------------------
-- Schema additions.
-- ---------------------------------------------------------------

-- Customer-charged shipping (orders.shipping_fee) already exists.
-- Actual delivery/courier cost does not — never invent it. Nullable,
-- defaults to null (unset), only ever populated where an operator
-- explicitly records it (future delivery/logistics phase or manual
-- entry). Contribution-profit figures only compute where this is
-- non-null for the orders involved; see get_finance_summary's
-- contribution_profit_orders_count for how that's surfaced honestly.
alter table public.orders add column if not exists actual_delivery_cost numeric(14, 2);

comment on column public.orders.actual_delivery_cost is
  'Real courier/logistics cost for this order, distinct from shipping_fee (what the customer was charged). NULL until an operator/future logistics integration records it — never fabricated. Revenue - COGS - actual_delivery_cost = contribution profit, computed only over orders where this is set.';

-- Per-line-item cost snapshot, mirroring order_items.unit_price's
-- "immutable historical snapshot" contract. Both create_order() and
-- create_public_order() already compute per-item product cost into
-- orders.cost_amount (order-level total) — this extends that same
-- computation down to the line-item grain so Product Performance can
-- attribute COGS/margin per product, not just per order. NULL on
-- every row written before this migration (no backfill/guessing —
-- historical orders simply don't carry per-item cost data; Product
-- Performance reports this as a coverage gap, not a fabricated ₦0).
alter table public.order_items add column if not exists unit_cost numeric(14, 2);

comment on column public.order_items.unit_cost is
  'Product cost_price at the time this line item was ordered (NULL if unknown/unset then). Written once, at order-creation, by create_order()/create_public_order() — never recomputed from current product cost, and never backfilled for pre-migration rows.';


-- ---------------------------------------------------------------
-- create_order(): same signature as 0020 — CREATE OR REPLACE, single
-- entrypoint stays singular. Only change: order_items now also
-- carries unit_cost = the priced product's cost_price at order time.
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
  v_workspace_country text;
  v_dial_code text;
  v_order_number text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_is_repeat boolean;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
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

  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select currency_code, country_code into v_currency, v_workspace_country
    from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_workspace_country;

  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select id into v_customer_id from public.customers
    where workspace_id = p_workspace_id and brand_id = p_brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, acquisition_source, created_by, updated_by
    ) values (
      p_workspace_id, p_brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      p_customer_email, v_workspace_country, p_customer_state, p_customer_city, trim(p_customer_address), p_source,
      auth.uid(), auth.uid()
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

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
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2,
    customer_postal_code, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    source_detail, internal_notes, idempotency_key, is_repeat_customer,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_order_number, p_source, 'NEW', coalesce(p_priority, 'normal'),
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), p_customer_email, p_customer_country_code,
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
      quantity, unit_price, unit_cost, compare_price, total_amount
    ) values (
      v_order.id, p_workspace_id, p_brand_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.selling_price, v_product.cost_price, v_product.compare_price, v_product.selling_price * v_quantity
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
  'The only way to create an order. Prices/costs are always read from the live products row server-side. Finds-or-creates the ordering customer by canonical phone and links order.customer_id. Also snapshots order_items.unit_cost for Product Performance COGS attribution.';


-- ---------------------------------------------------------------
-- create_public_order(): same treatment — unit_cost snapshot added
-- to the order_items insert. Signature unchanged from 0021.
-- ---------------------------------------------------------------
create or replace function public.create_public_order(
  p_landing_page_slug text,
  p_package_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_email text default null,
  p_customer_address_2 text default null,
  p_landmark text default null,
  p_customer_notes text default null,
  p_submission_token text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.landing_pages%rowtype;
  v_package public.landing_page_packages%rowtype;
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_dial_code text;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_is_repeat boolean;
  v_order_number text;
  v_shipping numeric;
  v_total numeric;
  v_unit_price numeric;
begin
  select * into v_page from public.landing_pages
    where slug = p_landing_page_slug and status = 'published' and deleted_at is null;
  if not found then
    raise exception 'This page is not available';
  end if;

  select * into v_package from public.landing_page_packages
    where id = p_package_id and landing_page_id = v_page.id and enabled = true;
  if not found then
    raise exception 'This package is not available';
  end if;

  if v_page.product_id is not null then
    select * into v_product from public.products
      where id = v_page.product_id and deleted_at is null;
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Full name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'Phone number is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'Delivery address is required';
  end if;

  if p_submission_token is not null then
    select * into v_existing from public.orders
      where workspace_id = v_page.workspace_id and idempotency_key = p_submission_token;
    if found then
      return v_existing;
    end if;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_page.market_country_code;
  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select id into v_customer_id from public.customers
    where workspace_id = v_page.workspace_id and brand_id = v_page.brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, address_2, landmark, acquisition_source,
      created_by, updated_by
    ) values (
      v_page.workspace_id, v_page.brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      nullif(trim(p_customer_email), ''), v_page.market_country_code, p_customer_state, p_customer_city,
      trim(p_customer_address), p_customer_address_2, p_landmark, 'landing_page',
      null, null
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  v_shipping := public.compute_shipping_fee(v_package.shipping_rule, p_customer_state);
  v_total := v_package.price + v_shipping;

  v_order_number := public.generate_order_number(v_page.workspace_id);
  v_unit_price := case when v_package.quantity > 0 then round(v_package.price / v_package.quantity, 2) else v_package.price end;

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    landing_page_id, source_detail, metadata, idempotency_key, is_repeat_customer,
    created_by, updated_by
  ) values (
    v_page.workspace_id, v_page.brand_id, v_order_number, 'landing_page', 'NEW', 'normal',
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), v_page.market_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2, p_customer_notes,
    v_page.market_currency_code, v_package.price, v_shipping, 0, v_total,
    coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_package.price - coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_page.id, v_page.name,
    jsonb_build_object(
      'landing_page_package_id', v_package.id, 'landmark', p_landmark,
      'utm_source', p_utm_source, 'utm_medium', p_utm_medium, 'utm_campaign', p_utm_campaign,
      'utm_content', p_utm_content, 'utm_term', p_utm_term
    ),
    p_submission_token, v_is_repeat,
    null, null
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, workspace_id, brand_id, product_id, product_name, sku, package_id, package_name,
    quantity, unit_price, unit_cost, compare_price, total_amount, metadata
  ) values (
    v_order.id, v_page.workspace_id, v_page.brand_id, v_page.product_id, coalesce(v_product.name, v_package.name), v_product.sku,
    v_package.id, v_package.name,
    v_package.quantity, v_unit_price, v_product.cost_price, v_package.compare_at_price, v_package.price,
    jsonb_build_object('landing_page_package_id', v_package.id, 'package_name', v_package.name)
  );

  if v_product.id is not null and v_product.track_inventory then
    perform public.adjust_inventory(
      v_product.id, 'RESERVED', v_package.quantity,
      'Order ' || v_order_number || ' created', 'order', v_order.id
    );
  end if;

  return v_order;
end;
$$;

comment on function public.create_public_order(
  text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) is
  'The only way an anonymous visitor can create an order. Price/cost always resolved server-side from landing_page_packages/products — p_package_id carries no price. Also snapshots order_items.unit_cost for Product Performance COGS attribution.';


-- ---------------------------------------------------------------
-- Indexes for the new date-scoped aggregations. delivered_at/
-- created_at/workspace/brand indexes already exist (0013/0019);
-- returned_at and cancelled_at do not.
-- ---------------------------------------------------------------
create index if not exists orders_returned_at_idx on public.orders (returned_at) where returned_at is not null;
create index if not exists orders_cancelled_at_idx on public.orders (cancelled_at) where cancelled_at is not null;


-- ---------------------------------------------------------------
-- get_finance_summary() — the single authoritative KPI aggregation
-- for Finance/Analytics/Dashboard. SECURITY INVOKER (default): a
-- caller without orders.view gets an all-zero row via orders' own RLS,
-- exactly like get_order_stats().
-- ---------------------------------------------------------------
create or replace function public.get_finance_summary(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_sales_value numeric,
  total_orders bigint,
  delivered_revenue numeric,
  delivered_orders bigint,
  pending_revenue numeric,
  pending_orders bigint,
  returned_value numeric,
  returned_orders bigint,
  cancelled_value numeric,
  cancelled_orders bigint,
  average_order_value numeric,
  average_delivered_order_value numeric,
  cogs_delivered numeric,
  gross_profit numeric,
  gross_margin_pct numeric,
  delivery_success_rate numeric,
  return_rate numeric,
  cancellation_rate numeric,
  rate_delivered_count bigint,
  rate_returned_count bigint,
  rate_cancelled_count bigint,
  rate_eligible_count bigint,
  contribution_profit numeric,
  contribution_profit_orders_count bigint
)
language sql
stable
as $$
  with created_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  delivered_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.status = 'DELIVERED' and o.cash_collection_status = 'collected'
      and (p_date_from is null or o.delivered_at >= p_date_from)
      and (p_date_to is null or o.delivered_at <= p_date_to)
  ),
  returned_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.status = 'RETURNED'
      and (p_date_from is null or o.returned_at >= p_date_from)
      and (p_date_to is null or o.returned_at <= p_date_to)
  ),
  cancelled_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.status = 'CANCELLED'
      and (p_date_from is null or o.cancelled_at >= p_date_from)
      and (p_date_to is null or o.cancelled_at <= p_date_to)
  ),
  agg as (
    select
      coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0) as total_sales_value,
      count(*) filter (where status <> 'CANCELLED') as total_orders,
      coalesce(sum(total_amount) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')), 0) as pending_revenue,
      count(*) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')) as pending_orders,
      count(*) filter (where status = 'DELIVERED') as rate_delivered_count,
      count(*) filter (where status = 'RETURNED') as rate_returned_count,
      count(*) filter (where status = 'CANCELLED') as rate_cancelled_count
    from created_scope
  ),
  delivered_agg as (
    select
      coalesce(sum(total_amount), 0) as delivered_revenue,
      count(*) as delivered_orders,
      coalesce(sum(cost_amount), 0) as cogs_delivered,
      coalesce(sum(total_amount - coalesce(cost_amount, 0) - actual_delivery_cost) filter (where actual_delivery_cost is not null), 0) as contribution_profit,
      count(*) filter (where actual_delivery_cost is not null) as contribution_profit_orders_count
    from delivered_scope
  ),
  returned_agg as (
    select coalesce(sum(total_amount), 0) as returned_value, count(*) as returned_orders from returned_scope
  ),
  cancelled_agg as (
    select coalesce(sum(total_amount), 0) as cancelled_value, count(*) as cancelled_orders from cancelled_scope
  )
  select
    agg.total_sales_value,
    agg.total_orders,
    delivered_agg.delivered_revenue,
    delivered_agg.delivered_orders,
    agg.pending_revenue,
    agg.pending_orders,
    returned_agg.returned_value,
    returned_agg.returned_orders,
    cancelled_agg.cancelled_value,
    cancelled_agg.cancelled_orders,
    case when agg.total_orders > 0 then round(agg.total_sales_value / agg.total_orders, 2) else 0 end,
    case when delivered_agg.delivered_orders > 0 then round(delivered_agg.delivered_revenue / delivered_agg.delivered_orders, 2) else 0 end,
    delivered_agg.cogs_delivered,
    delivered_agg.delivered_revenue - delivered_agg.cogs_delivered,
    case when delivered_agg.delivered_revenue > 0
      then round(100.0 * (delivered_agg.delivered_revenue - delivered_agg.cogs_delivered) / delivered_agg.delivered_revenue, 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_delivered_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_returned_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_cancelled_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    agg.rate_delivered_count,
    agg.rate_returned_count,
    agg.rate_cancelled_count,
    (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count),
    delivered_agg.contribution_profit,
    delivered_agg.contribution_profit_orders_count
  from agg, delivered_agg, returned_agg, cancelled_agg;
$$;

comment on function public.get_finance_summary(uuid, uuid, timestamptz, timestamptz) is
  'Authoritative Finance/Analytics KPI aggregation — see the migration header for exact per-metric date-scoping rules. contribution_profit/contribution_profit_orders_count are computed ONLY over delivered orders that have actual_delivery_cost recorded; contribution_profit_orders_count lets the UI show "N of M delivered orders" rather than presenting a partial figure as complete.';


-- ---------------------------------------------------------------
-- get_order_status_value_breakdown() — one row per lifecycle status
-- (fixed order, all 11 always present even at zero), scoped by
-- created_at. "Repeated Order" is a customer tag, not a status, and
-- never appears here.
-- ---------------------------------------------------------------
create or replace function public.get_order_status_value_breakdown(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  status text,
  order_count bigint,
  order_value numeric
)
language sql
stable
as $$
  with statuses(status, sort_order) as (
    values
      ('NEW', 1), ('PENDING', 2), ('WILL_CALL_BACK', 3), ('SCHEDULED', 4),
      ('PROCESSING_FOR_DISPATCH', 5), ('DISPATCHED', 6), ('IN_TRANSIT', 7),
      ('PARTIALLY_DELIVERED', 8), ('DELIVERED', 9), ('RETURNED', 10), ('CANCELLED', 11)
  )
  select
    statuses.status,
    coalesce(count(o.id), 0),
    coalesce(sum(o.total_amount), 0)
  from statuses
  left join public.orders o
    on o.status = statuses.status
    and o.workspace_id = p_workspace_id
    and (p_brand_id is null or o.brand_id = p_brand_id)
    and o.deleted_at is null
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at <= p_date_to)
  group by statuses.status, statuses.sort_order
  order by statuses.sort_order;
$$;

comment on function public.get_order_status_value_breakdown(uuid, uuid, timestamptz, timestamptz) is
  'Order count + value per lifecycle status, scoped by created_at. Always returns all 11 statuses (zero-filled), in lifecycle order.';


-- ---------------------------------------------------------------
-- get_delivery_funnel_stats() — stage counts/values for the COD
-- financial funnel. Population = orders created within range (or
-- all-time); each stage is cumulative ("reached at least this far"),
-- read from CURRENT status, not full history — a returned order that
-- was dispatched still counts in the Dispatched stage. Conversion
-- percentages are deliberately NOT computed here — the frontend
-- divides adjacent stage counts via one shared, zero-guarded utility
-- so every consumer shows the same numerator/denominator pair.
-- ---------------------------------------------------------------
create or replace function public.get_delivery_funnel_stats(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  stage text,
  order_count bigint,
  order_value numeric
)
language sql
stable
as $$
  with scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  )
  select 'CREATED', count(*), coalesce(sum(total_amount), 0) from scope
  union all
  select 'CONFIRMED', count(*), coalesce(sum(total_amount), 0) from scope where status <> 'NEW'
  union all
  select 'DISPATCHED', count(*), coalesce(sum(total_amount), 0) from scope
    where status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED', 'RETURNED')
  union all
  select 'DELIVERED', count(*), coalesce(sum(total_amount), 0) from scope where status = 'DELIVERED'
  union all
  select 'CASH_COLLECTED', count(*), coalesce(sum(total_amount), 0) from scope
    where status = 'DELIVERED' and cash_collection_status = 'collected';
$$;

comment on function public.get_delivery_funnel_stats(uuid, uuid, timestamptz, timestamptz) is
  'COD financial funnel stage counts/values, scoped by created_at, cumulative down the stages. Percentages are computed client-side from adjacent stage counts (see src/lib/financeMath.ts) so the numerator/denominator behind every rate is always visible in the UI.';


-- ---------------------------------------------------------------
-- get_revenue_trend() — day/week/month bucketed sales/delivered/
-- pending revenue. Defaults to the last 30 days when no range is
-- given (an unbounded trend chart is meaningless); the range is
-- always clamped to a sane bucket count.
-- ---------------------------------------------------------------
create or replace function public.get_revenue_trend(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_granularity text default 'day'
)
returns table (
  bucket date,
  sales_value numeric,
  delivered_revenue numeric,
  pending_revenue numeric
)
language plpgsql
stable
as $$
declare
  v_from timestamptz := coalesce(p_date_from, now() - interval '29 days');
  v_to timestamptz := coalesce(p_date_to, now());
  v_step interval;
  v_granularity text := lower(coalesce(p_granularity, 'day'));
begin
  if v_granularity not in ('day', 'week', 'month') then
    v_granularity := 'day';
  end if;
  v_step := case v_granularity when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 day' end;

  return query
  with buckets as (
    select generate_series(date_trunc(v_granularity, v_from), date_trunc(v_granularity, v_to), v_step)::date as bucket
  )
  select
    b.bucket,
    coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null and o.status <> 'CANCELLED'
        and date_trunc(v_granularity, o.created_at) = b.bucket
    ), 0),
    coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null and o.status = 'DELIVERED' and o.cash_collection_status = 'collected'
        and date_trunc(v_granularity, o.delivered_at) = b.bucket
    ), 0),
    coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null and o.status not in ('DELIVERED', 'RETURNED', 'CANCELLED')
        and date_trunc(v_granularity, o.created_at) = b.bucket
    ), 0)
  from buckets b
  order by b.bucket;
end;
$$;

comment on function public.get_revenue_trend(uuid, uuid, timestamptz, timestamptz, text) is
  'Bucketed revenue trend: sales_value/pending_revenue bucketed by created_at, delivered_revenue by delivered_at (a delivery this week for an order placed last week counts in this week''s delivered bar, not last week''s). Defaults to the trailing 30 days when no range given.';


-- ---------------------------------------------------------------
-- get_product_performance() — real product-level sales/delivery/
-- returns/COGS, scoped by order created_at. Stock figures are always
-- the live products row (a point-in-time snapshot has no meaning for
-- "current stock"). cogs_delivered/gross_profit only use order_items
-- rows carrying unit_cost — items_with_cost_data/items_delivered let
-- the UI disclose partial coverage rather than presenting an
-- incomplete figure as exact.
-- ---------------------------------------------------------------
create or replace function public.get_product_performance(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 50
)
returns table (
  product_id uuid,
  product_name text,
  sku text,
  orders_count bigint,
  units_sold bigint,
  sales_value numeric,
  delivered_revenue numeric,
  returned_orders bigint,
  cancelled_orders bigint,
  cancellation_rate numeric,
  stock_quantity integer,
  reserved_quantity integer,
  available_quantity integer,
  cogs_delivered numeric,
  gross_profit numeric,
  gross_margin_pct numeric,
  items_delivered bigint,
  items_with_cost_data bigint
)
language sql
stable
as $$
  with items as (
    select oi.*, o.status, o.cash_collection_status
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.workspace_id = p_workspace_id
      and (p_brand_id is null or oi.brand_id = p_brand_id)
      and o.deleted_at is null
      and oi.product_id is not null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  grouped as (
    select
      items.product_id,
      max(items.product_name) as product_name,
      max(items.sku) as sku,
      count(distinct items.order_id) as orders_count,
      coalesce(sum(items.quantity) filter (where items.status <> 'CANCELLED'), 0) as units_sold,
      coalesce(sum(items.total_amount) filter (where items.status <> 'CANCELLED'), 0) as sales_value,
      coalesce(sum(items.total_amount) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected'), 0) as delivered_revenue,
      count(distinct items.order_id) filter (where items.status = 'RETURNED') as returned_orders,
      count(distinct items.order_id) filter (where items.status = 'CANCELLED') as cancelled_orders,
      coalesce(sum(items.unit_cost * items.quantity) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected' and items.unit_cost is not null), 0) as cogs_delivered,
      count(*) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected') as items_delivered,
      count(*) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected' and items.unit_cost is not null) as items_with_cost_data
    from items
    group by items.product_id
  )
  select
    grouped.product_id,
    grouped.product_name,
    grouped.sku,
    grouped.orders_count,
    grouped.units_sold,
    grouped.sales_value,
    grouped.delivered_revenue,
    grouped.returned_orders,
    grouped.cancelled_orders,
    case when grouped.orders_count > 0 then round(100.0 * grouped.cancelled_orders / grouped.orders_count, 1) else 0 end,
    p.stock_quantity,
    p.reserved_quantity,
    p.available_quantity,
    grouped.cogs_delivered,
    grouped.delivered_revenue - grouped.cogs_delivered,
    case when grouped.delivered_revenue > 0 then round(100.0 * (grouped.delivered_revenue - grouped.cogs_delivered) / grouped.delivered_revenue, 1) else 0 end,
    grouped.items_delivered,
    grouped.items_with_cost_data
  from grouped
  left join public.products p on p.id = grouped.product_id
  order by grouped.sales_value desc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_product_performance(uuid, uuid, timestamptz, timestamptz, integer) is
  'Per-product sales/delivery/return/COGS performance, scoped by order created_at, ordered by sales_value desc. items_with_cost_data vs items_delivered discloses how much of cogs_delivered/gross_profit is backed by real cost data vs. missing unit_cost on older line items.';


-- ---------------------------------------------------------------
-- get_customer_analytics() — reads the trigger-maintained customers
-- summary columns (same source as get_customer_stats()), so figures
-- never disagree with the Customers page. Only new_customers is
-- date-scoped (by customers.created_at) — the rest are deliberately
-- all-time/live snapshots, same "don't collapse an all-time figure
-- via a date filter" rule as Delivered Revenue.
-- ---------------------------------------------------------------
create or replace function public.get_customer_analytics(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_customers bigint,
  new_customers bigint,
  repeat_customers bigint,
  repeat_order_rate numeric,
  avg_orders_per_customer numeric,
  customer_revenue numeric,
  delivered_customer_revenue numeric
)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (
      where (p_date_from is null or created_at >= p_date_from)
        and (p_date_to is null or created_at <= p_date_to)
    ),
    count(*) filter (where is_repeat_customer),
    case when count(*) > 0 then round(100.0 * count(*) filter (where is_repeat_customer) / count(*), 1) else 0 end,
    case when count(*) filter (where total_orders > 0) > 0
      then round(sum(total_orders)::numeric / count(*) filter (where total_orders > 0), 2)
      else 0 end,
    coalesce(sum(total_order_value), 0),
    coalesce(sum(delivered_value), 0)
  from public.customers
  where workspace_id = p_workspace_id
    and (p_brand_id is null or brand_id = p_brand_id)
    and deleted_at is null;
$$;

comment on function public.get_customer_analytics(uuid, uuid, timestamptz, timestamptz) is
  'Customer analytics summary. Only new_customers is scoped to the given date range (by customers.created_at) — total_customers/repeat_customers/customer_revenue etc. are all-time snapshots and must not collapse when a date filter is applied, same rule as Delivered Revenue.';


-- ---------------------------------------------------------------
-- get_landing_page_analytics() — order attribution per landing page,
-- using only first-party data already captured (orders.landing_page_id).
-- No ad-platform/marketing-attribution integration.
-- ---------------------------------------------------------------
create or replace function public.get_landing_page_analytics(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 50
)
returns table (
  landing_page_id uuid,
  landing_page_name text,
  landing_page_slug text,
  orders_count bigint,
  sales_value numeric,
  delivered_revenue numeric,
  pending_revenue numeric,
  returned_orders bigint,
  cancelled_orders bigint,
  average_order_value numeric
)
language sql
stable
as $$
  with scope as (
    select o.*
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.landing_page_id is not null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  grouped as (
    select
      scope.landing_page_id,
      count(*) as orders_count,
      coalesce(sum(scope.total_amount) filter (where scope.status <> 'CANCELLED'), 0) as sales_value,
      coalesce(sum(scope.total_amount) filter (where scope.status = 'DELIVERED' and scope.cash_collection_status = 'collected'), 0) as delivered_revenue,
      coalesce(sum(scope.total_amount) filter (where scope.status not in ('DELIVERED', 'RETURNED', 'CANCELLED')), 0) as pending_revenue,
      count(*) filter (where scope.status = 'RETURNED') as returned_orders,
      count(*) filter (where scope.status = 'CANCELLED') as cancelled_orders,
      count(*) filter (where scope.status <> 'CANCELLED') as non_cancelled_count
    from scope
    group by scope.landing_page_id
  )
  select
    grouped.landing_page_id,
    lp.name,
    lp.slug,
    grouped.orders_count,
    grouped.sales_value,
    grouped.delivered_revenue,
    grouped.pending_revenue,
    grouped.returned_orders,
    grouped.cancelled_orders,
    case when grouped.non_cancelled_count > 0 then round(grouped.sales_value / grouped.non_cancelled_count, 2) else 0 end
  from grouped
  join public.landing_pages lp on lp.id = grouped.landing_page_id
  order by grouped.sales_value desc
  limit greatest(p_limit, 1);
$$;

comment on function public.get_landing_page_analytics(uuid, uuid, timestamptz, timestamptz, integer) is
  'Order attribution per landing page (orders.landing_page_id), scoped by created_at. Orders with no landing page (manual/staff-entered) are excluded, not zero-filled. First-party GCOS data only — no ad-platform integration.';
