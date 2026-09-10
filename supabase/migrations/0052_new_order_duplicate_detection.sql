-- ============================================================
-- GOLDEN COMMERCE OS — possible-duplicate-order detection for the
-- "New Order Received" staff notification (0051).
--
-- Nothing in GCOS previously detected this: idempotency_key only
-- protects against a literal retry of the SAME form submission
-- (double-click, network retry) — it says nothing about a customer
-- genuinely submitting TWO separate orders minutes apart (a second
-- page load after being unsure the first one went through, a staff
-- member re-keying an order they already logged, etc). This
-- migration adds that check and surfaces it as a plain-text line in
-- the new_order email so staff can see it without opening the order.
--
-- Definition used: the same customer (matched by customer_id — the
-- same canonical-phone matching create_order()/create_public_order()
-- already use to find-or-create the customer) already has another
-- non-cancelled, non-returned order placed within the last 24 hours.
-- This is deliberately broader than "identical items" — a confused
-- customer who orders twice is the case staff actually want flagged,
-- regardless of whether the second cart matches the first exactly.
-- It is also deliberately narrower than is_repeat_customer (any
-- prior order, ever) — a customer reordering next month is not a
-- duplicate, so this must never reuse that flag.
--
-- Where the check runs: inside create_order()/create_public_order(),
-- BEFORE the new order is inserted (so "another order" always means
-- a DIFFERENT, already-committed order, never the one being created)
-- and stashed onto the new order's own metadata at insert time — the
-- same pattern 0051 used for item_summary/item_quantity, for the
-- same reason: the orders.created automation event is processed
-- synchronously from an AFTER INSERT trigger, so anything a template
-- needs must already be on the order row itself.
-- ============================================================


-- ----------------------------------------------------------------
-- PART A — create_order(): flag a possible duplicate in metadata.
-- Signature/body otherwise identical to 0051.
-- ----------------------------------------------------------------
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
  p_idempotency_key text default null,
  p_affiliate_referral_code text default null
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
  v_affiliate public.affiliates%rowtype;
  v_affiliate_id uuid;
  v_campaign_id uuid;
  v_item_summary text[] := '{}';
  v_item_quantity integer := 0;
  -- 0052 additions:
  v_dup_order_number text;
  v_dup_created_at timestamptz;
  v_possible_duplicate boolean := false;
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

  if coalesce(trim(p_affiliate_referral_code), '') <> '' then
    select * into v_affiliate from public.affiliates
      where workspace_id = p_workspace_id and referral_code = upper(trim(p_affiliate_referral_code))
        and approval_status = 'approved' and status = 'active' and deleted_at is null;
    if found then
      v_affiliate_id := v_affiliate.id;
    end if;
  end if;

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

  -- 0052: possible-duplicate check — see this file's header comment
  -- for the exact definition. Runs before this order exists, so any
  -- match is necessarily a different, already-committed order.
  select o.order_number, o.created_at into v_dup_order_number, v_dup_created_at
    from public.orders o
    where o.customer_id = v_customer_id and o.deleted_at is null
      and o.status not in ('CANCELLED', 'RETURNED')
      and o.created_at > now() - interval '24 hours'
    order by o.created_at desc
    limit 1;
  v_possible_duplicate := found;

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
    v_item_summary := array_append(v_item_summary, v_product.name || ' x' || v_quantity);
    v_item_quantity := v_item_quantity + v_quantity;
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
    affiliate_id, affiliate_referral_code_used,
    metadata,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_order_number, p_source, 'NEW', coalesce(p_priority, 'normal'),
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), p_customer_email, p_customer_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2,
    p_customer_postal_code, p_customer_notes,
    v_currency, v_subtotal, coalesce(p_shipping_fee, 0), coalesce(p_discount_amount, 0), v_total,
    v_cost, v_subtotal - v_cost,
    p_source_detail, p_internal_notes, p_idempotency_key, v_is_repeat,
    v_affiliate_id, case when v_affiliate_id is not null then upper(trim(p_affiliate_referral_code)) else null end,
    jsonb_build_object(
      'item_summary', array_to_string(v_item_summary, ', '), 'item_quantity', v_item_quantity,
      'possible_duplicate', v_possible_duplicate,
      'duplicate_of_order_number', v_dup_order_number,
      'duplicate_minutes_ago', case when v_possible_duplicate then round(extract(epoch from (now() - v_dup_created_at)) / 60) else null end
    ),
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

  -- Affiliate campaign resolution: only once order_items exist (need
  -- the ordered product set). ALL_APPROVED_AFFILIATES campaigns
  -- accept any approved+active affiliate; SELECTED_AFFILIATES_ONLY
  -- campaigns require an explicit ACCESS grant for this affiliate.
  -- Most recently created matching ACTIVE campaign wins on overlap.
  if v_affiliate_id is not null then
    select c.id into v_campaign_id
      from public.affiliate_campaigns c
      where c.workspace_id = p_workspace_id
        and c.brand_id = p_brand_id
        and c.status = 'ACTIVE'
        and c.deleted_at is null
        and (c.start_at is null or c.start_at <= now())
        and (c.end_at is null or c.end_at >= now())
        and (
          c.affiliate_access = 'ALL_APPROVED_AFFILIATES'
          or exists (
            select 1 from public.affiliate_campaign_affiliates ca
            where ca.campaign_id = c.id and ca.affiliate_id = v_affiliate_id and ca.relationship = 'ACCESS'
          )
        )
        and exists (
          select 1 from public.affiliate_campaign_products cp
          join public.order_items oi on oi.product_id = cp.product_id
          where cp.campaign_id = c.id and oi.order_id = v_order.id
        )
      order by c.created_at desc
      limit 1;

    if v_campaign_id is not null then
      update public.orders set affiliate_campaign_id = v_campaign_id where id = v_order.id
        returning * into v_order;

      perform public.process_affiliate_commission(v_order.id);
    end if;
  end if;

  return v_order;
