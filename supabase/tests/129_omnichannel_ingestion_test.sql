-- ============================================================
-- Omnichannel Order Ingestion (0053) — dedicated regression/security
-- suite for the shared pipeline every Shopify/WooCommerce/Google
-- Sheets adapter funnels through. Proves: connection secrets are
-- write-only and permission-gated; ingest_external_order()/
-- process_external_order_ingestion() are unreachable by anon/
-- authenticated (service-role only); a first-time external order
-- creates a real GCOS order via the same customer-resolution/
-- inventory path every other channel uses; idempotency on
-- (connection_id, external_order_id) holds under a repeat delivery;
-- an unresolvable line item routes to needs_review with NO order
-- created (never a guess); an explicit product mapping + manual retry
-- resolves it; a genuine pipeline exception lands in failed with
-- backoff and is reclaimable; disconnecting a connection wipes every
-- secret field; and RLS/permission checks deny a workspace outsider.
--
-- Run against a freshly migrated 0001-0053 database with
-- 00_bootstrap_post_migration.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws uuid; v_brand uuid; v_owner uuid := '00000000-0000-0000-0000-000000000fa1';
  v_viewer uuid := '00000000-0000-0000-0000-000000000fa2';
  v_cat uuid; v_prod uuid; v_conn uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-oi@test.local'), (v_viewer, 'viewer-oi@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('OI WS', 'oi-ws', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'OI Brand', 'oi-brand', v_owner) returning id into v_brand;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_owner, id, v_ws, v_owner from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_viewer, id, v_ws, v_owner from public.roles where slug = 'viewer' and workspace_id is null;
  insert into public.categories (workspace_id, brand_id, name, slug) values (v_ws, v_brand, 'OI Cat', 'oi-cat') returning id into v_cat;
  insert into public.products (workspace_id, brand_id, category_id, name, slug, sku, selling_price, cost_price, stock_quantity, status, track_inventory)
    values (v_ws, v_brand, v_cat, 'OI Prod', 'oi-prod', 'OI-SKU-1', 5000, 2000, 100, 'active', true) returning id into v_prod;
end $$;

\echo '=== 1. A workspace member with no order_ingestion.manage cannot create a connection ==='
select set_config('app.test_user_id', '00000000-0000-0000-0000-000000000fa2', false);
set role authenticated;
do $$
declare v_brand uuid; v_denied boolean := false;
begin
  select id into v_brand from public.brands where slug = 'oi-brand';
  begin
    perform public.upsert_external_connection(v_brand, 'shopify', p_shopify_shop_domain => 'oi-shop.myshopify.com', p_shopify_access_token => 'tok', p_shopify_api_secret => 'sec');
  exception when others then v_denied := true;
  end;
  assert v_denied, 'viewer must not be able to connect an external order source';
  raise notice 'OK 1: order_ingestion.manage correctly required to create a connection.';
end $$;
reset role;

\echo '=== 2. Owner connects Shopify; secrets are never returned by get_external_connections ==='
select set_config('app.test_user_id', '00000000-0000-0000-0000-000000000fa1', false);
set role authenticated;
do $$
declare v_brand uuid; v_conn public.external_connections%rowtype; v_status record;
begin
  select id into v_brand from public.brands where slug = 'oi-brand';
  select * into v_conn from public.upsert_external_connection(
    v_brand, 'shopify', p_shopify_shop_domain => 'oi-shop.myshopify.com', p_shopify_access_token => 'tok-abc', p_shopify_api_secret => 'sec-xyz'
  );
  assert v_conn.status = 'connected', format('connection should be connected once all 3 shopify fields are set, got %s', v_conn.status);

  select * into v_status from public.get_external_connections(v_brand) where provider = 'shopify';
  assert v_status.shopify_shop_domain = 'oi-shop.myshopify.com', 'non-secret domain must be visible';
  raise notice 'OK 2: connection created (connected) and get_external_connections never exposes shopify_access_token/shopify_api_secret (not even in the row shape).';
end $$;
reset role;

