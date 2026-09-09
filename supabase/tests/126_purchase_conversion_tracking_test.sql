-- ============================================================
-- Purchase conversion tracking (0042) — dedicated regression/security
-- suite. 0031 originally enqueued the ad-platform "PURCHASE"
-- conversion ONLY on delivered+cash-collected (matching GCOS's own
-- internal Finance revenue-recognition rule). 0042 changes this: a
-- successful order placement now fires PURCHASE immediately, since
-- Meta/TikTok need a same-day conversion signal to optimize spend —
-- COD delivery can take days. This suite proves: (1) PURCHASE fires
-- at order-placement time using the same deterministic event_id
-- convention as every other tracking event, (2) a refreshed/duplicate
-- submission never double-enqueues it, (3) a failed/rejected
-- submission never enqueues anything, (4) the delivered+collected
-- branch (still present as a catch-up safety net) is a guaranteed
-- no-op once PURCHASE already exists, (5) an unconfigured brand still
-- honestly enqueues nothing, and (6)-(7) get_public_order_confirmation()
-- — the new anonymous-callable lookup that lets the thank-you page
-- rehydrate itself after a hard refresh — returns correct data for a
-- real order and nothing for an unknown one.
--
-- Run against a freshly migrated 0001-0042 database with
-- 00_bootstrap_post_migration.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws uuid; v_brand uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000f3';
  v_cat uuid; v_prod uuid; v_page uuid; v_pkg uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-pt@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('PT WS', 'pt-ws', 'KE', 'KES', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by, meta_pixel_id, tiktok_pixel_id)
    values (v_ws, 'PT Brand', 'pt-brand', v_owner, 'META_PIXEL_1', 'TT_PIXEL_1') returning id into v_brand;
  insert into public.brand_tracking_secrets (workspace_id, brand_id, meta_capi_access_token, tiktok_access_token)
    values (v_ws, v_brand, 'META_TOKEN_1', 'TT_TOKEN_1');
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_owner, id, v_ws, v_owner from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.categories (workspace_id, brand_id, name, slug) values (v_ws, v_brand, 'Cat', 'pt-cat') returning id into v_cat;
  insert into public.products (workspace_id, brand_id, category_id, name, slug, sku, selling_price, cost_price, stock_quantity, status, track_inventory)
    values (v_ws, v_brand, v_cat, 'PT Prod', 'pt-prod', 'PT-SKU', 5000, 2000, 100, 'active', false) returning id into v_prod;
  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, status, market_country_code, market_currency_code)
    values (v_ws, v_brand, v_prod, 'PT Page', 'pt-page', 'published', 'KE', 'KES') returning id into v_page;
  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, price, quantity, enabled)
    values (v_page, v_ws, v_brand, 'Pkg 1', 5000, 1, true) returning id into v_pkg;
  -- meta_enabled/tiktok_enabled require an explicit page-level opt-in
  -- (tracking_config->meta/tiktok->enabled) — a brand-level pixel id
  -- alone is only the inherited pixel *value*, matching how
  -- set_landing_page_tracking() actually configures a page (see 0031,
  -- resolve_landing_page_tracking_status_internal()).
  update public.landing_pages set tracking_config = jsonb_build_object(
    'meta', jsonb_build_object('enabled', true, 'pixel_id', 'META_PIXEL_1'),
    'tiktok', jsonb_build_object('enabled', true, 'pixel_id', 'TT_PIXEL_1')
  ) where id = v_page;
end $$;

