-- ============================================================
-- GOLDEN COMMERCE OS — Order Operations OS, Phase 1 (0017)
-- create_order() — the only way to create an order — and
-- get_order_stats() for KPI/dashboard aggregation.
-- ============================================================

-- SECURITY DEFINER so it can generate the order number, reserve
-- inventory via adjust_inventory(), and write order_items — but it
-- independently checks orders.create itself, and every price comes
-- from the current products row, never from p_items. A client can
-- send whatever unit_price it wants in p_items and this function
-- will simply ignore it.
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
    source_detail, internal_notes, idempotency_key,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_order_number, p_source, 'NEW', coalesce(p_priority, 'normal'),
    trim(p_customer_name), trim(p_customer_phone), p_customer_email, p_customer_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2,
    p_customer_postal_code, p_customer_notes,
    v_currency, v_subtotal, coalesce(p_shipping_fee, 0), coalesce(p_discount_amount, 0), v_total,
    v_cost, v_subtotal - v_cost,
    p_source_detail, p_internal_notes, p_idempotency_key,
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
  'The only way to create an order. Prices are always read from the live products row server-side — p_items only carries product_id and quantity, so a tampered client-submitted price has nothing to attach to.';


-- ---------------------------------------------------------------
-- get_order_stats() — SECURITY INVOKER (the default): relies on the
-- caller's own orders RLS policy, so a user without orders.view simply
-- gets all-zero stats rather than an error, and results are already
-- correctly scoped without duplicating permission logic here.
-- ---------------------------------------------------------------
create or replace function public.get_order_stats(p_workspace_id uuid, p_brand_id uuid default null)
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
  delivered_revenue numeric,
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
    coalesce(sum(total_amount) filter (where status = 'DELIVERED' and cash_collection_status = 'collected'), 0),
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
  'Authoritative order KPI aggregation. delivered_revenue only counts status=DELIVERED with cash_collection_status=collected; pending_revenue is every non-terminal order''s total_amount. Never compute these client-side.';
