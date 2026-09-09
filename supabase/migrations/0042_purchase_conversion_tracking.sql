-- ============================================================
-- Purchase conversion tracking (Meta CAPI / TikTok Events API):
-- fix the real gap between what advertisers need and what 0031
-- built. 0031 deliberately enqueued the ad-platform "PURCHASE"
-- conversion ONLY on delivered+cash-collected, explicitly matching
-- GCOS's own internal Finance revenue-recognition rule (see
-- enqueue_order_tracking_events()'s original comment). That is
-- correct for INTERNAL revenue reporting, but it starves Meta/TikTok
-- of a timely conversion signal — COD deliveries can take days, and
-- ad platforms need same-day Purchase signal to optimize spend. A
-- successful order placement (the actual checkout event, from the
-- advertiser's point of view) must fire Purchase immediately; GCOS's
-- own Finance revenue definition is untouched by this migration —
-- get_finance_summary() and every other internal revenue calculation
-- still only ever count delivered+collected orders as revenue.
--
-- Two changes:
-- 1. create_public_order() now also enqueues PURCHASE (in addition to
--    the existing ORDER_CREATED) immediately on successful order
--    creation. It reuses enqueue_tracking_event()'s existing
--    deterministic event_id ('PURCHASE:meta:<order_id>' etc.) and
--    (provider, event_id) unique index unchanged from 0031 — no new
--    dedup mechanism needed. A submission_token replay (see the
--    p_submission_token idempotency check earlier in this function)
--    returns the original order BEFORE reaching this call, so a
--    duplicate/refreshed form submission never re-enqueues anything.
-- 2. enqueue_order_tracking_events()'s delivered+collected branch is
--    left in place but is now a harmless safety-net catch-up (for a
--    page whose tracking wasn't configured yet at order time) rather
--    than the sole source of PURCHASE: since the event_id is the same
--    order-id-derived key regardless of which branch enqueues it
--    first, the second attempt is always a guaranteed no-op via the
--    existing unique index. Comment updated to state this accurately.
--
-- No schema change. No RLS change. Full function bodies copied
-- verbatim from their last authoritative definitions (0041 for
-- create_public_order, 0031 for enqueue_order_tracking_events) with
-- only the described lines added/changed.
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

  -- 0042: fire the ad-platform Purchase conversion immediately on a
  -- successful order placement, not at delivery. This is a distinct
  -- concept from GCOS's internal delivered-revenue rule (unchanged,
  -- see enqueue_order_tracking_events() below) — advertisers need a
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
  'Public, anonymous-callable landing-page order creation. Full name, phone, delivery address, city, and state/region are all required and rejected server-side if blank/whitespace-only (0041) — the same boundary a malicious client bypassing the frontend form would hit. Idempotent on p_submission_token (a retry with the same token returns the original order, never a duplicate, and never re-enqueues any tracking event). Enqueues both ORDER_CREATED and PURCHASE conversion events immediately on success (0042) — Purchase is the ad-platform conversion signal fired at successful checkout, distinct from GCOS''s own delivered+collected revenue definition, which is untouched.';


-- ---------------------------------------------------------------
-- enqueue_order_tracking_events(): body unchanged from 0031 — the
-- delivered+collected branch is still correct and still needed as a
-- catch-up path (e.g. a page whose Meta/TikTok credentials were only
-- configured after some orders were already placed). It is now a
-- safety net, not the primary Purchase trigger: because
-- enqueue_tracking_event()'s event_id is derived purely from
-- (event_type, provider, order_id), an order whose PURCHASE was
-- already enqueued at creation time (0042) hits the exact same
-- (provider, event_id) unique key here and is silently a no-op — it
-- can never send a second Purchase conversion for the same order.
-- Comment updated only; logic identical to 0031.
-- ---------------------------------------------------------------
create or replace function public.enqueue_order_tracking_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.landing_page_id is null then
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'PENDING' then
    perform public.enqueue_tracking_event(new.workspace_id, new.brand_id, new.landing_page_id, new.id, 'ORDER_CONFIRMED');
  end if;

  -- Safety-net catch-up only (0042): PURCHASE is now primarily
  -- enqueued at order placement (create_public_order(), 0042). This
  -- branch still fires on delivered+collected so a page whose
  -- tracking was configured AFTER the order was placed still
  -- eventually gets a Purchase conversion — but if PURCHASE was
  -- already enqueued at order time, the identical (provider,
  -- event_id) key here is a guaranteed no-op. This does not affect
  -- and is not affected by GCOS's own internal Finance
  -- delivered-revenue rule (get_finance_summary()), which remains
  -- completely separate and untouched.
  if new.status = 'DELIVERED' and new.cash_collection_status = 'collected'
     and (old.status is distinct from new.status or old.cash_collection_status is distinct from new.cash_collection_status) then
    perform public.enqueue_tracking_event(new.workspace_id, new.brand_id, new.landing_page_id, new.id, 'PURCHASE');
  end if;

  if new.status is distinct from old.status and new.status = 'CANCELLED' then
    perform public.enqueue_tracking_event(new.workspace_id, new.brand_id, new.landing_page_id, new.id, 'ORDER_CANCELLED');
  end if;

  return new;
end;
$$;

comment on function public.enqueue_order_tracking_events() is
  '0042: PURCHASE is now primarily enqueued at order placement (create_public_order()), giving Meta/TikTok a same-day conversion signal instead of waiting for COD delivery. The delivered+collected branch here remains as a harmless catch-up safety net (guaranteed no-op once the order-time PURCHASE already exists, via the shared deterministic event_id) for pages whose tracking was configured after some orders were already placed. GCOS''s own internal Finance revenue definition (delivered+collected only) is a completely separate concept and is not changed by this migration.';


-- ---------------------------------------------------------------
-- get_public_order_confirmation(): lets the public thank-you page
-- rehydrate itself after a hard refresh (React Router's navigate()
-- state, which is all the thank-you page previously had access to,
-- does not survive a reload) using only the order id from the URL.
-- Anonymous-callable by design (a just-completed customer has no
-- session), scoped to source = 'landing_page' orders only so it can
-- never be used to fetch a staff-created manual order, and returns a
-- deliberately narrow field set — no customer_email, no full
-- address/notes — since order ids are unguessable UUIDs but this
-- endpoint has no other access control. It returns strictly less
-- than create_public_order() already hands the anonymous caller
-- synchronously on success, so this introduces no new data exposure.
-- ---------------------------------------------------------------
create or replace function public.get_public_order_confirmation(p_order_id uuid)
returns table (
  id uuid,
  order_number text,
  total_amount numeric,
  currency_code text,
  customer_phone text,
  landing_page_id uuid,
  landing_page_slug text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  fbclid text,
  ttclid text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.order_number, o.total_amount, o.currency_code, o.customer_phone,
         o.landing_page_id, lp.slug,
         o.utm_source, o.utm_medium, o.utm_campaign, o.utm_term, o.utm_content,
         o.fbclid, o.ttclid, o.created_at
  from public.orders o
  left join public.landing_pages lp on lp.id = o.landing_page_id
  where o.id = p_order_id and o.source = 'landing_page' and o.deleted_at is null;
$$;

comment on function public.get_public_order_confirmation(uuid) is
  'Public, anonymous-callable, read-only lookup for the thank-you page to rehydrate order/value/currency/attribution data after a refresh, using only the (unguessable) order id from the URL. Scoped to source=landing_page orders only. Returns a deliberately narrow field set (no email/address/notes) — strictly less than create_public_order() already returns to the same anonymous caller synchronously on success.';

grant execute on function public.get_public_order_confirmation(uuid) to anon, authenticated;
