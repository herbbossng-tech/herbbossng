-- ============================================================
-- Phase 6 (COD Operations, Fulfillment & Delivery) smoke test.
-- Run against a fresh DB with 0001-0025 applied + grant_authenticated.sql.
-- Part 1 impersonates real users AS THE `authenticated` role (RLS
-- genuinely enforced) to prove get_order_stats()'s finance-visibility
-- fix; Part 2+ overrides auth.uid() under superuser (matches the
-- existing finance/affiliate smoke test convention) to exercise
-- business logic. Local-only, not committed.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

-- ================================================================
-- PART 1 — SECURITY: get_order_stats() finance-visibility matrix.
-- ================================================================
do $$
declare
  v_ws_a uuid; v_brand_a uuid; v_ws_b uuid; v_brand_b uuid;
  v_owner_role uuid; v_manager_role uuid; v_cs_role uuid; v_wh_role uuid; v_fin_role uuid;
  v_prod uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Ops Sec A', 'ops-sec-a', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_a;
  insert into public.brands (workspace_id, name, slug) values (v_ws_a, 'Ops Brand A', 'ops-brand-a') returning id into v_brand_a;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Ops Sec B', 'ops-sec-b', 'GH', 'GHS', 'Africa/Accra') returning id into v_ws_b;
  insert into public.brands (workspace_id, name, slug) values (v_ws_b, 'Ops Brand B', 'ops-brand-b') returning id into v_brand_b;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_manager_role from public.roles where slug = 'manager' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_wh_role from public.roles where slug = 'warehouse-staff' and workspace_id is null;
  select id into v_fin_role from public.roles where slug = 'finance' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000c1', 'owner-c@test.local'),
    ('00000000-0000-0000-0000-0000000000c2', 'manager-c@test.local'),
    ('00000000-0000-0000-0000-0000000000c3', 'cs-c@test.local'),
    ('00000000-0000-0000-0000-0000000000c4', 'warehouse-c@test.local'),
    ('00000000-0000-0000-0000-0000000000c5', 'finance-c@test.local'),
    ('00000000-0000-0000-0000-0000000000c6', 'owner-b-workspace@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000c1', v_owner_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000c2', v_manager_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000c3', v_cs_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000c4', v_wh_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000c5', v_fin_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000c6', v_owner_role, v_ws_b);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws_a, v_brand_a, 'Sec Product', 'ops-sec-product', 'OPS-SEC-1', 'active', 5000, 2000, 50) returning id into v_prod;
end $$;

-- Deliberately does NOT redefine auth.uid() to a hardcoded value —
-- doing that would clobber grant_authenticated.sql's GUC-reading
-- version and break every impersonation check below it in this same
-- file (a real bug caught while first running this test: auth.uid()
-- kept resolving to the Owner no matter which user's GUC was set).
-- Setting the GUC directly (even as postgres, before SET ROLE) is
-- enough for auth.uid() to resolve correctly for create_order()'s
-- own permission check and created_by stamping.
\set owner_a '00000000-0000-0000-0000-0000000000c1'
\set manager_a '00000000-0000-0000-0000-0000000000c2'
\set cs_a '00000000-0000-0000-0000-0000000000c3'
\set warehouse_a '00000000-0000-0000-0000-0000000000c4'
\set finance_a '00000000-0000-0000-0000-0000000000c5'
\set owner_b '00000000-0000-0000-0000-0000000000c6'

select set_config('app.test_user_id', :'owner_a', false);

-- Owner (finance-visible) creates and delivers one order in WS A so
-- there is real revenue to try to leak.
do $$
declare
  v_ws_a uuid; v_brand_a uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws_a from public.workspaces where slug = 'ops-sec-a';
  select id into v_brand_a from public.brands where slug = 'ops-brand-a';
  select id into v_prod from public.products where sku = 'OPS-SEC-1';

  v_order := public.create_order(
    v_ws_a, v_brand_a, 'manual', 'Sec Buyer', '08033330001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2))
  );
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id;
end $$;

\echo '=== 1/2. Owner and Manager (finance-visible) see real revenue ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare
  v_ws_a uuid; v_stats record;
begin
  select id into v_ws_a from public.workspaces where slug = 'ops-sec-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 10000, format('Owner should see real delivered_revenue, got %s', v_stats.delivered_revenue);
  assert v_stats.delivered_count = 1, format('Owner should see delivered_count=1, got %s', v_stats.delivered_count);
  raise notice 'OK: Owner sees delivered_revenue=%', v_stats.delivered_revenue;
end $$;

select set_config('app.test_user_id', :'manager_a', false);
do $$
declare
  v_ws_a uuid; v_stats record;
begin
  select id into v_ws_a from public.workspaces where slug = 'ops-sec-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 10000, format('Manager (has finance.view) should see real delivered_revenue, got %s', v_stats.delivered_revenue);
  raise notice 'OK: Manager sees delivered_revenue=%', v_stats.delivered_revenue;
end $$;

\echo '=== 3. Customer Support: counts real, revenue zeroed ==='
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare
  v_ws_a uuid; v_stats record;
begin
  select id into v_ws_a from public.workspaces where slug = 'ops-sec-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 0, format('Customer Support must NOT see delivered_revenue, got %s', v_stats.delivered_revenue);
  assert v_stats.total_sales_value = 0, format('Customer Support must NOT see total_sales_value, got %s', v_stats.total_sales_value);
  assert v_stats.delivered_count = 1, format('Customer Support SHOULD still see the operational count delivered_count=1, got %s', v_stats.delivered_count);
  assert v_stats.total_orders = 1, format('Customer Support SHOULD still see total_orders=1, got %s', v_stats.total_orders);
  raise notice 'OK: Customer Support sees counts but zeroed revenue.';
end $$;

\echo '=== 4. Warehouse Staff: counts real, revenue zeroed ==='
select set_config('app.test_user_id', :'warehouse_a', false);
do $$
declare
  v_ws_a uuid; v_stats record;
begin
  select id into v_ws_a from public.workspaces where slug = 'ops-sec-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 0, format('Warehouse Staff must NOT see delivered_revenue, got %s', v_stats.delivered_revenue);
  assert v_stats.cancelled_value = 0, format('Warehouse Staff must NOT see cancelled_value, got %s', v_stats.cancelled_value);
  assert v_stats.delivered_count = 1, format('Warehouse Staff SHOULD still see delivered_count=1, got %s', v_stats.delivered_count);
  raise notice 'OK: Warehouse Staff sees counts but zeroed revenue.';
end $$;

\echo '=== 5. Cross-workspace isolation: WS B owner querying WS A gets zero rows worth of data ==='
select set_config('app.test_user_id', :'owner_b', false);
do $$
declare
  v_ws_a uuid; v_stats record;
begin
  select id into v_ws_a from public.workspaces where slug = 'ops-sec-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.total_orders = 0, format('A user with no role in WS A must see total_orders=0, got %s', v_stats.total_orders);
  assert v_stats.delivered_revenue = 0, format('A user with no role in WS A must see delivered_revenue=0, got %s', v_stats.delivered_revenue);
  raise notice 'OK: cross-workspace caller sees fully zeroed stats.';
end $$;

\echo '=== 6. Zero-data state: a brand-new empty workspace returns a clean zeroed row, not an error ==='
reset role;
do $$
declare
  v_ws_empty uuid; v_owner_role uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Ops Sec Empty', 'ops-sec-empty', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_empty;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id) values ('00000000-0000-0000-0000-0000000000c1', v_owner_role, v_ws_empty);
end $$;

set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare
  v_ws_empty uuid; v_stats record;
begin
  select id into v_ws_empty from public.workspaces where slug = 'ops-sec-empty';
  select * into v_stats from public.get_order_stats(v_ws_empty);
  assert v_stats.total_orders = 0, format('Empty workspace should report total_orders=0, got %s', v_stats.total_orders);
  assert v_stats.delivery_success_rate = 0, format('Empty workspace should report delivery_success_rate=0, got %s', v_stats.delivery_success_rate);
  raise notice 'OK: empty workspace returns a clean zeroed row.';
end $$;
reset role;

\echo '=== ALL get_order_stats() FINANCE-VISIBILITY TESTS PASSED ==='


-- ================================================================
-- PART 2 — FUNCTIONAL: Tasks, Fulfillment/Inventory, Waybills,
-- Delivery Attempts, COD collection, Settlement, Bulk ops.
-- (auth.uid() override under superuser — matches the existing
-- finance/affiliate smoke test convention for business-logic tests.)
-- ================================================================
do $$
declare
  v_owner_role_id uuid;
  v_user_id uuid := 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
  v_ws1 uuid; v_brand1 uuid; v_prod uuid;
begin
  insert into auth.users (id, email) values (v_user_id, 'ops-owner@test.local') on conflict do nothing;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Ops Func WS', 'ops-func-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws1;
  insert into public.brands (workspace_id, name, slug) values (v_ws1, 'Ops Func Brand', 'ops-func-brand') returning id into v_brand1;

  select id into v_owner_role_id from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_user_id, v_ws1, v_owner_role_id);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws1, v_brand1, 'Func Product', 'ops-func-product', 'OPS-FUNC-1', 'active', 4000, 1500, 100) returning id into v_prod;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'aaaaaaaa-bbbb-cccc-dddd-000000000001'::uuid
