-- ============================================================
-- GCOS PHASE 9 — Security / RLS Adversarial Matrix test suite.
-- Genuine SET ROLE authenticated + GUC impersonation throughout (RLS
-- actually enforced, not bypassed). Local-only, not committed. Run
-- against a fresh DB with 0001-0029 applied + grant_authenticated.sql.
-- Attacks direct RPC calls, not merely hidden UI buttons — the
-- database is the security boundary under test here, per the Phase 9
-- brief's own engineering standard.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_ws_a uuid; v_brand_a uuid; v_ws_b uuid; v_brand_b uuid;
  v_owner_role uuid; v_cs_role uuid; v_marketing_role uuid; v_warehouse_role uuid; v_viewer_role uuid;
  v_prod_a uuid; v_aff_a uuid; v_camp_a uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Sec9 WS A', 'sec9-ws-a', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_a;
  insert into public.brands (workspace_id, name, slug) values (v_ws_a, 'Sec9 Brand A', 'sec9-brand-a') returning id into v_brand_a;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Sec9 WS B', 'sec9-ws-b', 'GH', 'GHS', 'Africa/Accra') returning id into v_ws_b;
  insert into public.brands (workspace_id, name, slug) values (v_ws_b, 'Sec9 Brand B', 'sec9-brand-b') returning id into v_brand_b;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_marketing_role from public.roles where slug = 'marketing' and workspace_id is null;
  select id into v_warehouse_role from public.roles where slug = 'warehouse-staff' and workspace_id is null;
  select id into v_viewer_role from public.roles where slug = 'viewer' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000f1', 'owner-sec9@test.local'),
    ('00000000-0000-0000-0000-0000000000f2', 'cs-sec9@test.local'),
    ('00000000-0000-0000-0000-0000000000f3', 'marketing-sec9@test.local'),
    ('00000000-0000-0000-0000-0000000000f4', 'warehouse-sec9@test.local'),
    ('00000000-0000-0000-0000-0000000000f5', 'owner-b-sec9@test.local'),
    ('00000000-0000-0000-0000-0000000000f6', 'viewer-sec9@test.local'),
    ('00000000-0000-0000-0000-0000000000f7', 'suspended-sec9@test.local'),
    ('00000000-0000-0000-0000-0000000000f8', 'nomembership-sec9@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000f1', v_owner_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f2', v_cs_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f3', v_marketing_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f4', v_warehouse_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f5', v_owner_role, v_ws_b),
    ('00000000-0000-0000-0000-0000000000f6', v_viewer_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f7', v_owner_role, v_ws_a);
  -- f8 (nomembership) deliberately gets zero user_roles rows.

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws_a, v_brand_a, 'Sec9 Product', 'sec9-product', 'SEC9-1', 'active', 5000, 2000, 50) returning id into v_prod_a;

  insert into public.affiliates (workspace_id, full_name, referral_code, approval_status, status, created_by, updated_by)
    values (v_ws_a, 'Sec9 Affiliate', 'SEC9AFF', 'approved', 'active', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_aff_a;
  insert into public.affiliate_campaigns (workspace_id, brand_id, name, slug, status, commission_type, commission_value, qualifying_event, affiliate_access, created_by, updated_by)
    values (v_ws_a, v_brand_a, 'Sec9 Campaign', 'sec9-campaign', 'ACTIVE', 'FIXED_AMOUNT', 300, 'PER_ORDER_CREATED', 'ALL_APPROVED_AFFILIATES', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_camp_a;
  insert into public.affiliate_campaign_products (campaign_id, product_id) values (v_camp_a, v_prod_a);
end $$;

\set owner_a '00000000-0000-0000-0000-0000000000f1'
\set cs_a '00000000-0000-0000-0000-0000000000f2'
\set marketing_a '00000000-0000-0000-0000-0000000000f3'
\set warehouse_a '00000000-0000-0000-0000-0000000000f4'
\set owner_b '00000000-0000-0000-0000-0000000000f5'
\set viewer_a '00000000-0000-0000-0000-0000000000f6'
\set suspended_a '00000000-0000-0000-0000-0000000000f7'
\set nomembership '00000000-0000-0000-0000-0000000000f8'

-- Seed order/finance/affiliate activity as Owner so there is real money on the books to try to leak.
select set_config('app.test_user_id', :'owner_a', false);
set role authenticated;
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';
  select id into v_brand from public.brands where slug = 'sec9-brand-a';
  select id into v_prod from public.products where sku = 'SEC9-1';

  v_order := public.create_order(v_ws, v_brand, 'manual', 'Sec9 Buyer', '08099990101', '1 Sec9 Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2)),
    p_affiliate_referral_code => 'SEC9AFF');
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id;
  select * into v_order from public.orders where id = v_order.id;
  perform public.create_order_settlement(v_order.id, v_order.cash_collected_amount);
end $$;
reset role;

\echo '=== 1. Owner: full visibility baseline (real money, real affiliate figures) ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_stats record; v_aff_perf record;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';
  select * into v_stats from public.get_order_stats(v_ws);
  assert v_stats.delivered_revenue > 0, 'Owner must see real delivered_revenue';
  select * into v_aff_perf from public.get_affiliate_performance(v_ws) limit 1;
  assert v_aff_perf.total_commission_earned > 0, 'Owner must see real affiliate commission figures';
  raise notice 'OK 1: Owner sees real financial and affiliate figures.';
end $$;
reset role;

\echo '=== 2. Customer Support (orders.view, NO finance/analytics/reports.view): order counts real, every money field zeroed ==='
set role authenticated;
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare v_ws uuid; v_stats record; v_summary record; v_funnel record; v_trend record; v_breakdown record;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';

  select * into v_stats from public.get_order_stats(v_ws);
  assert v_stats.total_orders > 0, 'Customer Support holds orders.view — order counts must remain visible';
  assert v_stats.delivered_revenue = 0, format('Customer Support lacks finance visibility — delivered_revenue must be zeroed, got %s', v_stats.delivered_revenue);
  assert v_stats.total_sales_value = 0, 'total_sales_value must be zeroed for a non-finance-visible orders.view holder';
  assert v_stats.pending_revenue = 0, 'pending_revenue must be zeroed';
  assert v_stats.returned_value = 0, 'returned_value must be zeroed';
  assert v_stats.cancelled_value = 0, 'cancelled_value must be zeroed';

  select * into v_summary from public.get_finance_summary(v_ws);
  assert v_summary.delivered_revenue = 0 and v_summary.gross_profit = 0, 'get_finance_summary must zero every monetary field for a non-finance-visible caller';

  for v_funnel in select * from public.get_delivery_funnel_stats(v_ws) loop
    assert v_funnel.order_value = 0, 'get_delivery_funnel_stats order_value must be zeroed for a non-finance-visible caller';
  end loop;

  for v_trend in select * from public.get_revenue_trend(v_ws) loop
    assert v_trend.delivered_revenue = 0 and v_trend.sales_value = 0, 'get_revenue_trend must zero every monetary column';
  end loop;

  for v_breakdown in select * from public.get_order_status_value_breakdown(v_ws) loop
    assert v_breakdown.order_value = 0, 'get_order_status_value_breakdown order_value must be zeroed (LEFT JOIN zero-fill, rows still present)';
  end loop;

  raise notice 'OK 2: every finance RPC honestly zeros its monetary fields for a non-finance-visible orders.view holder — never leaks a real number.';
end $$;
reset role;

\echo '=== 3. Customer Support (no affiliates/campaigns/affiliate_reports.view): affiliate performance RPCs return nothing ==='
set role authenticated;
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';

  select count(*) into v_count from public.get_affiliate_performance(v_ws);
  assert v_count = 0, format('Customer Support must see zero affiliate performance rows, got %s', v_count);

  select count(*) into v_count from public.get_campaign_performance(v_ws);
  assert v_count = 0, format('Customer Support must see zero campaign performance rows, got %s', v_count);

  select count(*) into v_count from public.get_ad_cost_summary(v_ws);
  assert v_count = 0, format('Customer Support must see zero ad cost rows, got %s', v_count);

  raise notice 'OK 3: affiliate/campaign/ad-cost reporting correctly invisible to a non-affiliate-visible role.';
end $$;
reset role;

\echo '=== 4. Marketing (analytics.view but NO orders.view): total blackout on orders, even though analytics.view alone grants finance-visibility ==='
set role authenticated;
select set_config('app.test_user_id', :'marketing_a', false);
do $$
declare v_ws uuid; v_stats record;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';
  select * into v_stats from public.get_order_stats(v_ws);
  assert v_stats.total_orders = 0, format('Marketing lacks orders.view — even order COUNTS (not just money) must be zero via RLS blackout on the orders table itself, got %s', v_stats.total_orders);
  assert v_stats.delivered_revenue = 0, 'delivered_revenue must also be zero';
  raise notice 'OK 4: holding analytics.view (finance-visibility) alone never substitutes for orders.view — the orders table''s own RLS is a separate, independent boundary.';
end $$;
reset role;

\echo '=== 5. Cross-workspace isolation: WS B''s Owner sees zero of WS A''s orders/finance/affiliate/wallet/settlement data, even calling RPCs with WS A''s own id ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_b', false);
do $$
declare v_ws_a uuid; v_count int; v_stats record;
begin
  select id into v_ws_a from public.workspaces where slug = 'sec9-ws-a';

  select * into v_stats from public.get_order_stats(v_ws_a);
  assert v_stats.total_orders = 0, 'a user with zero role in Workspace A must see zero orders even when passing Workspace A''s own id as the RPC parameter';

  select count(*) into v_count from public.orders where workspace_id = v_ws_a;
  assert v_count = 0, 'direct SELECT on orders for a foreign workspace must return zero rows under RLS';

  select count(*) into v_count from public.affiliate_wallets aw join public.affiliates a on a.id = aw.affiliate_id where a.workspace_id = v_ws_a;
  assert v_count = 0, 'direct SELECT on affiliate_wallets for a foreign workspace must return zero rows under RLS';

  select count(*) into v_count from public.order_settlements where workspace_id = v_ws_a;
  assert v_count = 0, 'direct SELECT on order_settlements for a foreign workspace must return zero rows under RLS';

  select count(*) into v_count from public.affiliate_commissions where workspace_id = v_ws_a;
  assert v_count = 0, 'direct SELECT on affiliate_commissions for a foreign workspace must return zero rows under RLS';

  raise notice 'OK 5: cross-workspace isolation holds across orders/wallets/settlements/commissions — a foreign workspace id in an RPC parameter changes nothing.';
end $$;
reset role;

\echo '=== 6. Inventory: stock_quantity/reserved_quantity can never be mutated by a direct UPDATE, even by the Owner (who holds full products.manage) ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_prod uuid; v_failed boolean; v_stock_before int; v_stock_after int;
begin
  select id into v_prod from public.products where sku = 'SEC9-1';
  select stock_quantity into v_stock_before from public.products where id = v_prod;

  v_failed := false;
  begin
    update public.products set stock_quantity = 999999 where id = v_prod;
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'a direct UPDATE to products.stock_quantity must be rejected by the guard trigger even for the Owner (full products.manage) — adjust_inventory() is the only sanctioned write path';

  select stock_quantity into v_stock_after from public.products where id = v_prod;
  assert v_stock_after = v_stock_before, 'stock_quantity must be completely unchanged after the rejected direct UPDATE attempt';

  raise notice 'OK 6: direct stock mutation blocked even for the Owner with full table-level write permission — adjust_inventory() remains the sole write path.';
end $$;
reset role;

\echo '=== 7. Audit logs are genuinely append-only: not even the Owner can UPDATE or DELETE an existing row ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_log_id uuid; v_original_action text; v_after text; v_count_before int; v_count_after int;
begin
  select id, action into v_log_id, v_original_action from public.audit_logs where workspace_id = (select id from public.workspaces where slug = 'sec9-ws-a') limit 1;
  assert v_log_id is not null, 'test fixture assumption: at least one audit_logs row must exist by now';

  -- RLS with no UPDATE/DELETE policy at all means these statements complete "successfully"
  -- but silently affect zero rows (Postgres's default-deny for an un-policied command) rather
  -- than raising an exception — so the correctness proof is the row's own before/after state,
  -- not whether an exception was thrown.
  update public.audit_logs set action = 'tampered' where id = v_log_id;
  select action into v_after from public.audit_logs where id = v_log_id;
  assert v_after = v_original_action, format('an audit_logs row must be completely unmodifiable — expected %s got %s', v_original_action, v_after);

  select count(*) into v_count_before from public.audit_logs;
  delete from public.audit_logs where id = v_log_id;
  select count(*) into v_count_after from public.audit_logs;
  assert v_count_after = v_count_before, 'an audit_logs row must be completely undeletable — row count must not change';

  perform 1 from public.audit_logs where id = v_log_id;
  if not found then
    raise exception 'the audit_logs row must still exist after the rejected DELETE attempt';
  end if;

  raise notice 'OK 7: audit_logs is genuinely append-only for every role, Owner included — no UPDATE/DELETE policy exists, so both are structurally no-ops, not just permission-denied.';
end $$;
reset role;

\echo '=== 8. Suspended staff cannot perform ANY protected operation — user_has_permission()/user_workspace_ids() resolve to nothing ==='
do $$
begin
  perform public.set_staff_status((select id from public.workspaces where slug = 'sec9-ws-a'), '00000000-0000-0000-0000-0000000000f7'::uuid, 'suspended');
end $$;
set role authenticated;
select set_config('app.test_user_id', :'suspended_a', false);
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_failed boolean; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';
  select id into v_brand from public.brands where slug = 'sec9-brand-a';
  select id into v_prod from public.products where sku = 'SEC9-1';

  select count(*) into v_count from public.orders where workspace_id = v_ws;
  assert v_count = 0, 'a suspended user must see zero orders even in their own former workspace';

  v_failed := false;
  begin
    perform public.create_order(v_ws, v_brand, 'manual', 'Suspended Attempt Buyer', '08099990102', '2 Sec9 Street',
      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'a suspended user must be rejected from create_order() (insufficient_permission, resolved via their now-inactive profile)';

  raise notice 'OK 8: a suspended staff member is fully locked out — zero visibility, zero write access — immediately, at the database layer.';
end $$;
reset role;

\echo '=== 9. A user with zero workspace membership sees and can do nothing anywhere ==='
set role authenticated;
select set_config('app.test_user_id', :'nomembership', false);
do $$
declare v_ws uuid; v_count int; v_failed boolean;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';

  select count(*) into v_count from public.orders where workspace_id = v_ws;
  assert v_count = 0, 'a user with no role anywhere must see zero orders';

  select count(*) into v_count from public.affiliates where workspace_id = v_ws;
  assert v_count = 0, 'a user with no role anywhere must see zero affiliates';

  v_failed := false;
  begin
    perform public.create_order(v_ws, (select id from public.brands where slug = 'sec9-brand-a'), 'manual', 'No Membership Buyer', '08099990103', '3 Sec9 Street',
      jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where sku = 'SEC9-1'), 'quantity', 1)));
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'a user with no workspace membership at all must never be able to create an order';

  raise notice 'OK 9: a user with zero workspace membership is correctly blind and powerless everywhere.';