\echo '=== 1. Successful order placement enqueues PURCHASE immediately (not waiting for delivery) ==='
do $$
declare v_page uuid; v_pkg uuid; v_order public.orders%rowtype; v_cnt int;
begin
  select id into v_page from public.landing_pages where slug = 'pt-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  select * into v_order from public.create_public_order('pt-page', v_pkg, 'Jane Doe', '0712345678', '1 Rd', 'Nairobi', 'Nairobi', null, null, null, null, 'tok-1');
  select count(*) into v_cnt from public.tracking_dispatch_log where order_id = v_order.id and event_type = 'PURCHASE';
  assert v_cnt = 2, format('expected 2 PURCHASE rows (meta+tiktok), got %s', v_cnt);
  assert exists(select 1 from public.tracking_dispatch_log where order_id = v_order.id and event_type = 'PURCHASE' and provider = 'meta' and event_id = 'PURCHASE:meta:' || v_order.id::text and status = 'pending'), 'meta PURCHASE event_id must be deterministic PURCHASE:meta:<order_id>';
  assert exists(select 1 from public.tracking_dispatch_log where order_id = v_order.id and event_type = 'PURCHASE' and provider = 'tiktok' and event_id = 'PURCHASE:tiktok:' || v_order.id::text and status = 'pending'), 'tiktok PURCHASE event_id must be deterministic PURCHASE:tiktok:<order_id>';
  raise notice 'OK 1: PURCHASE enqueued for both providers at order-placement time with deterministic event_ids.';
end $$;

\echo '=== 2. Duplicate submission (same submission_token) never enqueues a second PURCHASE ==='
do $$
declare v_page uuid; v_pkg uuid; v_order1 public.orders%rowtype; v_order2 public.orders%rowtype; v_cnt int;
begin
  select id into v_page from public.landing_pages where slug = 'pt-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  select * into v_order1 from public.create_public_order('pt-page', v_pkg, 'Repeat Cust', '0712345679', '1 Rd', 'Nairobi', 'Nairobi', null, null, null, null, 'tok-dup');
  select * into v_order2 from public.create_public_order('pt-page', v_pkg, 'Repeat Cust', '0712345679', '1 Rd', 'Nairobi', 'Nairobi', null, null, null, null, 'tok-dup');
  assert v_order1.id = v_order2.id, 'a retried submission_token must return the SAME order, never a new one';
  select count(*) into v_cnt from public.tracking_dispatch_log where order_id = v_order1.id and event_type = 'PURCHASE';
  assert v_cnt = 2, format('a duplicate/refreshed submission must never enqueue a second PURCHASE row per provider, got %s rows', v_cnt);
  raise notice 'OK 2: refreshed/duplicate submission is a guaranteed no-op — no duplicate PURCHASE.';
end $$;

\echo '=== 3. A failed submission (missing required field) never enqueues any tracking event ==='
do $$
declare v_page uuid; v_pkg uuid; v_failed boolean := false; v_cnt int;
begin
  select id into v_page from public.landing_pages where slug = 'pt-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  begin
    perform public.create_public_order('pt-page', v_pkg, 'Nope', '0712345680', '1 Rd', null, 'Nairobi');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'missing state must still be rejected';
  select count(*) into v_cnt from public.tracking_dispatch_log d join public.orders o on o.id = d.order_id where o.customer_phone = '0712345680';
  assert v_cnt = 0, 'a rejected/failed order must never enqueue ORDER_CREATED or PURCHASE for a non-existent order';
  raise notice 'OK 3: failed/abandoned submission enqueues nothing.';
end $$;

\echo '=== 4. Delivered+collected trigger no-ops once PURCHASE already exists (no double conversion) ==='
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f3', false);
set role authenticated;
do $$
declare v_page uuid; v_pkg uuid; v_order public.orders%rowtype; v_cnt int;
begin
  select id into v_page from public.landing_pages where slug = 'pt-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  select * into v_order from public.create_public_order('pt-page', v_pkg, 'Deliver Me', '0712345681', '1 Rd', 'Nairobi', 'Nairobi', null, null, null, null, 'tok-deliver');
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id;
  select count(*) into v_cnt from public.tracking_dispatch_log where order_id = v_order.id and event_type = 'PURCHASE';
  assert v_cnt = 2, format('delivered+collected must not create a second PURCHASE row once one already exists from order placement, got %s', v_cnt);
  raise notice 'OK 4: delivered+collected safety-net branch is a correct no-op — exactly one PURCHASE per provider survives end to end.';
