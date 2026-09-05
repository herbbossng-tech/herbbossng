-- ============================================================
-- Phase 4 Finance/Analytics/Reports smoke test.
-- Run against a fresh DB that already has the full 0001-0022 chain
-- applied. Not committed to the repo — local validation only.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_owner_role_id uuid;
  v_user_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_ws1 uuid; v_brand1 uuid;
  v_ws2 uuid; v_brand2 uuid;
  v_prod_a uuid; v_prod_b uuid;
begin
  insert into auth.users (id, email) values (v_user_id, 'owner@test.local') on conflict do nothing;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Test NG', 'test-ng', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws1;
  insert into public.brands (workspace_id, name, slug) values (v_ws1, 'Test Brand NG', 'test-brand-ng') returning id into v_brand1;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Test KE', 'test-ke', 'KE', 'KES', 'Africa/Nairobi') returning id into v_ws2;
  insert into public.brands (workspace_id, name, slug) values (v_ws2, 'Test Brand KE', 'test-brand-ke') returning id into v_brand2;

  select id into v_owner_role_id from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_user_id, v_ws1, v_owner_role_id);
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_user_id, v_ws2, v_owner_role_id);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws1, v_brand1, 'Product A', 'product-a', 'SKU-A', 'active', 5000, 2000, 100) returning id into v_prod_a;
  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws1, v_brand1, 'Product B', 'product-b', 'SKU-B', 'active', 3000, 1000, 100) returning id into v_prod_b;
end $$;

-- Override auth.uid() for the rest of this session to the seeded owner.
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
$$;

-- ---------------------------------------------------------------
-- Build a realistic order set in workspace 1.
-- ---------------------------------------------------------------
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod_a uuid; v_prod_b uuid;
  v_order1 public.orders; v_order2 public.orders; v_order3 public.orders;
  v_order4 public.orders; v_order5 public.orders;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_brand1 from public.brands where slug = 'test-brand-ng';
  select id into v_prod_a from public.products where sku = 'SKU-A';
  select id into v_prod_b from public.products where sku = 'SKU-B';

  -- Order 1: 2x Product A, walked to DELIVERED (collected).
  select * into v_order1 from public.create_order(
    v_ws1, v_brand1, 'manual', 'Amaka Delivered', '08011110001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 2)),
    p_shipping_fee := 500
  );
  update public.orders set status = 'PENDING' where id = v_order1.id;
  update public.orders set status = 'WILL_CALL_BACK' where id = v_order1.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order1.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order1.id;
  update public.orders set status = 'DISPATCHED' where id = v_order1.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order1.id;
  update public.orders set status = 'DELIVERED' where id = v_order1.id;

  -- Order 2: 1x Product B, stays PENDING.
  select * into v_order2 from public.create_order(
    v_ws1, v_brand1, 'manual', 'Bola Pending', '08022220002', '2 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod_b, 'quantity', 1))
  );
  update public.orders set status = 'PENDING' where id = v_order2.id;

  -- Order 3: 3x Product A, DISPATCHED then RETURNED.
  select * into v_order3 from public.create_order(
    v_ws1, v_brand1, 'manual', 'Chidi Returned', '08033330003', '3 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 3))
  );
  update public.orders set status = 'PENDING' where id = v_order3.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order3.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order3.id;
  update public.orders set status = 'DISPATCHED' where id = v_order3.id;
  update public.orders set status = 'RETURNED', return_reason = 'Customer refused delivery' where id = v_order3.id;

  -- Order 4: 1x Product A, CANCELLED straight from NEW.
  select * into v_order4 from public.create_order(
    v_ws1, v_brand1, 'manual', 'Dayo Cancelled', '08044440004', '4 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 1))
  );
  update public.orders set status = 'CANCELLED', cancellation_reason = 'Duplicate order' where id = v_order4.id;

  -- Order 5: same customer phone as Order 1 (repeat), 1x Product B, DELIVERED.
  select * into v_order5 from public.create_order(
    v_ws1, v_brand1, 'manual', 'Amaka Delivered', '08011110001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod_b, 'quantity', 1))
  );
  update public.orders set status = 'PENDING' where id = v_order5.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order5.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order5.id;
  update public.orders set status = 'DISPATCHED' where id = v_order5.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order5.id;
  update public.orders set status = 'DELIVERED' where id = v_order5.id;

  assert (select is_repeat_customer from public.orders where id = v_order5.id) = true, 'Order 5 should be a repeat customer';
end $$;