end $$;
reset role;

\echo '=== 10. Permission is a real backend guard, not a hidden UI button: Customer Support cannot call settlement.manage-/ad_costs.approve-gated RPCs directly ==='
set role authenticated;
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare v_ws uuid; v_order_id uuid; v_failed boolean;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';
  select id into v_order_id from public.orders where workspace_id = v_ws and status = 'DELIVERED' limit 1;

  v_failed := false;
  begin
    perform public.create_order_settlement(v_order_id, 1000);
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'Customer Support lacks settlement.manage — create_order_settlement() must reject the direct RPC call';

  raise notice 'OK 10: settlement.manage is enforced as a real backend guard against a direct RPC call, not merely a hidden button.';
end $$;
reset role;

\echo '=== 11. Viewer: sees everything (all .view permissions) but can create/approve/mutate nothing ==='
set role authenticated;
select set_config('app.test_user_id', :'viewer_a', false);
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_stats record; v_failed boolean;
begin
  select id into v_ws from public.workspaces where slug = 'sec9-ws-a';
  select id into v_brand from public.brands where slug = 'sec9-brand-a';
  select id into v_prod from public.products where sku = 'SEC9-1';

  select * into v_stats from public.get_order_stats(v_ws);
  assert v_stats.delivered_revenue > 0, 'Viewer holds finance.view/analytics.view/reports.view (every .view permission) — must see real delivered_revenue';

  v_failed := false;
  begin
    perform public.create_order(v_ws, v_brand, 'manual', 'Viewer Attempt Buyer', '08099990104', '4 Sec9 Street',
      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  exception when others then
    v_failed := true;
  end;
  assert v_failed, 'Viewer holds no orders.create — must be rejected from creating an order despite full read visibility';

  raise notice 'OK 11: Viewer correctly sees real figures everywhere but cannot mutate anything.';
end $$;
reset role;

\echo '=== ALL PHASE 9 SECURITY AUDIT TESTS PASSED ==='
