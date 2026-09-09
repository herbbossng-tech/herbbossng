-- ============================================================
-- Surgical fix: the public landing-page order form's City and
-- State/Region fields were already required in the frontend's zod
-- schema (min length 1) alongside Full Name/Phone/Address, but the
-- server-side create_public_order() RPC — the authoritative
-- boundary, since a malicious client can call the RPC directly and
-- skip the frontend entirely — only ever validated Name/Phone/Address
-- as non-empty. p_customer_state/p_customer_city were declared with
-- `default null` and never checked, so a direct RPC call omitting
-- them would have succeeded silently. This migration closes that gap
-- with the same coalesce(trim(...), '') = '' pattern already used for
-- the other three fields, and changes nothing else about the
-- function. No column/table change: customer_state/customer_city
-- remain nullable at the orders/customers table level, because the
-- staff-facing manual order-creation path (create_order(), CreateOrderPage.tsx)
-- never collects them and must not be broken by this fix — the
-- requirement is scoped to the PUBLIC landing-page path only, exactly
-- as asked.
-- ============================================================

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
    jsonb_build_object('landing_page_package_id', v_package.id, 'landmark', p_landmark),
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

  return v_order;
end;
$$;

comment on function public.create_public_order(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'Public, anonymous-callable landing-page order creation. Full name, phone, delivery address, city, and state/region are all required and rejected server-side if blank/whitespace-only (0041) — the same boundary a malicious client bypassing the frontend form would hit. Idempotent on p_submission_token (a retry with the same token returns the original order, never a duplicate).';