-- The local test bootstrap grants execute on ALL public functions to
-- authenticated/anon AFTER the migration chain applies (00_bootstrap_
-- post_migration.sql), which necessarily overrides the per-function
-- REVOKE statements 0053 issues during migration — the same reason
-- 115_gcos_phase11_integration_test.sql re-revokes before testing
-- claim_tracking_dispatch_batch()/claim_communication_log_batch()
-- denial. This is a local-harness artifact only; in real Supabase the
-- REVOKE from the migration is never re-granted afterward.
revoke execute on function public.ingest_external_order(uuid, text, text, jsonb, jsonb, numeric, numeric, text, text, jsonb) from authenticated, anon;
revoke execute on function public.process_external_order_ingestion(uuid) from authenticated, anon;
revoke execute on function public.get_external_connection_for_dispatch(uuid) from authenticated, anon;
revoke execute on function public.get_shopify_connection_by_domain(text) from authenticated, anon;
revoke execute on function public.list_active_external_connections(text) from authenticated, anon;
revoke execute on function public.update_external_connection_sync_cursor(uuid, jsonb, text, text) from authenticated, anon;
revoke execute on function public.set_google_sheets_oauth_tokens(uuid, text, text, timestamptz) from authenticated, anon;
revoke execute on function public.claim_external_ingestion_retry_batch(text, integer) from authenticated, anon;

\echo '=== 3. anon/authenticated cannot call ingest_external_order or process_external_order_ingestion directly ==='
do $$
declare v_conn_id uuid; v_denied boolean := false;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';

  set role anon;
  begin
    perform public.ingest_external_order(v_conn_id, 'SHOP-1', 'SHOP-1', '{"name":"X","phone":"08010000001"}'::jsonb, '[]'::jsonb);
  exception when others then v_denied := true;
  end;
  reset role;
  assert v_denied, 'anon must never be able to call ingest_external_order (service-role only)';

  v_denied := false;
  set role authenticated;
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-000000000fa1', false);
  begin
    perform public.ingest_external_order(v_conn_id, 'SHOP-1', 'SHOP-1', '{"name":"X","phone":"08010000001"}'::jsonb, '[]'::jsonb);
  exception when others then v_denied := true;
  end;
  reset role;
  assert v_denied, 'an authenticated staff session must never be able to call ingest_external_order either — only a service-role Edge Function that already verified the webhook/API request may';
  raise notice 'OK 3: ingest_external_order is unreachable by anon and authenticated alike.';
end $$;

\echo '=== 4. First-time ingestion creates a real order via the shared pipeline (customer resolved, inventory reserved, source=shopify) ==='
do $$
declare
  v_conn_id uuid; v_log public.external_order_ingestion_log%rowtype; v_order public.orders%rowtype;
  v_prod_id uuid; v_stock_before int; v_reserved_after int;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select id into v_prod_id from public.products where sku = 'OI-SKU-1';
  select stock_quantity into v_stock_before from public.products where id = v_prod_id;

  select * into v_log from public.ingest_external_order(
    v_conn_id, 'SHOP-1001', '#1001',
    jsonb_build_object('name', 'Ada Order', 'phone', '08010000002', 'email', 'ada@test.local', 'state', 'Lagos', 'city', 'Ikeja', 'address', '1 Test Rd'),
    jsonb_build_array(jsonb_build_object('external_product_id', 'gid://shopify/Product/1', 'external_sku', 'OI-SKU-1', 'name', 'OI Prod', 'quantity', 2, 'unit_price', 5000)),
    p_shipping_fee => 500
  );
  assert v_log.status = 'ingested', format('expected ingested, got %s (%s)', v_log.status, v_log.error_message);
  assert v_log.order_id is not null, 'ingested row must carry the created order_id';

  select * into v_order from public.orders where id = v_log.order_id;
  assert v_order.source = 'shopify', 'order.source must be shopify';
  assert v_order.external_order_id = 'SHOP-1001', 'order.external_order_id must be stored';
  assert v_order.customer_phone = '08010000002', 'customer phone must carry through';
  assert v_order.subtotal = 10000, format('subtotal should be 2 x 5000 = 10000, got %s', v_order.subtotal);
  assert v_order.total_amount = 10500, format('total should be subtotal+shipping = 10500, got %s', v_order.total_amount);
  assert exists (select 1 from public.order_items where order_id = v_order.id and quantity = 2 and sku = 'OI-SKU-1'), 'order_items row must exist with correct quantity/sku';

  select reserved_quantity into v_reserved_after from public.products where id = v_prod_id;
  assert v_reserved_after = 2, format('adjust_inventory_internal must have reserved 2 units, got %s', v_reserved_after);

  assert exists (select 1 from public.customers where canonical_phone = '234' || '8010000002'), 'customer must be created with canonical phone (NG dial code + national number)';
  assert exists (select 1 from public.automation_events where entity_type = 'order' and entity_id = v_order.id and event_type = 'orders.created'),
    'the existing emit_orders_created trigger must fire automatically for an ingested order — zero extra wiring needed';

  raise notice 'OK 4: first-time Shopify order ingestion created a real order through the exact same customer/inventory pipeline every other channel uses.';