$$;

\echo '=== 7. Follow-up Tasks: create, assign, complete, overdue detection, workspace isolation ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod uuid; v_order public.orders;
  v_task public.order_tasks;
  v_stats record;
  v_other_user uuid := 'aaaaaaaa-bbbb-cccc-dddd-000000000002';
begin
  select id into v_ws1 from public.workspaces where slug = 'ops-func-ws';
  select id into v_brand1 from public.brands where slug = 'ops-func-brand';
  select id into v_prod from public.products where sku = 'OPS-FUNC-1';
  insert into auth.users (id, email) values (v_other_user, 'assignee@test.local') on conflict do nothing;

  v_order := public.create_order(
    v_ws1, v_brand1, 'manual', 'Task Buyer', '08044440001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1))
  );

  v_task := public.create_order_task(v_order.id, 'CONFIRM_ORDER', 'Call to confirm order', null, 'high', null, now() - interval '1 hour');
  assert v_task.status = 'OPEN', 'expected OPEN status';
  raise notice 'OK: task created (overdue by design: due_at in the past).';

  v_task := public.assign_order_task(v_task.id, v_other_user);
  assert v_task.assigned_to = v_other_user, 'expected assignment to stick';
  raise notice 'OK: task assigned.';

  v_task := public.update_order_task_status(v_task.id, 'IN_PROGRESS');
  assert v_task.status = 'IN_PROGRESS', 'expected IN_PROGRESS';

  select * into v_stats from public.get_task_stats(v_ws1);
  assert v_stats.overdue_count = 1, format('expected 1 overdue task, got %s', v_stats.overdue_count);
  raise notice 'OK: overdue detection works (overdue_count=%).', v_stats.overdue_count;

  v_task := public.update_order_task_status(v_task.id, 'COMPLETED');
  assert v_task.status = 'COMPLETED' and v_task.completed_at is not null, 'expected COMPLETED with a timestamp';
  raise notice 'OK: task completed.';

  begin
    perform public.update_order_task_status(v_task.id, 'OPEN');
    raise exception 'reopening a completed task should have failed';
  exception when others then
    raise notice 'OK: cannot mutate a completed task (%).', sqlerrm;
  end;