end;
$$;

comment on function public.create_order(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text
) is
  'The only way to create an order. Prices/costs are always read from the live products row server-side. Finds-or-creates the ordering customer by canonical phone and links order.customer_id. Snapshots order_items.unit_cost for Product Performance COGS attribution. Resolves an optional affiliate referral code and, once order_items exist, the best-matching ACTIVE campaign — firing the commission engine immediately for PER_ORDER_CREATED campaigns. metadata.item_summary/item_quantity (0051) are computed from p_items before the orders insert so an orders.created automation action can read what was ordered without racing order_items. metadata.possible_duplicate/duplicate_of_order_number/duplicate_minutes_ago (0052): true when this same customer already has another non-cancelled/non-returned order from the last 24 hours — surfaced in the new_order staff notification, never blocks order creation.';


-- ----------------------------------------------------------------
-- PART B — create_public_order(): same check, same reasoning.
-- Signature/body otherwise identical to 0051.
-- ----------------------------------------------------------------
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
  p_utm_term text default null,
  p_fbclid text default null,
  p_ttclid text default null,
  p_affiliate_referral_code text default null
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
  v_affiliate public.affiliates%rowtype;
  v_affiliate_id uuid;
  -- 0052 additions:
  v_dup_order_number text;
  v_dup_created_at timestamptz;
  v_possible_duplicate boolean := false;
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
  if coalesce(trim(p_customer_city), '') = '' then
    raise exception 'City is required';
  end if;
  if coalesce(trim(p_customer_state), '') = '' then
    raise exception 'State/Region is required';
  end if;

  if p_submission_token is not null then
    select * into v_existing from public.orders
      where workspace_id = v_page.workspace_id and idempotency_key = p_submission_token;
    if found then
      return v_existing;
    end if;
  end if;

  -- Same affiliate-resolution pattern as create_order() (0024): a
  -- referral code that doesn't resolve to an approved/active affiliate
  -- in THIS workspace is silently ignored (v_affiliate_id stays null)
  -- rather than rejecting the order — an invalid/expired ?ref= code
  -- must never block a real customer from checking out.
  if coalesce(trim(p_affiliate_referral_code), '') <> '' then
    select * into v_affiliate from public.affiliates
      where workspace_id = v_page.workspace_id and referral_code = upper(trim(p_affiliate_referral_code))
        and approval_status = 'approved' and status = 'active' and deleted_at is null;
    if found then
      v_affiliate_id := v_affiliate.id;
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

  -- 0052: possible-duplicate check — see this file's header comment.
  select o.order_number, o.created_at into v_dup_order_number, v_dup_created_at
    from public.orders o
    where o.customer_id = v_customer_id and o.deleted_at is null
      and o.status not in ('CANCELLED', 'RETURNED')
      and o.created_at > now() - interval '24 hours'
    order by o.created_at desc
    limit 1;
  v_possible_duplicate := found;

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
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, ttclid,
    affiliate_id, affiliate_referral_code_used,
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
      'item_summary', v_package.name, 'item_quantity', v_package.quantity,
      'possible_duplicate', v_possible_duplicate,
      'duplicate_of_order_number', v_dup_order_number,
      'duplicate_minutes_ago', case when v_possible_duplicate then round(extract(epoch from (now() - v_dup_created_at)) / 60) else null end
    ),
    p_submission_token, v_is_repeat,
    nullif(trim(p_utm_source), ''), nullif(trim(p_utm_medium), ''), nullif(trim(p_utm_campaign), ''),
    nullif(trim(p_utm_term), ''), nullif(trim(p_utm_content), ''), nullif(trim(p_fbclid), ''), nullif(trim(p_ttclid), ''),
    v_affiliate_id, case when v_affiliate_id is not null then upper(trim(p_affiliate_referral_code)) else null end,
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
    -- adjust_inventory_internal(), not adjust_inventory(): a real
    -- public visitor has no auth.uid() at all, so the permission
    -- check in adjust_inventory() can never pass for them — see PART
    -- E1. Legitimacy here was already established above (published
    -- page, enabled package, active product), which is the correct
    -- gate for an anonymous order, not a staff permission.
    perform public.adjust_inventory_internal(
      v_product.id, 'RESERVED', v_package.quantity,
      'Order ' || v_order_number || ' created (landing page: ' || v_page.name || ')', 'order', v_order.id
    );
  end if;

  perform public.enqueue_tracking_event(v_page.workspace_id, v_page.brand_id, v_page.id, v_order.id, 'ORDER_CREATED');

  -- 0042: fire the ad-platform Purchase conversion immediately on a
  -- successful order placement, not at delivery. This is a distinct
  -- concept from GCOS's internal delivered-revenue rule (unchanged,
  -- see enqueue_order_tracking_events()) — advertisers need a
  -- same-day conversion signal to optimize spend; waiting days for
  -- delivery starves Meta/TikTok's algorithms of timely data. A
  -- failed/rejected submission never reaches this line (every
  -- validation above already raised), and a submission_token replay
  -- returned the original order well before this point, so this can
  -- only ever run once per genuinely new order.
  perform public.enqueue_tracking_event(v_page.workspace_id, v_page.brand_id, v_page.id, v_order.id, 'PURCHASE');

  return v_order;