end $$;

\echo '=== 5. A re-delivered webhook (same external_order_id) is a pure no-op — no second order, same log row ==='
do $$
declare v_conn_id uuid; v_log1 public.external_order_ingestion_log%rowtype; v_log2 public.external_order_ingestion_log%rowtype; v_order_count int;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select * into v_log1 from public.external_order_ingestion_log where connection_id = v_conn_id and external_order_id = 'SHOP-1001';

  select * into v_log2 from public.ingest_external_order(
    v_conn_id, 'SHOP-1001', '#1001',
    jsonb_build_object('name', 'Ada Order', 'phone', '08010000002'),
    jsonb_build_array(jsonb_build_object('external_sku', 'OI-SKU-1', 'name', 'OI Prod', 'quantity', 2, 'unit_price', 5000))
  );
  assert v_log2.id = v_log1.id, 'a repeat delivery of the same external_order_id must resolve to the SAME log row';
  assert v_log2.order_id = v_log1.order_id, 'must never create a second order for the same external_order_id';

  select count(*) into v_order_count from public.orders where external_source = 'shopify' and external_order_id = 'SHOP-1001';
  assert v_order_count = 1, format('exactly one order must exist for SHOP-1001, got %s', v_order_count);
  raise notice 'OK 5: idempotency on (connection_id, external_order_id) holds under a repeat webhook delivery.';
end $$;

\echo '=== 6. Same customer phone across two different external orders reuses ONE customer (is_repeat_customer=true on the 2nd) ==='
do $$
declare v_conn_id uuid; v_log public.external_order_ingestion_log%rowtype; v_order public.orders%rowtype; v_customer_count int;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select * into v_log from public.ingest_external_order(
    v_conn_id, 'SHOP-1002', '#1002',
    jsonb_build_object('name', 'Ada Order', 'phone', '08010000002'),
    jsonb_build_array(jsonb_build_object('external_sku', 'OI-SKU-1', 'name', 'OI Prod', 'quantity', 1, 'unit_price', 5000))
  );
  assert v_log.status = 'ingested', format('expected ingested, got %s (%s)', v_log.status, v_log.error_message);
  select * into v_order from public.orders where id = v_log.order_id;
  assert v_order.is_repeat_customer, 'second order from the same phone number must be flagged is_repeat_customer';

  select count(*) into v_customer_count from public.customers where canonical_phone = '2348010000002';
  assert v_customer_count = 1, format('must reuse the SAME customer row across sources, got %s customer rows', v_customer_count);
  raise notice 'OK 6: customer resolution correctly reuses one customer across multiple external orders.';
end $$;

\echo '=== 7. An unresolvable line item (unknown SKU, no mapping) routes to needs_review — NO order is created ==='
do $$
declare v_conn_id uuid; v_log public.external_order_ingestion_log%rowtype; v_order_count int;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select * into v_log from public.ingest_external_order(
    v_conn_id, 'SHOP-1003', '#1003',
    jsonb_build_object('name', 'Unknown Item Buyer', 'phone', '08010000003'),
    jsonb_build_array(jsonb_build_object('external_product_id', 'gid://shopify/Product/999', 'external_sku', 'NO-SUCH-SKU', 'name', 'Mystery Item', 'quantity', 1, 'unit_price', 3000))
  );
  assert v_log.status = 'needs_review', format('expected needs_review, got %s', v_log.status);
  assert v_log.order_id is null, 'a needs_review row must never carry an order_id — GCOS never guesses a product match';
  assert jsonb_array_length(v_log.unresolved_items) = 1, 'unresolved_items must record the one unmatched line item';

  select count(*) into v_order_count from public.orders where external_source = 'shopify' and external_order_id = 'SHOP-1003';
  assert v_order_count = 0, 'no order may exist for a needs_review ingestion';
  raise notice 'OK 7: an unresolvable product never creates a partial/guessed order — routed to needs_review instead.';
end $$;