end $$;

\echo '=== 8. Fulfillment + Inventory: no double stock deduction across the full lifecycle ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod uuid; v_order public.orders;
  v_waybill public.waybills;
  v_stock_before integer; v_stock_after_pack integer; v_stock_after_delivery integer;
begin
  select id into v_ws1 from public.workspaces where slug = 'ops-func-ws';
  select id into v_brand1 from public.brands where slug = 'ops-func-brand';
  select id into v_prod from public.products where sku = 'OPS-FUNC-1';

  select stock_quantity into v_stock_before from public.products where id = v_prod;

  v_order := public.create_order(
    v_ws1, v_brand1, 'manual', 'Fulfillment Buyer', '08055550001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 3))
  );
  -- create_order only RESERVES stock — stock_quantity itself must be unchanged.
  select stock_quantity into v_stock_after_pack from public.products where id = v_prod;
  assert v_stock_after_pack = v_stock_before, format('stock_quantity must not change on order creation (only reserved_quantity), got %s vs %s', v_stock_after_pack, v_stock_before);

  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;

  perform public.mark_order_packed(v_order.id);
  select stock_quantity into v_stock_after_pack from public.products where id = v_prod;
  assert v_stock_after_pack = v_stock_before, format('packing must not move stock_quantity, got %s vs %s', v_stock_after_pack, v_stock_before);
  raise notice 'OK: packing does not touch inventory.';

  v_waybill := public.create_waybill(v_order.id, null, null, null, null, 'test waybill');
  assert v_waybill.status = 'CREATED', 'expected CREATED status';

  v_waybill := public.update_waybill_status(v_waybill.id, 'READY');
  v_waybill := public.update_waybill_status(v_waybill.id, 'DISPATCHED');
  assert v_waybill.dispatched_at is not null, 'expected dispatched_at to be stamped';

  select * into v_order from public.orders where id = v_order.id;
  assert v_order.status = 'DISPATCHED', format('waybill dispatch should have coupled the order to DISPATCHED, got %s', v_order.status);
  raise notice 'OK: waybill dispatch coupled order status to DISPATCHED.';

  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;

  perform public.record_delivery_attempt(v_order.id, 'DELIVERED', v_waybill.id);
  select * into v_order from public.orders where id = v_order.id;
  assert v_order.status = 'DELIVERED', format('delivery attempt should have coupled order status to DELIVERED, got %s', v_order.status);
  assert v_order.cash_collection_status = 'pending', format('Phase 6 delivery path must NOT auto-collect cash, got %s', v_order.cash_collection_status);
  raise notice 'OK: order delivered, cash_collection_status correctly left pending (delivered != collected).';

  -- Stock should now be SOLD exactly once (decremented by 3, no double-deduction).
  select stock_quantity into v_stock_after_delivery from public.products where id = v_prod;
  assert v_stock_after_delivery = v_stock_before - 3, format('expected stock to drop by exactly 3 (SOLD once), got %s (before %s)', v_stock_after_delivery, v_stock_before);
  raise notice 'OK: inventory decremented exactly once (% -> %), no double deduction.', v_stock_before, v_stock_after_delivery;
