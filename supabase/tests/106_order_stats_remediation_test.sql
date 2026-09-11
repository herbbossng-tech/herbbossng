-- ============================================================
-- SECURITY REMEDIATION test — get_order_stats() /
-- get_order_daily_stats() finance-visibility boundary.
-- Run against a fresh DB with 0001-0026 applied +
-- grant_authenticated.sql. Genuine SET ROLE authenticated + GUC
-- impersonation throughout (RLS actually enforced, not superuser-
-- bypassed). Local-only, not committed.
--
-- Covers the 10-point matrix required by the remediation brief:
--  1. Owner            6. Warehouse Staff
--  2. Admin             7. Workspace A/B isolation
--  3. Manager           8. No workspace membership at all
--  4. Finance           9. Zero-data workspace
--  5. Customer Support  10. Existing Orders functionality intact
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_ws_a uuid; v_brand_a uuid; v_ws_b uuid; v_brand_b uuid;
  v_owner_role uuid; v_admin_role uuid; v_manager_role uuid; v_fin_role uuid; v_cs_role uuid; v_wh_role uuid;
  v_prod uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Remediation WS A', 'remediation-ws-a', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_a;
  insert into public.brands (workspace_id, name, slug) values (v_ws_a, 'Remediation Brand A', 'remediation-brand-a') returning id into v_brand_a;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Remediation WS B', 'remediation-ws-b', 'GH', 'GHS', 'Africa/Accra') returning id into v_ws_b;
  insert into public.brands (workspace_id, name, slug) values (v_ws_b, 'Remediation Brand B', 'remediation-brand-b') returning id into v_brand_b;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_admin_role from public.roles where slug = 'admin' and workspace_id is null;
  select id into v_manager_role from public.roles where slug = 'manager' and workspace_id is null;
  select id into v_fin_role from public.roles where slug = 'finance' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_wh_role from public.roles where slug = 'warehouse-staff' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000d1', 'owner-d@test.local'),
    ('00000000-0000-0000-0000-0000000000d2', 'admin-d@test.local'),
    ('00000000-0000-0000-0000-0000000000d3', 'manager-d@test.local'),
    ('00000000-0000-0000-0000-0000000000d4', 'finance-d@test.local'),
    ('00000000-0000-0000-0000-0000000000d5', 'cs-d@test.local'),
    ('00000000-0000-0000-0000-0000000000d6', 'warehouse-d@test.local'),
    ('00000000-0000-0000-0000-0000000000d7', 'owner-b-workspace-d@test.local'),
    ('00000000-0000-0000-0000-0000000000d8', 'no-membership-d@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000d1', v_owner_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000d2', v_admin_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000d3', v_manager_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000d4', v_fin_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000d5', v_cs_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000d6', v_wh_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000d7', v_owner_role, v_ws_b);
  -- d8 (no-membership) deliberately gets NO user_roles row anywhere.

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws_a, v_brand_a, 'Remediation Product', 'remediation-product', 'REM-1', 'active', 7500, 3000, 50) returning id into v_prod;
end $$;

\set owner_a '00000000-0000-0000-0000-0000000000d1'
\set admin_a '00000000-0000-0000-0000-0000000000d2'
\set manager_a '00000000-0000-0000-0000-0000000000d3'
\set finance_a '00000000-0000-0000-0000-0000000000d4'
\set cs_a '00000000-0000-0000-0000-0000000000d5'
\set warehouse_a '00000000-0000-0000-0000-0000000000d6'
\set owner_b '00000000-0000-0000-0000-0000000000d7'
\set no_membership '00000000-0000-0000-0000-0000000000d8'

-- Deliberately never redefines auth.uid() to a hardcoded value —
-- would clobber grant_authenticated.sql's GUC-reading version and
-- silently break every impersonation check below it (the exact
-- bug caught and documented in 105_operations_smoke_test.sql).
select set_config('app.test_user_id', :'owner_a', false);

-- Owner creates and delivers one order today in WS A: 2 x 7500 = 15000.
do $$
declare
  v_ws_a uuid; v_brand_a uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select id into v_brand_a from public.brands where slug = 'remediation-brand-a';
  select id into v_prod from public.products where sku = 'REM-1';

  v_order := public.create_order(
    v_ws_a, v_brand_a, 'manual', 'Remediation Buyer', '08099990001', '1 Remediation Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2))
  );
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id;
  -- guard_order_status_transition()'s Phase-1 auto-collect default
  -- fires here (cash_collected_amount was NULL), so cash_collection_
  -- status is already 'collected' — matches how the classic direct-
  -- status-change UI behaves, and is exactly what today_delivered_
  -- revenue/delivered_revenue are supposed to count.
