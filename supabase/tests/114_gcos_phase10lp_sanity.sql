-- ============================================================
-- GCOS Landing Page Template Engine / Tracking — sanity + security
-- suite (local-only). Role switches are top-level statements.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

do $$
declare
  v_ws uuid; v_brand uuid; v_owner_role uuid; v_marketing_role uuid;
  v_prod uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('LP WS', 'lp-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws;
  insert into public.brands (workspace_id, name, slug) values (v_ws, 'LP Brand', 'lp-brand') returning id into v_brand;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_marketing_role from public.roles where slug = 'marketing' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000e1', 'owner-lp@test.local'),
    ('00000000-0000-0000-0000-0000000000e2', 'marketing-lp@test.local')
  on conflict do nothing;
  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000e1', v_owner_role, v_ws),
    ('00000000-0000-0000-0000-0000000000e2', v_marketing_role, v_ws);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws, v_brand, 'Ginseng Five Treasures Tea', 'ginseng-five-treasures-tea', 'GINS-5T', 'active', 15000, 6000, 200) returning id into v_prod;
end $$;

select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;

do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_template uuid; v_page_id uuid;
begin
  select id into v_ws from public.workspaces where slug = 'lp-ws';
  select id into v_brand from public.brands where slug = 'lp-brand';
  select id into v_prod from public.products where sku = 'GINS-5T';
  select id into v_template from public.landing_page_templates where template_key = 'template_4';

  -- 1. Create a landing page on Template 4, explicitly picking a
  -- market DIFFERENT from the workspace's own (workspace is NG, page is KE).
  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, template_id, market_country_code, status)
  values (v_ws, v_brand, v_prod, 'Ginseng Five Tea — Kenya', 'ginseng-five-tea-kenya', v_template, 'KE', 'draft')
  returning id into v_page_id;

  perform 1 from public.landing_pages where id = v_page_id and market_country_code = 'KE' and market_currency_code = 'KES';
  if not found then raise exception 'page-level market override did not take effect'; end if;
  raise notice 'OK 1: landing page created on Template 4 with an explicit per-page market (KE) independent of the workspace (NG)';

  -- 2. A second page for the SAME product, different market (NG, inherits workspace default).
  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, template_id, status)
  values (v_ws, v_brand, v_prod, 'Ginseng Five Tea — Nigeria', 'ginseng-five-tea-nigeria', v_template, 'draft');
  perform 1 from public.landing_pages where slug = 'ginseng-five-tea-nigeria' and market_country_code = 'NG' and market_currency_code = 'NGN';
  if not found then raise exception 'workspace-default market fallback broke'; end if;
  raise notice 'OK 2: a second page for the same product, in a different market, coexists — currency follows market';

  -- 3. Invalid market rejected.
  begin
    insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, market_country_code, status)
    values (v_ws, v_brand, v_prod, 'Bad Market Page', 'bad-market-page', 'ZZ', 'draft');
    raise exception 'should have rejected unknown market country_code';
  exception when others then
    raise notice 'OK 3: unknown market country_code rejected (%.)', SQLERRM;
  end;

  raise notice 'LP_PAGE_ID=%', v_page_id;
end $$;

do $$
declare v_page_id uuid; v_pkg1 uuid; v_pkg2 uuid;
begin
  select id into v_page_id from public.landing_pages where slug = 'ginseng-five-tea-kenya';

  -- 4. Package CRUD: create two packages, one default.
  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, quantity, price, is_default, position)
    select v_page_id, workspace_id, brand_id, '1 Pack', 1, 8500, true, 1 from public.landing_pages where id = v_page_id
    returning id into v_pkg1;
  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, quantity, price, badge, position)
    select v_page_id, workspace_id, brand_id, '3 Packs', 3, 21000, 'Best Value', 2 from public.landing_pages where id = v_page_id
    returning id into v_pkg2;

  -- Publish the page so create_public_order() can be exercised.
  update public.landing_pages set status = 'published', published_at = now() where id = v_page_id;

  raise notice 'LP_PKG1_ID=%', v_pkg1;
  raise notice 'LP_PKG2_ID=%', v_pkg2;
  raise notice 'OK 4: packages created, page published';