end $$;

\echo '=== 9. Delivery Attempts: multiple attempts, failed then delivered, denormalized counters ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod uuid; v_order public.orders;
  v_attempt public.delivery_attempts;
begin
  select id into v_ws1 from public.workspaces where slug = 'ops-func-ws';
  select id into v_brand1 from public.brands where slug = 'ops-func-brand';
  select id into v_prod from public.products where sku = 'OPS-FUNC-1';

  v_order := public.create_order(
    v_ws1, v_brand1, 'manual', 'Attempts Buyer', '08066660001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1))
  );
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;

  v_attempt := public.record_delivery_attempt(v_order.id, 'CUSTOMER_UNAVAILABLE', null, null, 'No answer');
  assert v_attempt.attempt_number = 1, format('expected attempt_number 1, got %s', v_attempt.attempt_number);

  v_attempt := public.record_delivery_attempt(v_order.id, 'WRONG_ADDRESS', null, null, 'House not found');
  assert v_attempt.attempt_number = 2, format('expected attempt_number 2, got %s', v_attempt.attempt_number);

  select * into v_order from public.orders where id = v_order.id;
  assert v_order.delivery_attempts_count = 2, format('expected delivery_attempts_count=2, got %s', v_order.delivery_attempts_count);
  assert v_order.failed_delivery_reason = 'House not found', format('expected latest failure reason snapshot, got %s', v_order.failed_delivery_reason);
  assert v_order.status = 'IN_TRANSIT', format('a non-DELIVERED attempt must never change order status, got %s', v_order.status);
  raise notice 'OK: 2 failed attempts recorded, denormalized counters correct, status untouched.';

  v_attempt := public.record_delivery_attempt(v_order.id, 'DELIVERED', null, null);
  assert v_attempt.attempt_number = 3, format('expected attempt_number 3, got %s', v_attempt.attempt_number);
  select * into v_order from public.orders where id = v_order.id;
  assert v_order.status = 'DELIVERED', format('expected DELIVERED after 3rd attempt, got %s', v_order.status);
  assert v_order.delivery_attempts_count = 3, format('expected delivery_attempts_count=3, got %s', v_order.delivery_attempts_count);
  raise notice 'OK: delivered on 3rd attempt, counters correct.';