end $$;

\echo '=== 1. Owner: real revenue in get_order_stats() AND get_order_daily_stats() ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 15000, format('Owner should see real delivered_revenue, got %s', v_stats.delivered_revenue);
  assert v_stats.total_sales_value = 15000, format('Owner should see real total_sales_value, got %s', v_stats.total_sales_value);

  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.delivered_revenue = 15000, format('Owner should see real get_order_daily_stats delivered_revenue, got %s', v_today.delivered_revenue);
  assert v_today.order_count = 1, format('Owner should see order_count=1, got %s', v_today.order_count);
  raise notice 'OK: Owner sees real revenue in both RPCs.';
end $$;

\echo '=== 2. Admin: real revenue in both RPCs ==='
select set_config('app.test_user_id', :'admin_a', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 15000, format('Admin should see real delivered_revenue, got %s', v_stats.delivered_revenue);
  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.delivered_revenue = 15000, format('Admin should see real daily delivered_revenue, got %s', v_today.delivered_revenue);
  raise notice 'OK: Admin sees real revenue in both RPCs.';
end $$;

\echo '=== 3. Manager: real revenue in both RPCs ==='
select set_config('app.test_user_id', :'manager_a', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 15000, format('Manager should see real delivered_revenue, got %s', v_stats.delivered_revenue);
  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.delivered_revenue = 15000, format('Manager should see real daily delivered_revenue, got %s', v_today.delivered_revenue);
  raise notice 'OK: Manager sees real revenue in both RPCs.';
end $$;

\echo '=== 4. Finance: real revenue in both RPCs (role name != finance.view slug, but reports.view/analytics.view satisfy user_has_finance_visibility()) ==='
select set_config('app.test_user_id', :'finance_a', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 15000, format('Finance should see real delivered_revenue, got %s', v_stats.delivered_revenue);
  assert v_stats.total_sales_value = 15000, format('Finance should see real total_sales_value, got %s', v_stats.total_sales_value);
  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.delivered_revenue = 15000, format('Finance should see real daily delivered_revenue, got %s', v_today.delivered_revenue);
  raise notice 'OK: Finance sees real revenue in both RPCs.';
end $$;

\echo '=== 5. Customer Support: counts real, revenue zeroed in BOTH RPCs ==='
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 0, format('Customer Support must NOT see delivered_revenue, got %s', v_stats.delivered_revenue);
  assert v_stats.total_sales_value = 0, format('Customer Support must NOT see total_sales_value, got %s', v_stats.total_sales_value);
  assert v_stats.pending_revenue = 0, format('Customer Support must NOT see pending_revenue, got %s', v_stats.pending_revenue);
  assert v_stats.delivered_count = 1, format('Customer Support SHOULD still see operational delivered_count=1, got %s', v_stats.delivered_count);
  assert v_stats.total_orders = 1, format('Customer Support SHOULD still see total_orders=1, got %s', v_stats.total_orders);

  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.delivered_revenue = 0, format('Customer Support must NOT see daily delivered_revenue, got %s', v_today.delivered_revenue);
  assert v_today.order_count = 1, format('Customer Support SHOULD still see operational order_count=1, got %s', v_today.order_count);
  raise notice 'OK: Customer Support sees counts but zeroed revenue in both RPCs.';
end $$;

\echo '=== 6. Warehouse Staff: counts real, revenue zeroed in BOTH RPCs ==='
select set_config('app.test_user_id', :'warehouse_a', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.delivered_revenue = 0, format('Warehouse Staff must NOT see delivered_revenue, got %s', v_stats.delivered_revenue);
  assert v_stats.cancelled_value = 0, format('Warehouse Staff must NOT see cancelled_value, got %s', v_stats.cancelled_value);
  assert v_stats.delivered_count = 1, format('Warehouse Staff SHOULD still see delivered_count=1, got %s', v_stats.delivered_count);

  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.delivered_revenue = 0, format('Warehouse Staff must NOT see daily delivered_revenue, got %s', v_today.delivered_revenue);
  assert v_today.order_count = 1, format('Warehouse Staff SHOULD still see operational order_count=1, got %s', v_today.order_count);
  raise notice 'OK: Warehouse Staff sees counts but zeroed revenue in both RPCs.';
end $$;

\echo '=== 7. Workspace A/B isolation: WS B owner querying WS A gets fully zeroed stats from BOTH RPCs ==='
select set_config('app.test_user_id', :'owner_b', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.total_orders = 0, format('WS B owner must see total_orders=0 for WS A, got %s', v_stats.total_orders);
  assert v_stats.delivered_revenue = 0, format('WS B owner must see delivered_revenue=0 for WS A, got %s', v_stats.delivered_revenue);

  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.order_count = 0, format('WS B owner must see order_count=0 for WS A daily stats, got %s', v_today.order_count);
  assert v_today.delivered_revenue = 0, format('WS B owner must see daily delivered_revenue=0 for WS A, got %s', v_today.delivered_revenue);
  raise notice 'OK: cross-workspace caller sees fully zeroed stats from both RPCs.';
end $$;

\echo '=== 8. No workspace membership at all: rejected to a clean zeroed row, not an error, from BOTH RPCs ==='
select set_config('app.test_user_id', :'no_membership', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_today record;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.total_orders = 0, format('User with zero workspace roles anywhere must see total_orders=0, got %s', v_stats.total_orders);
  assert v_stats.delivered_revenue = 0, format('User with zero workspace roles anywhere must see delivered_revenue=0, got %s', v_stats.delivered_revenue);

  select * into v_today from public.get_order_daily_stats(v_ws_a, null, 1);
  assert v_today.order_count = 0, format('User with zero workspace roles anywhere must see order_count=0, got %s', v_today.order_count);
  raise notice 'OK: user with no workspace membership anywhere gets a clean zeroed row from both RPCs, not an error.';
end $$;

\echo '=== 9. Zero-data workspace: a brand-new empty workspace returns clean zeroed rows, not an error, from BOTH RPCs ==='
reset role;
do $$
declare
  v_ws_empty uuid; v_owner_role uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Remediation WS Empty', 'remediation-ws-empty', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_empty;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id) values ('00000000-0000-0000-0000-0000000000d1', v_owner_role, v_ws_empty);
end $$;

set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare
  v_ws_empty uuid; v_stats record; v_today record;
begin
  select id into v_ws_empty from public.workspaces where slug = 'remediation-ws-empty';
  select * into v_stats from public.get_order_stats(v_ws_empty);
  assert v_stats.total_orders = 0, format('Empty workspace should report total_orders=0, got %s', v_stats.total_orders);
  assert v_stats.delivery_success_rate = 0, format('Empty workspace should report delivery_success_rate=0, got %s', v_stats.delivery_success_rate);

  select * into v_today from public.get_order_daily_stats(v_ws_empty, null, 3);
  assert (select count(*) from public.get_order_daily_stats(v_ws_empty, null, 3)) = 3, 'Empty workspace daily stats should still return 3 zeroed day rows, not error or drop rows';
  raise notice 'OK: empty workspace returns clean zeroed rows from both RPCs, no error.';
end $$;

\echo '=== 10. Existing Orders functionality remains intact: operational fields correct, order list/detail still work for an authorized role ==='
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare
  v_ws_a uuid; v_stats record; v_order_count int;
begin
  select id into v_ws_a from public.workspaces where slug = 'remediation-ws-a';
  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.total_orders = 1, format('Regression: total_orders should be 1, got %s', v_stats.total_orders);
  assert v_stats.delivered_count = 1, format('Regression: delivered_count should be 1, got %s', v_stats.delivered_count);
  assert v_stats.in_transit_count = 0, format('Regression: in_transit_count should be 0 (order moved past it), got %s', v_stats.in_transit_count);
  assert v_stats.delivery_success_rate = 100, format('Regression: delivery_success_rate should be 100, got %s', v_stats.delivery_success_rate);

  select count(*) into v_order_count from public.orders where workspace_id = v_ws_a;
  assert v_order_count = 1, format('Regression: direct orders SELECT (RLS) should still return the 1 order for an authorized role, got %s', v_order_count);
  raise notice 'OK: existing Orders functionality (operational stats + order list access) is intact after the fix.';
end $$;
reset role;

\echo '=== ALL SECURITY REMEDIATION TESTS PASSED (10/10) ==='
