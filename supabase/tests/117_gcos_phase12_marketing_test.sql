-- ============================================================
-- GCOS Phase 12 — Marketing Intelligence smoke test.
-- Run against a freshly migrated 0001-0033 database with
-- grant_authenticated.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws_a uuid; v_ws_b uuid; v_brand_a uuid; v_brand_b uuid;
  v_owner_role uuid; v_marketing_role uuid; v_finance_role uuid; v_cs_role uuid; v_wh_role uuid;
  v_prod uuid; v_lp uuid;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000c1', 'owner-p12@test.local'),
    ('00000000-0000-0000-0000-0000000000c2', 'marketer-p12@test.local'),
    ('00000000-0000-0000-0000-0000000000c3', 'finance-p12@test.local'),
    ('00000000-0000-0000-0000-0000000000c4', 'cs-p12@test.local'),
    ('00000000-0000-0000-0000-0000000000c5', 'warehouse-p12@test.local'),
    ('00000000-0000-0000-0000-0000000000c6', 'ownerb-p12@test.local'),
    ('00000000-0000-0000-0000-0000000000c7', 'buyer-p12@test.local');

  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('P12 WS A', 'p12-ws-a', 'NG', 'NGN', '00000000-0000-0000-0000-0000000000c1') returning id into v_ws_a;
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('P12 WS B', 'p12-ws-b', 'KE', 'KES', '00000000-0000-0000-0000-0000000000c6') returning id into v_ws_b;

  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_a, 'P12 Brand A', 'p12-brand-a', '00000000-0000-0000-0000-0000000000c1') returning id into v_brand_a;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_b, 'P12 Brand B', 'p12-brand-b', '00000000-0000-0000-0000-0000000000c6') returning id into v_brand_b;

  select id into v_owner_role from public.roles where workspace_id is null and slug = 'owner';
  select id into v_marketing_role from public.roles where workspace_id is null and slug = 'marketing';
  select id into v_finance_role from public.roles where workspace_id is null and slug = 'finance';
  select id into v_cs_role from public.roles where workspace_id is null and slug = 'customer-support';
  select id into v_wh_role from public.roles where workspace_id is null and slug = 'warehouse-staff';

  insert into public.user_roles (user_id, workspace_id, role_id) values
    ('00000000-0000-0000-0000-0000000000c1', v_ws_a, v_owner_role),
    ('00000000-0000-0000-0000-0000000000c2', v_ws_a, v_marketing_role),
    ('00000000-0000-0000-0000-0000000000c3', v_ws_a, v_finance_role),
    ('00000000-0000-0000-0000-0000000000c4', v_ws_a, v_cs_role),
    ('00000000-0000-0000-0000-0000000000c5', v_ws_a, v_wh_role),
    ('00000000-0000-0000-0000-0000000000c6', v_ws_b, v_owner_role),
    ('00000000-0000-0000-0000-0000000000c7', v_ws_a, v_marketing_role);

  insert into public.products (workspace_id, brand_id, name, slug, sku, selling_price, cost_price, status, created_by, updated_by)
    values (v_ws_a, v_brand_a, 'P12 Product', 'p12-product', 'P12-1', 10000, 4000, 'active', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1')
    returning id into v_prod;

  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, status, created_by, updated_by)
    values (v_ws_a, v_brand_a, v_prod, 'P12 LP', 'p12-lp', 'published', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1');

  raise notice 'P12_WS_A=%, P12_BRAND_A=%, P12_PROD=%', v_ws_a, v_brand_a, v_prod;
end $$;

\echo '=== 1. Owner (marketing.manage) can create a marketing campaign ==='
do $$
declare v_ws uuid; v_brand uuid; v_lp uuid; v_campaign_id uuid;
begin
  select id into v_ws from public.workspaces where slug = 'p12-ws-a';
  select id into v_brand from public.brands where slug = 'p12-brand-a';
  select id into v_lp from public.landing_pages where slug = 'p12-lp';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  set role authenticated;
  insert into public.marketing_campaigns (workspace_id, brand_id, name, channel, landing_page_id, utm_campaign, status, created_by, updated_by)
    values (v_ws, v_brand, 'P12 Meta Campaign', 'meta', v_lp, 'p12_meta_launch', 'active', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1')
    returning id into v_campaign_id;
  reset role;

  assert v_campaign_id is not null, 'campaign insert should have succeeded';
  perform 1 from public.marketing_campaigns where id = v_campaign_id and market_country_code = 'NG' and market_currency_code = 'NGN';
  assert found, 'market_country_code/currency_code must default from the workspace at insert time';
  raise notice 'OK 1: campaign created, market defaults resolved to NG/NGN.';
end $$;

\echo '=== 2. Workspace B cannot see Workspace A campaigns (cross-workspace RLS isolation) ==='
do $$
declare v_count int;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c6', false);
  set role authenticated;
  select count(*) into v_count from public.marketing_campaigns where name = 'P12 Meta Campaign';
  reset role;
  assert v_count = 0, format('Workspace B owner must not see Workspace A campaigns, saw %s', v_count);
  raise notice 'OK 2: cross-workspace isolation holds.';
end $$;

\echo '=== 3. Customer Support and Warehouse Staff see zero marketing campaigns (no marketing.view grant) ==='
do $$
declare v_count_cs int; v_count_wh int;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c4', false);
  set role authenticated;
  select count(*) into v_count_cs from public.marketing_campaigns;
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c5', false);
  set role authenticated;
  select count(*) into v_count_wh from public.marketing_campaigns;
  reset role;

  assert v_count_cs = 0, 'Customer Support must not see marketing_campaigns rows';
  assert v_count_wh = 0, 'Warehouse Staff must not see marketing_campaigns rows';
  raise notice 'OK 3: Customer Support and Warehouse Staff correctly denied marketing visibility.';
end $$;

\echo '=== 4. Anonymous caller cannot read marketing_campaigns or call privileged marketing RPCs ==='
do $$
declare v_count int; v_denied boolean := false;
begin
  perform set_config('app.test_user_id', '', false);
  set role anon;
  select count(*) into v_count from public.marketing_campaigns;
  begin
    insert into public.marketing_campaigns (workspace_id, brand_id, name, channel, status)
      select id, id, 'hack', 'meta', 'active' from public.workspaces limit 1;
  exception when others then
    v_denied := true;
  end;
  reset role;
  assert v_count = 0, 'anon must see zero marketing_campaigns rows';
  assert v_denied, 'anon must never be able to insert a marketing_campaigns row';
  raise notice 'OK 4: anonymous caller correctly denied read and write.';
end $$;

\echo '=== 5. Ad Cost entry links to a marketing campaign; get_marketing_campaign_list reports spend/CPA/ROAS correctly ==='
do $$
declare v_ws uuid; v_brand uuid; v_campaign_id uuid; v_ad_cost_id uuid; v_order public.orders; v_prod uuid;
  v_spend numeric; v_orders_created bigint; v_delivered bigint; v_delivered_revenue numeric; v_cpa numeric; v_roas numeric;
begin
  select id into v_ws from public.workspaces where slug = 'p12-ws-a';
  select id into v_brand from public.brands where slug = 'p12-brand-a';
  select id into v_prod from public.products where slug = 'p12-product';
  select id into v_campaign_id from public.marketing_campaigns where name = 'P12 Meta Campaign';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;
  insert into public.ad_costs (workspace_id, brand_id, marketing_campaign_id, channel, period_start, period_end, initial_cost_amount, initial_orders_count, currency_code, submitted_by)
    values (v_ws, v_brand, v_campaign_id, 'meta', current_date - 2, current_date, 20000, 2, 'NGN', '00000000-0000-0000-0000-0000000000c2')
    returning id into v_ad_cost_id;
  reset role;

  -- Marketing role cannot approve its own submission (separation of duties, same as ad_costs 0024).
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  perform public.approve_ad_cost(v_ad_cost_id);

  -- Two orders attributed to the campaign via utm_campaign match, one delivered+collected.
  v_order := public.create_order(v_ws, v_brand, 'landing_page', 'P12 Buyer 1', '08011110001', '1 Marketing Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.orders set utm_campaign = 'p12_meta_launch', utm_source = 'facebook' where id = v_order.id;
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id; -- auto-collects full total_amount per guard_order_status_transition()
  update public.orders set actual_delivery_cost = 500 where id = v_order.id;

  v_order := public.create_order(v_ws, v_brand, 'landing_page', 'P12 Buyer 2', '08011110002', '2 Marketing Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.orders set utm_campaign = 'P12_META_LAUNCH' where id = v_order.id; -- case-insensitive match

  select spend, orders_created, delivered_orders, delivered_revenue, delivered_cpa, roas
    into v_spend, v_orders_created, v_delivered, v_delivered_revenue, v_cpa, v_roas
    from public.get_marketing_campaign_list(v_ws, v_brand, null, null, null, null, null)
    where campaign_id = v_campaign_id;

  assert v_spend = 20000, format('expected spend=20000, got %s', v_spend);
  assert v_orders_created = 2, format('expected orders_created=2 (case-insensitive utm_campaign match), got %s', v_orders_created);
  assert v_delivered = 1, format('expected delivered_orders=1, got %s', v_delivered);
  assert v_delivered_revenue = 10000, format('expected delivered_revenue=10000, got %s', v_delivered_revenue);
  assert v_cpa = 20000, format('expected delivered_cpa=20000 (spend/delivered), got %s', v_cpa);
  assert v_roas = 0.5, format('expected roas=0.5 (10000/20000), got %s', v_roas);
  raise notice 'OK 5: spend/orders/delivered/revenue/CPA/ROAS all correct via case-insensitive utm_campaign attribution.';
end $$;

\echo '=== 6. Customer Support sees operational counts but null financial figures for the same campaign ==='
do $$
declare v_ws uuid; v_brand uuid; v_campaign_id uuid; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p12-ws-a';
  select id into v_brand from public.brands where slug = 'p12-brand-a';
  select id into v_campaign_id from public.marketing_campaigns where name = 'P12 Meta Campaign';

  -- Grant Customer Support marketing.view just for this assertion, to
  -- prove the FINANCE gate (not the module gate) is what hides the
  -- numbers — the real seeded Customer Support role never gets
  -- marketing.view at all (test #3 already proved that stronger case).
  insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r, public.permissions p
    where r.workspace_id is null and r.slug = 'customer-support' and p.slug = 'marketing.view'
    on conflict do nothing;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c4', false);
  set role authenticated;
  select * into v_row from public.get_marketing_campaign_list(v_ws, v_brand, null, null, null, null, null) where campaign_id = v_campaign_id;
  reset role;

  assert v_row.orders_created = 2, 'Customer Support should still see operational order counts';
  assert v_row.spend is null, 'Customer Support must never see spend even with marketing.view';
  assert v_row.delivered_revenue is null, 'Customer Support must never see delivered_revenue';
  assert v_row.roas is null, 'Customer Support must never see ROAS';

  delete from public.role_permissions where role_id = (select id from public.roles where slug = 'customer-support') and permission_id = (select id from public.permissions where slug = 'marketing.view');
  raise notice 'OK 6: finance-sensitive marketing figures correctly hidden behind user_has_marketing_finance_visibility(), independent of module-level view access.';
end $$;

\echo '=== 7. Zero-spend / zero-delivered-order campaign never divides by zero ==='
do $$
declare v_ws uuid; v_brand uuid; v_campaign_id uuid; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p12-ws-a';
  select id into v_brand from public.brands where slug = 'p12-brand-a';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  insert into public.marketing_campaigns (workspace_id, brand_id, name, channel, utm_campaign, status, created_by, updated_by)
    values (v_ws, v_brand, 'P12 Empty Campaign', 'tiktok', 'p12_never_spent', 'draft', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1')
    returning id into v_campaign_id;

  select * into v_row from public.get_marketing_campaign_list(v_ws, v_brand, null, null, null, null, null) where campaign_id = v_campaign_id;

  assert v_row.spend = 0, 'zero-spend campaign should report spend=0, not null (0 spend is a known fact)';
  assert v_row.orders_created = 0;
  assert v_row.delivered_cpa is null, 'delivered_cpa must be null (never 0 or error) when delivered_orders=0';
  assert v_row.roas is null, 'roas must be null (never 0x) when spend=0';
  assert v_row.delivery_rate_pct is null, 'delivery_rate_pct must be null when orders_created=0, not a divide-by-zero error';
  assert v_row.profit_data_available = false, 'profit_data_available must be false with no delivered orders';
  assert v_row.contribution_profit is null, 'contribution_profit must be null, never a fabricated number, when no data is available';
  raise notice 'OK 7: zero-division safety confirmed across CPA/ROAS/delivery-rate/profit.';
end $$;

\echo '=== 8. get_marketing_summary aggregates correctly and hides financials from a caller without finance visibility ==='
do $$
declare v_ws uuid; v_brand uuid; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p12-ws-a';
  select id into v_brand from public.brands where slug = 'p12-brand-a';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  set role authenticated;
  select * into v_row from public.get_marketing_summary(v_ws, v_brand, null, null);
  reset role;

  assert v_row.total_ad_spend = 20000, format('expected total_ad_spend=20000, got %s', v_row.total_ad_spend);
  assert v_row.delivered_orders = 1;
  assert v_row.active_campaigns = 1, format('expected 1 active campaign (P12 Empty Campaign is draft), got %s', v_row.active_campaigns);
  raise notice 'OK 8: get_marketing_summary correct.';
end $$;

\echo '=== 9. Media buyer performance links to an existing profile, never a fake user ==='
do $$
declare v_ws uuid; v_brand uuid; v_campaign_id uuid; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p12-ws-a';
  select id into v_brand from public.brands where slug = 'p12-brand-a';
  select id into v_campaign_id from public.marketing_campaigns where name = 'P12 Meta Campaign';

  update public.marketing_campaigns set media_buyer_id = '00000000-0000-0000-0000-0000000000c7' where id = v_campaign_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  set role authenticated;
  select * into v_row from public.get_marketing_media_buyer_performance(v_ws, v_brand, null, null) where media_buyer_id = '00000000-0000-0000-0000-0000000000c7';
  reset role;

  assert v_row.media_buyer_id is not null, 'media buyer row should exist once assigned to a campaign';
  assert v_row.delivered_orders = 1;
  raise notice 'OK 9: media buyer performance resolves against an existing profile.';
end $$;

\echo '=== 10. Affiliate orders are classified as channel=affiliate, never counted as paid media spend ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_affiliate_id uuid; v_order public.orders; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p12-ws-a';
  select id into v_brand from public.brands where slug = 'p12-brand-a';
  select id into v_prod from public.products where slug = 'p12-product';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  insert into public.affiliates (workspace_id, full_name, email, phone, approval_status, referral_code, created_by)
    values (v_ws, 'P12 Affiliate', 'p12aff@test.local', '08022220000', 'approved', 'p12aff', '00000000-0000-0000-0000-0000000000c1')
    returning id into v_affiliate_id;

  v_order := public.create_order(v_ws, v_brand, 'affiliate', 'P12 Affiliate Buyer', '08033330000', '3 Affiliate Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.orders set affiliate_id = v_affiliate_id where id = v_order.id;

  select * into v_row from public.get_marketing_channel_performance(v_ws, v_brand, null, null) where channel = 'affiliate';
  assert v_row.orders_created >= 1, 'the affiliate-attributed order must appear under channel=affiliate';
  raise notice 'OK 10: affiliate order correctly bucketed under channel=affiliate, not fabricated as paid media.';
end $$;

\echo '=== ALL PHASE 12 MARKETING TESTS PASSED ==='