end $$;

\echo '=== 10. COD Cash Collection: partial collection + validation ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws1 from public.workspaces where slug = 'ops-func-ws';
  select id into v_brand1 from public.brands where slug = 'ops-func-brand';
  select id into v_prod from public.products where sku = 'OPS-FUNC-1';

  v_order := public.create_order(
    v_ws1, v_brand1, 'manual', 'Cash Buyer', '08077770001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2))
  );
  -- 2 x 4000 = 8000 total.

  begin
    perform public.record_cash_collection(v_order.id, 8000, 'too early');
    raise exception 'collecting cash on a non-delivered order should have failed';
  exception when others then
    raise notice 'OK: cannot collect cash before delivery (%).', sqlerrm;
  end;

  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  perform public.record_delivery_attempt(v_order.id, 'DELIVERED');

  begin
    perform public.record_cash_collection(v_order.id, 9000, 'too much');
    raise exception 'over-collecting should have failed';
  exception when others then
    raise notice 'OK: cannot collect more than the order total (%).', sqlerrm;
  end;

  v_order := public.record_cash_collection(v_order.id, 5000, 'partial payment, balance next visit');
  assert v_order.cash_collection_status = 'partial', format('expected partial status, got %s', v_order.cash_collection_status);
  assert v_order.cash_collected_amount = 5000, format('expected 5000 collected, got %s', v_order.cash_collected_amount);
  raise notice 'OK: partial cash collection recorded correctly.';

  v_order := public.record_cash_collection(v_order.id, 8000, 'balance collected');
  assert v_order.cash_collection_status = 'collected', format('expected collected status, got %s', v_order.cash_collection_status);
  raise notice 'OK: cash collection topped up to fully collected.';
end $$;

\echo '=== 11. COD Settlement: settle, discrepancy, dispute ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod uuid; v_order public.orders;
  v_settlement public.order_settlements;
begin
  select id into v_ws1 from public.workspaces where slug = 'ops-func-ws';
  select id into v_brand1 from public.brands where slug = 'ops-func-brand';
  select id into v_prod from public.products where sku = 'OPS-FUNC-1';

  v_order := public.create_order(
    v_ws1, v_brand1, 'manual', 'Settle Buyer', '08088880001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1))
  );
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  perform public.record_delivery_attempt(v_order.id, 'DELIVERED');
  perform public.record_cash_collection(v_order.id, 4000, 'full payment');

  -- Under-remitted -> discrepancy + notification, status PARTIALLY_SETTLED.
  v_settlement := public.create_order_settlement(v_order.id, 3500, 100);
  assert v_settlement.discrepancy = 400, format('expected discrepancy 400 (4000 - 100 fee - 3500), got %s', v_settlement.discrepancy);
  assert v_settlement.status = 'PARTIALLY_SETTLED', format('expected PARTIALLY_SETTLED, got %s', v_settlement.status);

  select * into v_order from public.orders where id = v_order.id;
  assert v_order.settlement_status = 'PARTIALLY_SETTLED', format('expected order snapshot to follow settlement status, got %s', v_order.settlement_status);
  raise notice 'OK: under-remittance produces a visible discrepancy and PARTIALLY_SETTLED status.';

  perform 1 from public.notifications where type = 'settlement_discrepancy' and metadata->>'settlement_id' = v_settlement.id::text;
  assert found, 'expected a settlement_discrepancy notification to have been created';
  raise notice 'OK: settlement discrepancy notification created.';

  v_settlement := public.mark_settlement_disputed(v_settlement.id, 'Driver disputes the shortfall');
  assert v_settlement.status = 'DISPUTED', format('expected DISPUTED, got %s', v_settlement.status);
  select * into v_order from public.orders where id = v_order.id;
  assert v_order.settlement_status = 'DISPUTED', format('expected order snapshot to follow DISPUTED, got %s', v_order.settlement_status);
  raise notice 'OK: settlement can be explicitly marked disputed, order snapshot follows.';