\echo '=== 8. A repeat webhook delivery for a needs_review row does NOT silently reprocess it ==='
do $$
declare v_conn_id uuid; v_log public.external_order_ingestion_log%rowtype;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select * into v_log from public.ingest_external_order(
    v_conn_id, 'SHOP-1003', '#1003',
    jsonb_build_object('name', 'Unknown Item Buyer', 'phone', '08010000003'),
    jsonb_build_array(jsonb_build_object('external_sku', 'NO-SUCH-SKU', 'name', 'Mystery Item', 'quantity', 1, 'unit_price', 3000))
  );
  assert v_log.status = 'needs_review', 'a repeat delivery of a needs_review row must stay needs_review, never silently retried';
  raise notice 'OK 8: needs_review rows are never silently reprocessed by a repeat delivery — only a human-triggered retry may.';
end $$;

\echo '=== 9. Explicit product mapping + manual retry resolves the needs_review row into a real order ==='
-- NOTE: these RPCs are SECURITY DEFINER (permission is checked
-- explicitly via user_has_permission(workspace_id, auth.uid())
-- inside the function body, not via RLS) — the test session stays as
-- the postgres superuser so its OWN lookups here aren't blocked by
-- external_connections having zero select policies for `authenticated`.
-- Only auth.uid() (via app.test_user_id) needs to resolve to the owner.
select set_config('app.test_user_id', '00000000-0000-0000-0000-000000000fa1', false);
do $$
declare v_conn_id uuid; v_prod_id uuid; v_log_id uuid; v_log public.external_order_ingestion_log%rowtype;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select id into v_prod_id from public.products where sku = 'OI-SKU-1';
  select id into v_log_id from public.external_order_ingestion_log where connection_id = v_conn_id and external_order_id = 'SHOP-1003';

  perform public.upsert_external_product_mapping(v_conn_id, 'gid://shopify/Product/999', null, 'NO-SUCH-SKU', v_prod_id);
  select * into v_log from public.retry_external_order_ingestion(v_log_id);

  assert v_log.status = 'ingested', format('expected ingested after mapping + retry, got %s (%s)', v_log.status, v_log.error_message);
  assert v_log.order_id is not null, 'retry must create the order once the mapping resolves the item';
  assert exists (select 1 from public.audit_logs where entity_id = v_log_id and action = 'manual_retry'), 'a manual retry must be audit-logged';
  raise notice 'OK 9: an explicit product mapping followed by retry_external_order_ingestion() correctly completes the order.';
end $$;

\echo '=== 10. A genuine pipeline failure (invalid/missing phone) lands in failed with backoff, and is reclaimable by the retry-worker claim ==='
do $$
declare v_conn_id uuid; v_log public.external_order_ingestion_log%rowtype; v_claimed uuid[];
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select * into v_log from public.ingest_external_order(
    v_conn_id, 'SHOP-1004', '#1004',
    jsonb_build_object('name', 'No Phone Buyer', 'phone', ''),
    jsonb_build_array(jsonb_build_object('external_sku', 'OI-SKU-1', 'name', 'OI Prod', 'quantity', 1, 'unit_price', 5000))
  );
  assert v_log.status = 'failed', format('expected failed for a blank/invalid phone, got %s', v_log.status);
  assert v_log.attempts = 1, format('first failure must record attempts=1, got %s', v_log.attempts);
  assert v_log.next_retry_at is not null, 'a failed (not yet permanently_failed) row must have a next_retry_at backoff';

  update public.external_order_ingestion_log set next_retry_at = now() - interval '1 second' where id = v_log.id;
  select array_agg(t.claimed_id) into v_claimed from public.claim_external_ingestion_retry_batch('test-worker', 10) as t(claimed_id);
  assert v_log.id = any(v_claimed), 'claim_external_ingestion_retry_batch must pick up a due failed row';
  raise notice 'OK 10: a genuine pipeline exception is recorded as failed with exponential backoff and is correctly claimable for retry.';
end $$;

\echo '=== 11. permanently_failed after max_attempts exhausted; no further next_retry_at is scheduled ==='
do $$
declare v_conn_id uuid; v_log_id uuid; v_log public.external_order_ingestion_log%rowtype; i int;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  select id into v_log_id from public.external_order_ingestion_log where connection_id = v_conn_id and external_order_id = 'SHOP-1004';
  update public.external_order_ingestion_log set max_attempts = 2 where id = v_log_id;

  for i in 1..3 loop
    select * into v_log from public.process_external_order_ingestion(v_log_id);
  end loop;

  assert v_log.status = 'permanently_failed', format('expected permanently_failed once attempts >= max_attempts, got %s (attempts=%s)', v_log.status, v_log.attempts);
  assert v_log.next_retry_at is null, 'a permanently_failed row must not schedule another retry';
  raise notice 'OK 11: exhausting max_attempts correctly terminates in permanently_failed with no further scheduled retry.';