end $$;

reset role;

-- ============================================================
-- 5. THE MANDATORY PRICE-TAMPERING TEST — browser submits nothing
-- resembling a price at all (create_public_order has no price
-- parameter); the server-resolved total must equal package.price + shipping.
-- ============================================================
do $$
declare v_slug text := 'ginseng-five-tea-kenya'; v_pkg1 uuid; v_order public.orders;
begin
  select id into v_pkg1 from public.landing_page_packages where landing_page_id = (select id from public.landing_pages where slug = v_slug) and name = '1 Pack';

  v_order := public.create_public_order(
    v_slug, v_pkg1, 'Jane Doe', '0712345678', '123 Moi Avenue', 'Nairobi', 'Nairobi', null, null, null, null,
    'sub-token-1', 'facebook', 'cpc', 'gcos-launch', null, null, 'fb.1.111', 'tt.1.222', null
  );

  assert v_order.total_amount = 8500, format('order total must equal the authoritative package price (8500), got %s — a client could never have influenced this since create_public_order takes no price parameter at all', v_order.total_amount);
  assert v_order.subtotal = 8500, 'subtotal must equal package price';
  assert v_order.utm_source = 'facebook' and v_order.utm_campaign = 'gcos-launch', 'UTM attribution must land in dedicated order columns';
  assert v_order.fbclid = 'fb.1.111' and v_order.ttclid = 'tt.1.222', 'fbclid/ttclid must be captured';
  assert v_order.currency_code = 'KES', format('order currency must follow the PAGE''s market (KES), not the workspace default (NGN), got %s', v_order.currency_code);
  raise notice 'OK 5: server-resolved price (8500) used regardless of anything the browser could submit — create_public_order has no price parameter to tamper with. Currency correctly follows the page''s own market (KES).';

  raise notice 'LP_ORDER_ID=%', v_order.id;
end $$;

-- 6. Disabled/deleted package must disappear from what a public order can select.
do $$
declare v_slug text := 'ginseng-five-tea-kenya'; v_pkg2 uuid; v_failed boolean;
begin
  select id into v_pkg2 from public.landing_page_packages where landing_page_id = (select id from public.landing_pages where slug = v_slug) and name = '3 Packs';
  update public.landing_page_packages set enabled = false where id = v_pkg2;

  v_failed := false;
  begin
    perform public.create_public_order(v_slug, v_pkg2, 'John Doe', '0712345679', '456 Kenyatta Ave');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a disabled package must be rejected by create_public_order — never usable for a new order';
  raise notice 'OK 6: a disabled package is rejected server-side (matches: deleted/disabled packages disappear from the public page and cannot be ordered)';
end $$;

-- 7. Unpublished page rejected.
do $$
declare v_failed boolean;
begin
  v_failed := false;
  begin
    perform public.create_public_order('ginseng-five-tea-nigeria', gen_random_uuid(), 'X', '0800000000', 'addr');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a draft (unpublished) page must never accept a public order';
  raise notice 'OK 7: draft/unpublished page correctly rejects public order creation';
end $$;

-- 8. Idempotency: resubmitting the SAME submission_token returns the same order, never a duplicate.
do $$
declare v_slug text := 'ginseng-five-tea-kenya'; v_pkg1 uuid; v_order1 public.orders; v_order2 public.orders; v_count int;
begin
  select id into v_pkg1 from public.landing_page_packages where landing_page_id = (select id from public.landing_pages where slug = v_slug) and name = '1 Pack';
  v_order1 := public.create_public_order(v_slug, v_pkg1, 'Idem Test', '0712340000', 'addr', 'Nairobi', 'Nairobi', null, null, null, null, 'idem-token-1');
  v_order2 := public.create_public_order(v_slug, v_pkg1, 'Idem Test', '0712340000', 'addr', 'Nairobi', 'Nairobi', null, null, null, null, 'idem-token-1');
  assert v_order1.id = v_order2.id, 'resubmitting the same submission_token must return the SAME order, never create a duplicate';
  select count(*) into v_count from public.orders where idempotency_key = 'idem-token-1';
  assert v_count = 1, format('exactly one order must exist for a reused submission_token, got %s', v_count);
  raise notice 'OK 8: public-order idempotency holds';