end $$;

\echo '=== 12. Bulk status update: mixed valid/invalid batch, no silent corruption ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod uuid;
  v_order1 public.orders; v_order2 public.orders;
  v_result record;
  v_success_count integer := 0;
  v_fail_count integer := 0;
begin
  select id into v_ws1 from public.workspaces where slug = 'ops-func-ws';
  select id into v_brand1 from public.brands where slug = 'ops-func-brand';
  select id into v_prod from public.products where sku = 'OPS-FUNC-1';

  v_order1 := public.create_order(
    v_ws1, v_brand1, 'manual', 'Bulk Buyer 1', '08099990001', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1))
  );
  v_order2 := public.create_order(
    v_ws1, v_brand1, 'manual', 'Bulk Buyer 2', '08099990002', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1))
  );
  -- order1: NEW -> PENDING is legal. order2: force it to DELIVERED
  -- (terminal-ish; NEW->PENDING is still legal for it too, so instead
  -- make order2's target transition illegal by jumping straight to
  -- DELIVERED from NEW, which is not a legal single-hop transition).
  for v_result in
    select * from public.bulk_update_order_status(array[v_order1.id, v_order2.id], 'PENDING')
  loop
    if v_result.success then v_success_count := v_success_count + 1; else v_fail_count := v_fail_count + 1; end if;
  end loop;
  assert v_success_count = 2, format('expected both legal NEW->PENDING transitions to succeed, got %s successes', v_success_count);
  raise notice 'OK: bulk update succeeded for both valid orders.';

  -- Now attempt an illegal transition (PENDING -> DELIVERED, not a legal single hop) mixed with a legal one.
  for v_result in
    select * from public.bulk_update_order_status(array[v_order1.id, v_order2.id], 'DELIVERED')
  loop
    if v_result.success then v_success_count := v_success_count + 1; else v_fail_count := v_fail_count + 1; end if;
  end loop;
  assert v_fail_count = 2, format('expected both illegal PENDING->DELIVERED transitions to be rejected, got %s failures', v_fail_count);

  select * into v_order1 from public.orders where id = v_order1.id;
  assert v_order1.status = 'PENDING', format('a rejected bulk transition must leave the order exactly as it was, got %s', v_order1.status);
  raise notice 'OK: illegal bulk transitions rejected per-row, no corruption — order remains PENDING.';
end $$;

\echo '=== 13. Rescue Board + Operations Summary run cleanly and only surface real criteria ==='
do $$
declare
  v_ws1 uuid; v_row record; v_summary record;
begin
  select id into v_ws1 from public.workspaces where slug = 'ops-func-ws';
  select * into v_summary from public.get_operations_summary(v_ws1);
  assert v_summary.awaiting_confirmation_count >= 0, 'get_operations_summary should execute cleanly';
  raise notice 'OK: get_operations_summary executed (awaiting_confirmation=%, dispatched=%).', v_summary.awaiting_confirmation_count, v_summary.dispatched_count;

  for v_row in select * from public.get_rescue_board(v_ws1) loop
    assert v_row.issue is not null, 'every rescue row must have a real, non-null issue label';
  end loop;
  raise notice 'OK: get_rescue_board executed cleanly.';
end $$;

\echo '=== ALL PHASE 6 OPERATIONS SMOKE TESTS PASSED ==='