-- A tiny order in workspace 2 (Kenya) to prove isolation.
do $$
declare
  v_ws2 uuid; v_brand2 uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws2 from public.workspaces where slug = 'test-ke';
  select id into v_brand2 from public.brands where slug = 'test-brand-ke';
  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws2, v_brand2, 'KE Product', 'ke-product', 'SKU-KE', 'active', 2000, 800, 50) returning id into v_prod;
  select * into v_order from public.create_order(
    v_ws2, v_brand2, 'manual', 'Kenyan Buyer', '0712345678', '5 Nairobi Road',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1))
  );
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id;
end $$;

-- ---------------------------------------------------------------
-- Assertions: get_finance_summary()
-- ---------------------------------------------------------------
do $$
declare
  v_ws1 uuid; v_brand1 uuid;
  v_summary record;
  v_order_stats record;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_brand1 from public.brands where slug = 'test-brand-ng';

  select * into v_summary from public.get_finance_summary(v_ws1, v_brand1, null, null);

  -- Order totals: O1=10500 (2*5000+500), O2=3000, O3=15000 (3*5000), O4=5000 (cancelled, excluded), O5=3000
  -- total_sales_value = O1+O2+O3+O5 = 10500+3000+15000+3000 = 31500
  raise notice 'total_sales_value=% (expect 31500) total_orders=% (expect 4)', v_summary.total_sales_value, v_summary.total_orders;
  assert v_summary.total_sales_value = 31500, 'total_sales_value mismatch: ' || v_summary.total_sales_value;
  assert v_summary.total_orders = 4, 'total_orders mismatch (cancelled must be excluded): ' || v_summary.total_orders;

  assert v_summary.delivered_revenue = 13500, 'delivered_revenue mismatch (O1 10500 + O5 3000): ' || v_summary.delivered_revenue;
  assert v_summary.delivered_orders = 2, 'delivered_orders mismatch: ' || v_summary.delivered_orders;

  assert v_summary.pending_revenue = 3000, 'pending_revenue mismatch (O2 only): ' || v_summary.pending_revenue;
  assert v_summary.pending_orders = 1, 'pending_orders mismatch: ' || v_summary.pending_orders;

  assert v_summary.returned_value = 15000, 'returned_value mismatch (O3): ' || v_summary.returned_value;
  assert v_summary.returned_orders = 1, 'returned_orders mismatch: ' || v_summary.returned_orders;

  assert v_summary.cancelled_value = 5000, 'cancelled_value mismatch (O4): ' || v_summary.cancelled_value;
  assert v_summary.cancelled_orders = 1, 'cancelled_orders mismatch: ' || v_summary.cancelled_orders;

  assert v_summary.average_order_value = round(31500.0 / 4, 2), 'AOV mismatch: ' || v_summary.average_order_value;
  assert v_summary.average_delivered_order_value = round(13500.0 / 2, 2), 'avg delivered OV mismatch: ' || v_summary.average_delivered_order_value;

  -- COGS: O1 = 2*2000=4000, O5 = 1*1000=1000 => cogs_delivered=5000, gross_profit=13500-5000=8500
  assert v_summary.cogs_delivered = 5000, 'cogs_delivered mismatch: ' || v_summary.cogs_delivered;
  assert v_summary.gross_profit = 8500, 'gross_profit mismatch: ' || v_summary.gross_profit;

  -- Cross-check delivery_success_rate against get_order_stats() — must be identical (same formula).
  select * into v_order_stats from public.get_order_stats(v_ws1, v_brand1);
  assert v_summary.delivery_success_rate = v_order_stats.delivery_success_rate,
    format('delivery_success_rate diverged from get_order_stats(): finance=%s orders=%s', v_summary.delivery_success_rate, v_order_stats.delivery_success_rate);
  raise notice 'delivery_success_rate=% matches get_order_stats()=%', v_summary.delivery_success_rate, v_order_stats.delivery_success_rate;

  -- No actual_delivery_cost recorded anywhere -> contribution profit must be honestly absent, not fabricated.
  assert v_summary.contribution_profit_orders_count = 0, 'contribution_profit_orders_count should be 0 when no actual_delivery_cost recorded';
  assert v_summary.contribution_profit = 0, 'contribution_profit should be 0 (not fabricated) with no cost data';

  raise notice 'get_finance_summary() OK';
end $$;

-- Workspace isolation: workspace 2's order must never appear in workspace 1's numbers, and vice versa.
do $$
declare
  v_ws1 uuid; v_ws2 uuid;
  v_s1 record; v_s2 record;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_ws2 from public.workspaces where slug = 'test-ke';
  select * into v_s1 from public.get_finance_summary(v_ws1, null, null, null);
  select * into v_s2 from public.get_finance_summary(v_ws2, null, null, null);
  assert v_s1.total_orders = 4, 'ws1 leaked/missed rows: ' || v_s1.total_orders;
  assert v_s2.total_orders = 1, 'ws2 leaked/missed rows: ' || v_s2.total_orders;
  assert v_s2.delivered_revenue = 2000, 'ws2 delivered_revenue mismatch: ' || v_s2.delivered_revenue;
  raise notice 'Workspace isolation OK (ws1 orders=%, ws2 orders=%)', v_s1.total_orders, v_s2.total_orders;