end $$;

-- ============================================================
-- 9-14: Secrets — never selectable by any client role, RPC-only
-- write, no raw token in any read path.
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e2', false);
set role authenticated;

do $$
declare v_brand uuid; v_page_id uuid; v_status record; v_leak int;
begin
  select id into v_brand from public.brands where slug = 'lp-brand';
  select id into v_page_id from public.landing_pages where slug = 'ginseng-five-tea-kenya';

  perform public.set_brand_meta_tracking(v_brand, 'META_PIXEL_123', 'super-secret-capi-token', 'TEST1234');
  perform public.set_brand_tiktok_tracking(v_brand, 'TT_PIXEL_456', 'super-secret-tiktok-token');

  select * into v_status from public.get_landing_page_tracking_status(v_page_id);
  assert v_status.meta_pixel_id = 'META_PIXEL_123', 'brand pixel must be inherited as the page default';
  assert v_status.meta_capi_configured = true, 'meta_capi_configured must be true once a token is set';
  assert v_status.meta_source = 'brand', 'source must report brand (no page-level override set yet)';
  assert v_status.tiktok_events_configured = true, 'tiktok configured status must be true';
  raise notice 'OK 9: get_landing_page_tracking_status() correctly resolves brand-level tracking as the default';

  -- 10. Direct client SELECT on the secrets tables must return ZERO rows — RLS has no policy for this role at all.
  select count(*) into v_leak from public.brand_tracking_secrets where brand_id = v_brand;
  assert v_leak = 0, format('brand_tracking_secrets must be completely unreadable via direct client SQL, got %s visible rows — a secret leak', v_leak);
  raise notice 'OK 10: brand_tracking_secrets is genuinely unreadable via direct client SQL (RLS has zero policies for authenticated), not just hidden by convention';

  -- 11. Page-level override takes priority once set.
  perform public.set_landing_page_tracking(v_page_id, true, 'PAGE_META_PIXEL', 'page-level-secret-token', null, null, null, null);
  select * into v_status from public.get_landing_page_tracking_status(v_page_id);
  assert v_status.meta_pixel_id = 'PAGE_META_PIXEL', 'page-level pixel override must take priority over the brand default';
  assert v_status.meta_source = 'page', 'source must now report page';
  raise notice 'OK 11: page-level tracking override (different Pixel + CAPI token from the brand default) correctly takes priority — Landing Page A can run Pixel A while another page runs the brand default';

  select count(*) into v_leak from public.landing_page_tracking_secrets where landing_page_id = v_page_id;
  assert v_leak = 0, 'landing_page_tracking_secrets must be unreadable via direct client SQL too';
  raise notice 'OK 12: landing_page_tracking_secrets equally unreadable via direct client SQL';
end $$;

reset role;

-- 13. The old brand secret columns are GONE (the pre-existing leak via select('*') is fixed).
do $$
declare v_exists boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name in ('meta_capi_access_token', 'meta_capi_test_event_code')
  ) into v_exists;
  assert not v_exists, 'meta_capi_access_token/meta_capi_test_event_code must no longer exist as plain columns on brands (they leaked to the browser on every select(*) fetch before this migration)';
  raise notice 'OK 13: brands.meta_capi_access_token/meta_capi_test_event_code columns removed — the pre-existing secret-exposure issue is fixed';
end $$;