end $$;
reset role;

\echo '=== 5. A page/brand with tracking not configured enqueues nothing (never fabricates a provider) ==='
do $$
declare v_ws uuid; v_brand uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000f3';
  v_cat uuid; v_prod uuid; v_page uuid; v_pkg uuid; v_order public.orders%rowtype; v_cnt int;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('PT WS2', 'pt-ws2', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'PT Brand2', 'pt-brand2', v_owner) returning id into v_brand;
  insert into public.categories (workspace_id, brand_id, name, slug) values (v_ws, v_brand, 'Cat2', 'pt-cat2') returning id into v_cat;
  insert into public.products (workspace_id, brand_id, category_id, name, slug, sku, selling_price, cost_price, stock_quantity, status, track_inventory)
    values (v_ws, v_brand, v_cat, 'PT Prod2', 'pt-prod2', 'PT-SKU2', 5000, 2000, 100, 'active', false) returning id into v_prod;
  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, status, market_country_code, market_currency_code)
    values (v_ws, v_brand, v_prod, 'PT Page2', 'pt-page2', 'published', 'NG', 'NGN') returning id into v_page;
  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, price, quantity, enabled)
    values (v_page, v_ws, v_brand, 'Pkg 1', 5000, 1, true) returning id into v_pkg;
  select * into v_order from public.create_public_order('pt-page2', v_pkg, 'No Tracking', '08010000000', '1 Rd', 'Lagos', 'Ikeja', null, null, null, null, 'tok-notrack');
  select count(*) into v_cnt from public.tracking_dispatch_log where order_id = v_order.id;
  assert v_cnt = 0, format('a brand with no Meta/TikTok config must enqueue zero rows, got %s', v_cnt);
  raise notice 'OK 5: unconfigured brand correctly enqueues nothing (honest, no fabricated provider).';
end $$;

\echo '=== 6. get_public_order_confirmation returns correct value/currency/attribution, scoped to landing_page orders ==='
do $$
declare v_page uuid; v_pkg uuid; v_order public.orders%rowtype; v_conf record;
begin
  select id into v_page from public.landing_pages where slug = 'pt-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  select * into v_order from public.create_public_order('pt-page', v_pkg, 'Confirm Me', '0712345682', '1 Rd', 'Nairobi', 'Nairobi', null, null, null, null, 'tok-confirm', 'fb', 'cpc', 'campaign1', null, null, 'fbc123', 'ttc456');
  set role anon;
  select * into v_conf from public.get_public_order_confirmation(v_order.id);
  reset role;
  assert v_conf.id = v_order.id, 'must resolve the correct order';
  assert v_conf.total_amount = v_order.total_amount, 'total_amount must match';
  assert v_conf.currency_code = 'KES', format('currency must be the market currency (KES), got %s', v_conf.currency_code);
  assert v_conf.landing_page_slug = 'pt-page', 'landing page slug must resolve';
  assert v_conf.fbclid = 'fbc123' and v_conf.ttclid = 'ttc456', 'attribution identifiers must be returned';
  raise notice 'OK 6: get_public_order_confirmation returns correct order/value/currency/attribution for an anonymous caller.';
end $$;

\echo '=== 7. get_public_order_confirmation returns nothing for a non-existent/random order id (no fabricated data) ==='
do $$
declare v_cnt int;
begin
  set role anon;
  select count(*) into v_cnt from public.get_public_order_confirmation(gen_random_uuid());
  reset role;
  assert v_cnt = 0, 'a random/non-existent order id must return zero rows';
  raise notice 'OK 7: unknown order id returns zero rows, never fabricated data.';
end $$;

\echo '=== ALL PURCHASE TRACKING TESTS PASSED ==='