end $$;

-- Zero-data state: a workspace with zero orders must not crash and must return zeros.
do $$
declare
  v_ws3 uuid; v_s record;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Empty WS', 'test-empty', 'GH', 'GHS', 'Africa/Accra') returning id into v_ws3;
  select * into v_s from public.get_finance_summary(v_ws3, null, null, null);
  assert v_s.total_sales_value = 0 and v_s.total_orders = 0 and v_s.delivered_revenue = 0
     and v_s.average_order_value = 0 and v_s.delivery_success_rate = 0, 'zero-data state should be all-zero, got: ' || v_s::text;

  perform * from public.get_order_status_value_breakdown(v_ws3, null, null, null);
  perform * from public.get_delivery_funnel_stats(v_ws3, null, null, null);
  perform * from public.get_revenue_trend(v_ws3, null, null, null, 'day');
  perform * from public.get_product_performance(v_ws3, null, null, null, 50);
  perform * from public.get_customer_analytics(v_ws3, null, null, null);
  perform * from public.get_landing_page_analytics(v_ws3, null, null, null, 50);
  raise notice 'Zero-data states OK (no crash across all 7 RPCs)';
end $$;

-- Order status value breakdown: always 11 rows, in lifecycle order, "Repeated Order" must never appear.
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_count int; v_bad int;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_brand1 from public.brands where slug = 'test-brand-ng';
  select count(*) into v_count from public.get_order_status_value_breakdown(v_ws1, v_brand1, null, null);
  assert v_count = 11, 'expected exactly 11 status rows, got ' || v_count;
  select count(*) into v_bad from public.get_order_status_value_breakdown(v_ws1, v_brand1, null, null) where status ilike '%repeat%';
  assert v_bad = 0, 'Repeated Order must never appear as a lifecycle status';

  perform 1 from public.get_order_status_value_breakdown(v_ws1, v_brand1, null, null) where status = 'DELIVERED' and order_count = 2 and order_value = 13500;
  if not found then raise exception 'DELIVERED status row mismatch'; end if;
  perform 1 from public.get_order_status_value_breakdown(v_ws1, v_brand1, null, null) where status = 'CANCELLED' and order_count = 1 and order_value = 5000;
  if not found then raise exception 'CANCELLED status row mismatch'; end if;
  raise notice 'get_order_status_value_breakdown() OK';
end $$;

-- Delivery funnel stages must be monotonically non-increasing down the funnel.
do $$
declare
  v_ws1 uuid; v_brand1 uuid;
  v_created bigint; v_confirmed bigint; v_dispatched bigint; v_delivered bigint; v_collected bigint;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_brand1 from public.brands where slug = 'test-brand-ng';
  select order_count into v_created from public.get_delivery_funnel_stats(v_ws1, v_brand1, null, null) where stage = 'CREATED';
  select order_count into v_confirmed from public.get_delivery_funnel_stats(v_ws1, v_brand1, null, null) where stage = 'CONFIRMED';
  select order_count into v_dispatched from public.get_delivery_funnel_stats(v_ws1, v_brand1, null, null) where stage = 'DISPATCHED';
  select order_count into v_delivered from public.get_delivery_funnel_stats(v_ws1, v_brand1, null, null) where stage = 'DELIVERED';
  select order_count into v_collected from public.get_delivery_funnel_stats(v_ws1, v_brand1, null, null) where stage = 'CASH_COLLECTED';
  assert v_created = 5, 'CREATED should include all 5 orders (incl. cancelled): ' || v_created;
  assert v_confirmed <= v_created and v_dispatched <= v_confirmed and v_delivered <= v_dispatched and v_collected <= v_delivered,
    format('funnel not monotonic: %s/%s/%s/%s/%s', v_created, v_confirmed, v_dispatched, v_delivered, v_collected);
  assert v_delivered = 2 and v_collected = 2, format('expected 2 delivered+collected, got %s/%s', v_delivered, v_collected);
  raise notice 'get_delivery_funnel_stats() OK (%/%/%/%/%)', v_created, v_confirmed, v_dispatched, v_delivered, v_collected;
end $$;