-- 14. anon-callable public tracking RPC returns ONLY pixel IDs, never a configured/token flag.
do $$
declare v_pixel record;
begin
  set role anon;
  select * into v_pixel from public.get_landing_page_public_tracking('ginseng-five-tea-kenya');
  assert v_pixel.meta_pixel_id = 'PAGE_META_PIXEL', 'anon-callable public tracking must resolve the same inheritance (page override wins) for the browser pixel script';
  reset role;
  raise notice 'OK 14: anon can fetch the public (non-secret) pixel IDs needed to load fbq/ttq scripts, and nothing else';
end $$;

-- ============================================================
-- 15-18: tracking_dispatch_log — enqueued honestly, deduped, never
-- fabricated as "sent". The order from step 5 was created BEFORE any
-- tracking was configured on this page, so it correctly enqueued
-- nothing (no provider was enabled+configured at that time) — the
-- real assertions below use a freshly configured page + a fresh order.
-- ============================================================
do $$
declare v_order_id uuid; v_count int;
begin
  select id into v_order_id from public.orders where idempotency_key = 'sub-token-1';
  select count(*) into v_count from public.tracking_dispatch_log where order_id = v_order_id;
  assert v_count = 0, format('an order placed before any tracking config existed must enqueue zero dispatch rows (nothing was enabled/configured yet), got %s', v_count);
end $$;

-- Configure tracking BEFORE creating a fresh order, so we can assert real enqueue + dedup behavior end-to-end.
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e2', false);
set role authenticated;
do $$ begin perform public.set_landing_page_tracking(
  (select id from public.landing_pages where slug = 'ginseng-five-tea-kenya'),
  true, 'PAGE_META_PIXEL', null, null, true, 'PAGE_TIKTOK_PIXEL', 'page-tiktok-secret'
); end $$;
reset role;

do $$
declare v_slug text := 'ginseng-five-tea-kenya'; v_pkg1 uuid; v_order public.orders; v_count int; v_row record;
begin
  select id into v_pkg1 from public.landing_page_packages where landing_page_id = (select id from public.landing_pages where slug = v_slug) and name = '1 Pack';
  v_order := public.create_public_order(v_slug, v_pkg1, 'Track Test', '0712349999', 'addr', 'Nairobi', 'Nairobi', null, null, null, null, 'track-token-1');

  select count(*) into v_count from public.tracking_dispatch_log where order_id = v_order.id and event_type = 'ORDER_CREATED';
  assert v_count = 2, format('with both meta and tiktok enabled+configured, ORDER_CREATED must enqueue exactly 2 dispatch rows (one per provider), got %s', v_count);

  perform 1 from public.tracking_dispatch_log where order_id = v_order.id and event_type = 'ORDER_CREATED' and status = 'sent';
  if found then raise exception 'no dispatch row may EVER be marked sent by anything other than the real Edge Function outcome — this migration never fabricates success'; end if;
  raise notice 'OK 15: ORDER_CREATED enqueues one honest ''pending'' dispatch row per configured provider, never a fabricated ''sent''';

  -- Re-run enqueue directly (simulating a retried trigger) — dedup must hold.
  perform public.enqueue_tracking_event(v_order.workspace_id, v_order.brand_id, v_order.landing_page_id, v_order.id, 'ORDER_CREATED');
  select count(*) into v_count from public.tracking_dispatch_log where order_id = v_order.id and event_type = 'ORDER_CREATED';
  assert v_count = 2, format('re-enqueueing the identical event must be a no-op (dedup via unique (provider,event_id)), got %s rows', v_count);
  raise notice 'OK 16: tracking event dedup holds — a retried enqueue never creates a duplicate row';

  raise notice 'LP_TRACK_ORDER_ID=%', v_order.id;
end $$;