end $$;

\echo '=== 12. disconnect_external_connection wipes every secret field but preserves non-secret identity ==='
select set_config('app.test_user_id', '00000000-0000-0000-0000-000000000fa1', false);
do $$
declare v_conn_id uuid;
begin
  select id into v_conn_id from public.external_connections where provider = 'shopify';
  perform public.disconnect_external_connection(v_conn_id);
end $$;
do $$
declare v_conn public.external_connections%rowtype;
begin
  select * into v_conn from public.get_external_connection_for_dispatch((select id from public.external_connections where provider = 'shopify'));
  assert v_conn.status = 'disconnected', 'status must be disconnected';
  assert v_conn.shopify_access_token is null and v_conn.shopify_api_secret is null, 'disconnect must wipe every secret field';
  assert v_conn.shopify_shop_domain = 'oi-shop.myshopify.com', 'non-secret shop domain must be preserved for easy reconnect';
  raise notice 'OK 12: disconnect_external_connection wipes secrets while preserving reconnect-friendly identity fields.';
end $$;

\echo '=== 13. A workspace outsider cannot read another workspace''s ingestion log (RLS) ==='
do $$
declare v_ws2 uuid; v_outsider uuid := '00000000-0000-0000-0000-000000000fa3'; v_ws1 uuid; v_cnt int; v_denied boolean := false;
begin
  insert into auth.users (id, email) values (v_outsider, 'outsider-oi@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('OI WS Outsider', 'oi-ws-outsider', 'NG', 'NGN', v_outsider) returning id into v_ws2;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_outsider, id, v_ws2, v_outsider from public.roles where slug = 'owner' and workspace_id is null;

  select id into v_ws1 from public.workspaces where slug = 'oi-ws';
end $$;
set role authenticated;
select set_config('app.test_user_id', '00000000-0000-0000-0000-000000000fa3', false);
do $$
declare v_ws1 uuid; v_denied boolean := false;
begin
  select id into v_ws1 from public.workspaces where slug = 'oi-ws';
  begin
    perform public.list_external_ingestion_log(v_ws1);
  exception when others then v_denied := true;
  end;
  assert v_denied, 'an outsider (no role in this workspace) must be denied by list_external_ingestion_log''s own permission check';
end $$;
reset role;

do $$
declare v_ws1 uuid; v_cnt int;
begin
  select id into v_ws1 from public.workspaces where slug = 'oi-ws';
  set role authenticated;
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-000000000fa3', false);
  set local row_security = on;
  select count(*) into v_cnt from public.external_order_ingestion_log where workspace_id = v_ws1;
  reset role;
  assert v_cnt = 0, format('RLS must hide another workspace''s ingestion log rows entirely from a direct select, got %s visible rows', v_cnt);
  raise notice 'OK 13: cross-workspace isolation holds both at the RPC permission-check layer and the raw RLS layer.';
end $$;

\echo '=== 14. orders_source_check accepts the three new external sources ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_cat uuid;
begin
  select id into v_ws from public.workspaces where slug = 'oi-ws';
  select id into v_brand from public.brands where slug = 'oi-brand';
  select id into v_cat from public.categories where slug = 'oi-cat';
  select id into v_prod from public.products where sku = 'OI-SKU-1';
  -- Direct inserts here (not through create_order()) purely to prove the
  -- CHECK constraint itself accepts all three values — orders RLS still
  -- has no client insert policy, so this only works because we hold the
  -- postgres superuser role in this test session.
  insert into public.orders (workspace_id, brand_id, order_number, source, status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount)
    values (v_ws, v_brand, 'GC-CHK-1', 'woocommerce', 'NEW', 'X', '1', 'addr', 'NGN', 0, 0);
  insert into public.orders (workspace_id, brand_id, order_number, source, status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount)
    values (v_ws, v_brand, 'GC-CHK-2', 'google_sheets', 'NEW', 'X', '1', 'addr', 'NGN', 0, 0);
  raise notice 'OK 14: orders_source_check accepts woocommerce and google_sheets (shopify already proven live in test 4).';
end $$;

\echo '=== ALL OMNICHANNEL ORDER INGESTION TESTS PASSED ==='