-- Product performance: COGS/gross profit correctness per product.
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_a record; v_b record;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_brand1 from public.brands where slug = 'test-brand-ng';
  select * into v_a from public.get_product_performance(v_ws1, v_brand1, null, null, 50) where sku = 'SKU-A';
  select * into v_b from public.get_product_performance(v_ws1, v_brand1, null, null, 50) where sku = 'SKU-B';

  -- Product A: delivered qty = 2 (order1 only; order3 returned, order4 cancelled) => delivered_revenue=10000, cogs=2*2000=4000
  assert v_a.delivered_revenue = 10000, 'Product A delivered_revenue mismatch: ' || v_a.delivered_revenue;
  assert v_a.cogs_delivered = 4000, 'Product A cogs_delivered mismatch: ' || v_a.cogs_delivered;
  assert v_a.gross_profit = 6000, 'Product A gross_profit mismatch: ' || v_a.gross_profit;
  assert v_a.returned_orders = 1 and v_a.cancelled_orders = 1, 'Product A returned/cancelled mismatch';
  assert v_a.items_with_cost_data = v_a.items_delivered, 'Product A should have full cost coverage on new orders';

  -- Product B: delivered qty = 1 (order5) => delivered_revenue=3000, cogs=1*1000=1000
  assert v_b.delivered_revenue = 3000, 'Product B delivered_revenue mismatch: ' || v_b.delivered_revenue;
  assert v_b.cogs_delivered = 1000, 'Product B cogs_delivered mismatch: ' || v_b.cogs_delivered;
  assert v_b.gross_profit = 2000, 'Product B gross_profit mismatch: ' || v_b.gross_profit;

  raise notice 'get_product_performance() OK';
end $$;

-- Customer analytics: repeat customer correctness.
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_c record;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_brand1 from public.brands where slug = 'test-brand-ng';
  select * into v_c from public.get_customer_analytics(v_ws1, v_brand1, null, null);
  assert v_c.total_customers = 4, 'expected 4 distinct customers, got ' || v_c.total_customers;
  assert v_c.repeat_customers = 1, 'expected 1 repeat customer (Amaka), got ' || v_c.repeat_customers;
  raise notice 'get_customer_analytics() OK (total=%, repeat=%)', v_c.total_customers, v_c.repeat_customers;
end $$;

-- Landing page attribution: create a published page + package, submit a
-- public order, confirm it shows up in get_landing_page_analytics().
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod_a uuid;
  v_page_id uuid; v_pkg_id uuid; v_order public.orders;
  v_lp record;
begin
  select id into v_ws1 from public.workspaces where slug = 'test-ng';
  select id into v_brand1 from public.brands where slug = 'test-brand-ng';
  select id into v_prod_a from public.products where sku = 'SKU-A';

  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, status, published_at)
    values (v_ws1, v_brand1, v_prod_a, 'Test Funnel', 'test-funnel', 'published', now())
    returning id into v_page_id;
  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, quantity, price, enabled, is_default)
    values (v_page_id, v_ws1, v_brand1, 'Single Pack', 1, 4500, true, true)
    returning id into v_pkg_id;

  select * into v_order from public.create_public_order(
    'test-funnel', v_pkg_id, 'Efe Funnel Buyer', '08055550005', '6 Funnel Ave', 'Lagos', 'Lagos'
  );
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id;

  select * into v_lp from public.get_landing_page_analytics(v_ws1, v_brand1, null, null, 50) where landing_page_id = v_page_id;
  assert v_lp.orders_count = 1, 'expected 1 order attributed to test-funnel, got ' || v_lp.orders_count;
  assert v_lp.delivered_revenue = 4500, 'expected 4500 delivered revenue for test-funnel, got ' || v_lp.delivered_revenue;

  -- Confirm order_items.unit_cost was populated for the public flow too.
  perform 1 from public.order_items where order_id = v_order.id and unit_cost = 2000;
  if not found then raise exception 'create_public_order() did not snapshot order_items.unit_cost'; end if;

  raise notice 'get_landing_page_analytics() OK, unit_cost snapshot OK';
end $$;

-- Finance permission catalogue sanity: finance.view/export/manage exist,
-- and Customer Support / Warehouse Staff must NOT have been granted any.
do $$
declare v_leak int;
begin
  perform 1 from public.permissions where slug in ('finance.view', 'finance.export', 'finance.manage');
  if not found then raise exception 'finance permission slugs missing'; end if;

  select count(*) into v_leak
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where r.slug in ('customer-support', 'warehouse-staff') and p.module = 'finance';
  assert v_leak = 0, 'Customer Support / Warehouse Staff must not hold any finance permission, found ' || v_leak;

  raise notice 'Finance permission catalogue OK';
end $$;

do $$ begin raise notice '=== ALL FINANCE/ANALYTICS SMOKE TESTS PASSED ==='; end $$;