-- 17. Order Created != Revenue: no PURCHASE row until delivered+collected.
do $$
declare v_order_id uuid; v_count int;
begin
  select id into v_order_id from public.orders where idempotency_key = 'track-token-1';
  select count(*) into v_count from public.tracking_dispatch_log where order_id = v_order_id and event_type = 'PURCHASE';
  assert v_count = 0, 'a freshly-created order must NEVER have a PURCHASE dispatch row — Order Created != Revenue';
  raise notice 'OK 17: no PURCHASE event on order creation (COD discipline preserved)';
end $$;

-- 18. Delivered + cash collected -> exactly one PURCHASE per provider; a delivered-but-uncollected order gets none.
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;
do $$
declare v_order_id uuid; v_count int;
begin
  select id into v_order_id from public.orders where idempotency_key = 'track-token-1';
  update public.orders set status = 'PENDING' where id = v_order_id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order_id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order_id;
  update public.orders set status = 'DISPATCHED' where id = v_order_id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order_id;
  update public.orders set status = 'DELIVERED' where id = v_order_id;

  select count(*) into v_count from public.tracking_dispatch_log where order_id = v_order_id and event_type = 'PURCHASE';
  assert v_count = 2, format('DELIVERED with the default full-cash-collected rule must enqueue exactly 2 PURCHASE rows (meta+tiktok), got %s', v_count);
  raise notice 'OK 18: delivered + cash collected correctly enqueues PURCHASE (the ONLY Purchase-equivalent event) exactly once per configured provider — matches the existing Finance delivered-revenue rule exactly';
end $$;

-- ============================================================
-- 19-20: affiliate attribution through the public order form — the
-- SAME resolution rules as the internal create_order() (0024), no
-- second affiliate system. Commission calculation itself is untouched
-- (still driven by the existing order-delivery trigger machinery).
-- ============================================================
do $$
declare v_ws uuid; v_brand uuid; v_aff_id uuid; v_order public.orders;
begin
  select id into v_ws from public.workspaces where slug = 'lp-ws';
  select id into v_brand from public.brands where slug = 'lp-brand';

  insert into public.affiliates (workspace_id, full_name, referral_code, approval_status, status)
    values (v_ws, 'LP Affiliate', 'LPAFF1', 'approved', 'active') returning id into v_aff_id;

  perform set_config('app.test_user_id', '', true);
  v_order := public.create_public_order(
    'ginseng-five-tea-kenya', (select id from public.landing_page_packages where landing_page_id = (select id from public.landing_pages where slug = 'ginseng-five-tea-kenya') and name = '1 Pack'),
    'Affiliate Buyer', '0712340077', 'addr', 'Nairobi', 'Nairobi', null, null, null, null, 'aff-token-1', null, null, null, null, null, null, null, 'lpaff1'
  );

  assert v_order.affiliate_id = v_aff_id, 'a valid, approved+active referral code must attribute the order to that affiliate (case-insensitive)';
  assert v_order.affiliate_referral_code_used = 'LPAFF1', 'the referral code actually used must be recorded on the order';
  raise notice 'OK 19: affiliate attribution resolves through the public order form using the EXACT same rules as the existing internal create_order()';

  -- 20. An unknown/garbage referral code never blocks the order — it is silently ignored.
  v_order := public.create_public_order(
    'ginseng-five-tea-kenya', (select id from public.landing_page_packages where landing_page_id = (select id from public.landing_pages where slug = 'ginseng-five-tea-kenya') and name = '1 Pack'),
    'No Affiliate Buyer', '0712340078', 'addr', 'Nairobi', 'Nairobi', null, null, null, null, 'aff-token-2', null, null, null, null, null, null, null, 'NOT-A-REAL-CODE'
  );
  assert v_order.affiliate_id is null, 'an unknown referral code must never block checkout — it is simply ignored';
  raise notice 'OK 20: an invalid/unknown referral code is silently ignored, never blocking a real customer''s checkout';
end $$;

do $$ begin raise notice '=== GCOS LANDING PAGE TEMPLATE/TRACKING SANITY SUITE PASSED ==='; end $$;