end;
$$;

comment on function public.create_public_order(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'Public, anonymous-callable landing-page order creation. Full name, phone, delivery address, city, and state/region are all required and rejected server-side if blank/whitespace-only (0041) — the same boundary a malicious client bypassing the frontend form would hit. Idempotent on p_submission_token (a retry with the same token returns the original order, never a duplicate, and never re-enqueues any tracking event). Enqueues both ORDER_CREATED and PURCHASE conversion events immediately on success (0042). metadata.item_summary/item_quantity (0051) mirror create_order()''s. metadata.possible_duplicate/duplicate_of_order_number/duplicate_minutes_ago (0052): true when this same customer already has another non-cancelled/non-returned order from the last 24 hours — never blocks checkout, only surfaced to staff.';


-- ----------------------------------------------------------------
-- PART C — execute_automation_action(): add a duplicate_warning
-- variable. Signature/body otherwise identical to 0051.
-- ----------------------------------------------------------------
create or replace function public.execute_automation_action(
  p_execution_id uuid,
  p_action_seq integer,
  p_action jsonb,
  p_event public.automation_events,
  p_rule public.automation_rules
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_row public.automation_execution_actions%rowtype;
  v_action_type text := p_action ->> 'type';
  v_config jsonb := coalesce(p_action -> 'config', '{}'::jsonb);
  v_actor uuid := coalesce(p_rule.updated_by, p_rule.created_by);
  v_order public.orders%rowtype;
  v_task public.order_tasks%rowtype;
  v_assignee uuid;
  v_title text;
  v_notify_user uuid;
  v_result jsonb := '{}'::jsonb;
  v_status text := 'succeeded';
  v_error text;
  v_channel text;
  v_effective_brand_id uuid;
  v_comm_config record;
  -- Phase 13 additions for the SEND_* branch:
  v_customer_id uuid;
  v_recipient text;
  v_subject text;
  v_body text;
  v_template_key text;
  v_is_transactional boolean;
  v_country_code text;
  v_dial_code text;
  v_rendered record;
  v_variables jsonb;
  v_comm_status text;
  v_comm_failure_category text;
  -- 0051 additions — a richer, still-additive variable set for a
  -- "new order" style staff/admin notification template.
  v_brand_name text;
  v_customer_address_full text;
  v_subtotal_fmt text;
  v_shipping_fmt text;
  v_total_fmt text;
  -- 0052 addition:
  v_duplicate_warning text;
begin
  insert into public.automation_execution_actions (execution_id, action_seq, action_type, action_config)
  values (p_execution_id, p_action_seq, coalesce(v_action_type, 'UNKNOWN'), v_config)
  on conflict (execution_id, action_seq) do update set action_type = excluded.action_type
  returning * into v_action_row;

  if v_action_row.status = 'succeeded' or v_action_row.status = 'queued' then
    return v_action_row.status;
  end if;

  if v_actor is null then
    update public.automation_execution_actions
      set status = 'skipped', error_message = 'rule has no owning user to act as', updated_at = now()
      where id = v_action_row.id;
    return 'skipped';
  end if;

  begin
    case v_action_type

      when 'CREATE_TASK' then
        if p_event.entity_type <> 'order' or p_event.entity_id is null then
          raise exception 'CREATE_TASK requires an order entity';
        end if;
        if not (public.user_has_permission_for(v_actor, p_rule.workspace_id, 'tasks.create') or public.user_has_permission_for(v_actor, p_rule.workspace_id, 'tasks.manage')) then
          raise exception 'insufficient_permission: rule owner no longer holds tasks.create';
        end if;
        select * into v_order from public.orders where id = p_event.entity_id and deleted_at is null;
        if not found then
          raise exception 'Order not found';
        end if;
        v_title := coalesce(v_config ->> 'title', 'Automated follow-up: ' || p_rule.name);

        insert into public.order_tasks (
          workspace_id, brand_id, order_id, customer_id, task_type, title, description, priority, assigned_to, created_by, updated_by
        ) values (
          v_order.workspace_id, v_order.brand_id, v_order.id, v_order.customer_id,
          coalesce(v_config ->> 'task_type', 'OTHER'), v_title, v_config ->> 'description',
          coalesce(v_config ->> 'priority', 'normal'), null, v_actor, v_actor
        )
        returning * into v_task;

        insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
        values (v_order.id, v_order.workspace_id, v_order.brand_id, 'TASK_CREATED',
          'Follow-up task created by automation rule "' || p_rule.name || '": ' || v_title,
          jsonb_build_object('task_id', v_task.id, 'automation_rule_id', p_rule.id), v_actor);

        v_result := jsonb_build_object('task_id', v_task.id);

      when 'ASSIGN_TASK' then
        v_task.id := coalesce((v_config ->> 'task_id')::uuid, (p_event.payload ->> 'task_id')::uuid);
        if v_task.id is null and p_event.entity_type = 'task' then
          v_task.id := p_event.entity_id;
        end if;
        if v_task.id is null then
          raise exception 'ASSIGN_TASK requires a task_id (from config or the triggering task event)';
        end if;
        select * into v_task from public.order_tasks where id = v_task.id;
        if not found then
          raise exception 'Task not found';
        end if;
        if not (public.user_has_permission_for(v_actor, v_task.workspace_id, 'tasks.assign') or public.user_has_permission_for(v_actor, v_task.workspace_id, 'tasks.manage')) then
          raise exception 'insufficient_permission: rule owner no longer holds tasks.assign';
        end if;
        v_assignee := public.resolve_assignment(v_task.workspace_id, v_task.brand_id, 'tasks');
        if v_assignee is null then
          v_status := 'skipped';
          v_error := 'no eligible staff / manual strategy';
        else
          update public.order_tasks set assigned_to = v_assignee, updated_by = v_actor where id = v_task.id;
          if v_assignee <> v_actor then
            insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
            values (v_task.workspace_id, v_task.brand_id, v_assignee, 'task_assigned', 'Follow-up task assigned to you',
              v_task.title, 'normal', '/orders/' || v_task.order_id, jsonb_build_object('task_id', v_task.id, 'automation_rule_id', p_rule.id));
          end if;
          v_result := jsonb_build_object('assigned_to', v_assignee);
        end if;

      when 'ASSIGN_ORDER' then
        if p_event.entity_type <> 'order' or p_event.entity_id is null then
          raise exception 'ASSIGN_ORDER requires an order entity';
        end if;
        select * into v_order from public.orders where id = p_event.entity_id and deleted_at is null;
        if not found then
          raise exception 'Order not found';
        end if;
        if not public.user_has_permission_for(v_actor, v_order.workspace_id, 'orders.assign') then
          raise exception 'insufficient_permission: rule owner no longer holds orders.assign';
        end if;
        v_assignee := public.resolve_assignment(v_order.workspace_id, v_order.brand_id, 'orders');
        if v_assignee is null then
          v_status := 'skipped';
          v_error := 'no eligible staff / manual strategy';
        else
          update public.orders set assigned_to = v_assignee, updated_by = v_actor where id = v_order.id;
          if v_assignee <> v_actor then
            insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
            values (v_order.workspace_id, v_order.brand_id, v_assignee, 'task_assigned', 'Order assigned to you',
              'Order ' || v_order.order_number, 'normal', '/orders/' || v_order.id, jsonb_build_object('automation_rule_id', p_rule.id));
          end if;
          v_result := jsonb_build_object('assigned_to', v_assignee);
        end if;

      when 'CREATE_NOTIFICATION' then
        v_notify_user := nullif(v_config ->> 'user_id', '')::uuid;
        insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
        values (
          p_rule.workspace_id, coalesce(p_rule.brand_id, p_event.brand_id), v_notify_user,
          coalesce(v_config ->> 'notification_type', 'automation'),
          coalesce(v_config ->> 'title', p_rule.name),
          coalesce(v_config ->> 'message', 'Triggered by automation rule "' || p_rule.name || '".'),
          coalesce(v_config ->> 'priority', 'normal'),
          v_config ->> 'link',
          jsonb_build_object('automation_rule_id', p_rule.id, 'event_id', p_event.id)
        )
        returning jsonb_build_object('notification_user_id', user_id) into v_result;

      when 'TRIGGER_APPROVAL' then
        if p_event.entity_id is null then
          raise exception 'TRIGGER_APPROVAL requires an entity_id';
        end if;
        v_result := public.create_approval_request(
          p_rule.workspace_id, coalesce(p_rule.brand_id, p_event.brand_id), null,
          coalesce(v_config ->> 'module', p_event.entity_type), p_event.entity_type, p_event.entity_id,
          nullif(v_config ->> 'amount', '')::numeric, v_actor
        );

      when 'UPDATE_SUPPORTED_RECORD' then
        if coalesce(v_config ->> 'field', '') <> 'tags' or coalesce(v_config ->> 'operation', '') <> 'add_tag' or p_event.entity_type <> 'order' then
          v_status := 'skipped';
          v_error := 'unsupported_record_update';
        else
          if not (public.user_has_permission_for(v_actor, p_rule.workspace_id, 'orders.update') or public.user_has_permission_for(v_actor, p_rule.workspace_id, 'orders.manage')) then
            raise exception 'insufficient_permission: rule owner no longer holds orders.update';
          end if;
          update public.orders
            set tags = case when v_config ->> 'value' = any(tags) then tags else array_append(tags, v_config ->> 'value') end,
                updated_by = v_actor
            where id = p_event.entity_id and deleted_at is null;
          v_result := jsonb_build_object('tag_added', v_config ->> 'value');
        end if;

      -- ----------------------------------------------------------
      -- SEND_SMS / SEND_WHATSAPP / SEND_EMAIL — extended in Phase 13,
      -- extended again in 0051/0052 (additive variables only):
      --   1. recipient may be a literal string (unchanged, backward
      --      compatible with every existing rule) or the token
      --      {{customer_email}}/{{customer_phone}}, resolved from the
      --      triggering order at execution time — a rule authored once
      --      can now correctly message a DIFFERENT customer per order,
      --      which a literal recipient could never do.
      --   2. an optional template_key resolves + renders a managed
      --      template (brand > workspace > system) instead of requiring
      --      literal subject/body; explicit subject/body in config still
      --      wins if both are supplied (documented override, not a bug).
      --   3. sms/whatsapp recipients are normalized+validated with the
      --      existing normalize_phone() before queuing; an invalid
      --      number is recorded permanently_failed, never queued.
      --   4. a non-transactional (marketing) send is checked against
      --      the customer's opt-in flag for that channel; an opted-out
      --      customer's row is recorded skipped_preference, never
      --      queued and never a fabricated send.
      -- ----------------------------------------------------------
      when 'SEND_SMS', 'SEND_WHATSAPP', 'SEND_EMAIL' then
        v_channel := case v_action_type when 'SEND_SMS' then 'sms' when 'SEND_WHATSAPP' then 'whatsapp' else 'email' end;
        v_effective_brand_id := coalesce(p_rule.brand_id, p_event.brand_id);
        select * into v_comm_config from public.resolve_brand_communication_config_internal(v_effective_brand_id, v_channel);

        v_order := null;
        v_customer_id := null;
        if p_event.entity_type = 'order' and p_event.entity_id is not null then
          select * into v_order from public.orders where id = p_event.entity_id and deleted_at is null;
          if found then
            v_customer_id := v_order.customer_id;
          end if;
        end if;

        v_recipient := v_config ->> 'recipient';
        if v_order.id is not null and (v_recipient is null or v_recipient = '' or v_recipient = '{{customer_email}}' or v_recipient = '{{customer_phone}}') then
          v_recipient := case when v_channel = 'email' then v_order.customer_email else v_order.customer_phone end;
        end if;

        v_template_key := nullif(v_config ->> 'template_key', '');
        v_is_transactional := coalesce((v_config ->> 'is_transactional')::boolean, true);

        v_variables := coalesce(v_config -> 'variables', '{}'::jsonb);
        if v_order.id is not null then
          v_variables := v_variables
            || jsonb_build_object('customer_name', v_order.customer_name, 'order_number', v_order.order_number,
                 'order_total', v_order.total_amount, 'currency', v_order.currency_code, 'delivery_status', v_order.status);

          -- 0051: a richer variable set for a "new order" style
          -- staff/admin notification template — purely additive keys,
          -- the five above are left byte-for-byte unchanged.
          select name into v_brand_name from public.brands where id = v_order.brand_id;
          v_customer_address_full := case
            when coalesce(trim(v_order.customer_address_2), '') <> '' then v_order.customer_address || ', ' || v_order.customer_address_2
            else v_order.customer_address
          end;
          v_subtotal_fmt := trim(trailing '.00' from to_char(v_order.subtotal, 'FM999,999,990.00'));
          v_total_fmt := trim(trailing '.00' from to_char(v_order.total_amount, 'FM999,999,990.00'));
          v_shipping_fmt := case when coalesce(v_order.shipping_fee, 0) = 0 then 'Free'
            else v_order.currency_code || ' ' || trim(trailing '.00' from to_char(v_order.shipping_fee, 'FM999,999,990.00')) end;

          -- 0052: a plain-text duplicate-order verdict, always
          -- populated one way or the other (never a blank/absent
          -- token) so the template can show a definitive line rather
          -- than silently omitting the check. See metadata.possible_duplicate
          -- (set by create_order()/create_public_order()).
          v_duplicate_warning := case
            when coalesce((v_order.metadata ->> 'possible_duplicate')::boolean, false) then
              'Possible duplicate - same customer placed order ' || coalesce(v_order.metadata ->> 'duplicate_of_order_number', '(unknown)') ||
              ' about ' || coalesce((v_order.metadata ->> 'duplicate_minutes_ago')::text, '?') || ' minute(s) ago.'
            else 'No recent duplicate order detected for this customer.'
          end;

          v_variables := v_variables
            || jsonb_build_object(
              'customer_phone', v_order.customer_phone,
              'customer_email', coalesce(v_order.customer_email, ''),
              'customer_address', v_customer_address_full,
              'customer_city', coalesce(v_order.customer_city, ''),
              'customer_state', coalesce(v_order.customer_state, ''),
              'package_name', coalesce(nullif(v_order.metadata ->> 'item_summary', ''), 'N/A'),
              'quantity', coalesce(v_order.metadata ->> 'item_quantity', '1'),
              'subtotal', v_subtotal_fmt,
              'shipping_fee', v_shipping_fmt,
              'order_total_display', v_total_fmt,
              'order_date', to_char(v_order.created_at, 'FMMonth FMDD, YYYY, FMHH12:MI AM'),
              'order_status', initcap(replace(v_order.status, '_', ' ')),
              'brand_name', coalesce(v_brand_name, ''),
              'duplicate_warning', v_duplicate_warning
            );
        end if;

        v_subject := v_config ->> 'subject';
        v_body := v_config ->> 'body';
        if v_template_key is not null and (v_subject is null or v_body is null) then
          select * into v_rendered from public.render_communication_template(p_rule.workspace_id, v_effective_brand_id, v_template_key, v_channel, v_variables);
          if v_rendered.template_found then
            v_subject := coalesce(v_subject, v_rendered.subject);
            v_body := coalesce(v_body, v_rendered.body);
          end if;
        end if;

        -- Phone validation for sms/whatsapp — normalize using the
        -- customer's own market (customers.country_code via the order,
        -- falling back to the order's own customer_country_code),
        -- never assuming Nigeria.
        v_comm_status := 'queued';
        v_comm_failure_category := null;
        if v_channel in ('sms', 'whatsapp') then
          v_country_code := coalesce(v_order.customer_country_code, (select c.country_code from public.customers c where c.id = v_customer_id));
          select dial_code into v_dial_code from public.countries where code = v_country_code;
          v_recipient := public.normalize_phone(v_recipient, v_dial_code);
          if v_recipient is null then
            v_comm_status := 'permanently_failed';
            v_comm_failure_category := 'client_error';
          end if;
        elsif v_channel = 'email' and coalesce(trim(v_recipient), '') = '' then
          v_comm_status := 'permanently_failed';
          v_comm_failure_category := 'client_error';
        end if;

        -- Marketing consent: only checked for non-transactional sends
        -- with a resolvable customer; transactional sends and sends
        -- with no customer context (e.g. a staff/affiliate notification)
        -- are never gated by a customer's channel preference.
        if v_comm_status = 'queued' and not v_is_transactional and v_customer_id is not null then
          if not exists (
            select 1 from public.customers c where c.id = v_customer_id
              and case v_channel when 'email' then c.email_opt_in when 'sms' then c.sms_opt_in when 'whatsapp' then c.whatsapp_opt_in end
          ) then
            v_comm_status := 'skipped_preference';
          end if;
        end if;

        if not v_comm_config.configured then
          v_comm_status := 'not_configured';
        end if;

        insert into public.communication_log (
          workspace_id, brand_id, channel, recipient, subject, body, status, provider, related_execution_action_id, idempotency_key,
          entity_type, entity_id, customer_id, communication_type, template_key, is_transactional, triggered_by, failure_category
        ) values (
          p_rule.workspace_id, v_effective_brand_id, v_channel, v_recipient, v_subject, v_body,
          v_comm_status, case when v_comm_status = 'queued' then v_comm_config.provider else null end,
          v_action_row.id, v_action_row.id::text,
          p_event.entity_type, p_event.entity_id, v_customer_id,
          coalesce(v_config ->> 'communication_type', v_action_type), v_template_key, v_is_transactional, 'automation', v_comm_failure_category
        )
        on conflict (idempotency_key) where idempotency_key is not null do nothing;

        if v_comm_status = 'queued' then
          v_status := 'queued';
        elsif v_comm_status = 'skipped_preference' then
          v_status := 'skipped';
          v_error := 'skipped_preference: customer has opted out of marketing ' || v_channel;
        elsif v_comm_status = 'permanently_failed' then
          v_status := 'skipped';
          v_error := 'invalid_recipient: could not validate a ' || v_channel || ' recipient';
        else
          v_status := 'skipped';
          v_error := 'not_configured: no ' || v_channel || ' provider is configured for this brand';
        end if;

      when 'LOG_EVENT' then
        v_result := jsonb_build_object('logged', true, 'note', v_config ->> 'note');

      else
        v_status := 'skipped';
        v_error := 'unsupported_action_type: ' || coalesce(v_action_type, '(missing)');
    end case;

  exception when others then
    v_status := 'failed';
    v_error := left(SQLERRM, 2000);
  end;

  update public.automation_execution_actions
    set status = v_status, result = v_result, error_message = v_error, updated_at = now()
    where id = v_action_row.id;

  return v_status;
end;
$$;

comment on function public.execute_automation_action(uuid, integer, jsonb, public.automation_events, public.automation_rules) is
  'Fixed action catalogue, unchanged from 0032 except the SEND_SMS/SEND_WHATSAPP/SEND_EMAIL branch: recipient may now be a {{customer_email}}/{{customer_phone}} token resolved from the triggering order, an optional template_key renders a managed template, sms/whatsapp recipients are validated with normalize_phone() before queuing (invalid -> permanently_failed, never queued), and a non-transactional send is checked against the customer''s marketing opt-in for that channel (opted out -> skipped_preference). 0051 adds a richer, purely additive variable set (customer_phone/email/address/city/state, package_name, quantity, subtotal, shipping_fee, order_total_display, order_date, order_status, brand_name). 0052 adds duplicate_warning: a plain-text, always-populated verdict ("Possible duplicate - ..." or "No recent duplicate order detected...") derived from metadata.possible_duplicate. Every other action type/branch is byte-for-byte identical to 0032.';


-- ----------------------------------------------------------------
-- PART D — update the seeded 'new_order' system template to surface
-- the duplicate check. This is a service-role migration updating a
-- system-default row (workspace_id/brand_id both null) — exactly
-- what email_templates'' own table comment (0034) says only a
-- migration may do. A workspace that already created its own
-- override with the same key is UNCHANGED by this (this update only
-- targets the system row) and can add the {{duplicate_warning}}
-- token to their own copy whenever they choose.
-- ----------------------------------------------------------------
update public.email_templates
set
  html_body = '<div style="background:#0b0e0c;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border-radius:8px;overflow:hidden;">
  <div style="background:#123524;padding:20px 24px;">
    <div style="color:#93c5fd;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">{{brand_name}}</div>
    <div style="color:#ffffff;font-size:20px;font-weight:700;">New Order Received</div>
  </div>
  <div style="padding:24px;">
    <p style="margin:0 0 20px;color:#e5e7eb;">A new order just came in.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#9ca3af;width:40%;">Order Number</td><td style="padding:8px 0;color:#ffffff;font-weight:600;">{{order_number}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Customer</td><td style="padding:8px 0;color:#ffffff;">{{customer_name}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Phone</td><td style="padding:8px 0;color:#ffffff;">{{customer_phone}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Email</td><td style="padding:8px 0;"><a href="mailto:{{customer_email}}" style="color:#60a5fa;">{{customer_email}}</a></td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Address</td><td style="padding:8px 0;color:#ffffff;">{{customer_address}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">City / State</td><td style="padding:8px 0;color:#ffffff;">{{customer_city}}, {{customer_state}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Package</td><td style="padding:8px 0;color:#ffffff;">{{package_name}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Quantity</td><td style="padding:8px 0;color:#ffffff;">{{quantity}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Subtotal</td><td style="padding:8px 0;color:#ffffff;">{{currency}} {{subtotal}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Shipping</td><td style="padding:8px 0;color:#ffffff;">{{shipping_fee}}</td></tr>
      <tr><td style="padding:10px 0;color:#9ca3af;border-top:1px solid #374151;font-weight:700;">TOTAL</td><td style="padding:10px 0;color:#ffffff;border-top:1px solid #374151;font-weight:700;">{{currency}} {{order_total_display}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Date</td><td style="padding:8px 0;color:#ffffff;">{{order_date}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Status</td><td style="padding:8px 0;color:#ffffff;">{{order_status}}</td></tr>
      <tr><td style="padding:8px 0;color:#9ca3af;">Duplicate Check</td><td style="padding:8px 0;color:#fbbf24;font-weight:600;">{{duplicate_warning}}</td></tr>
    </table>
  </div>
  <div style="background:#141614;padding:14px 24px;color:#6b7280;font-size:12px;">Thank you for choosing us. &middot; Sent via {{brand_name}}</div>
</div>',
  variables = '["order_number","customer_name","customer_phone","customer_email","customer_address","customer_city","customer_state","package_name","quantity","currency","subtotal","shipping_fee","order_total_display","order_date","order_status","brand_name","duplicate_warning"]'::jsonb,
  updated_at = now()
where workspace_id is null and brand_id is null and key = 'new_order' and channel = 'email';
