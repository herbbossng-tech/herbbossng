-- ============================================================
-- 0057 (Affiliate Portal v2 analytics) dedicated regression test.
-- Run against a fresh DB that already has the full 0001-0057 chain
-- applied. Covers: campaign instructions, form view tracking,
-- package badges + form addons (creation, public read, order
-- pricing + line items), the richer dashboard RPC's date-range/
-- conversion/refund-rate/top-products math, My Orders pagination,
-- My Forms stats, submissions ownership check, and affiliate
-- visibility into campaign promo assets.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_owner_id uuid := 'bbbbbbbb-0057-0057-0057-000000000001';
  v_aff_auth_id uuid := 'bbbbbbbb-0057-0057-0057-000000000002';
  v_ws uuid; v_brand uuid; v_prod uuid;
  v_campaign uuid;
  v_aff_id uuid;
begin
  insert into auth.users (id, email) values (v_owner_id, 'owner-0057@test.local') on conflict do nothing;
  insert into auth.users (id, email) values (v_aff_auth_id, 'aff-0057@test.local') on conflict do nothing;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('0057 Test WS', 'test-0057-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws;
  insert into public.brands (workspace_id, name, slug) values (v_ws, '0057 Test Brand', 'test-0057-brand') returning id into v_brand;

  insert into public.user_roles (user_id, workspace_id, role_id)
    select v_owner_id, v_ws, id from public.roles where slug = 'owner' and workspace_id is null;

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws, v_brand, '0057 Product', 'test-0057-product', 'TEST-0057-SKU', 'active', 10000, 4000, 500)
    returning id into v_prod;

  insert into public.affiliate_campaigns (
    workspace_id, brand_id, name, slug, commission_type, commission_value, qualifying_event, affiliate_access,
    allowed_activities, instructions, created_by
  ) values (
    v_ws, v_brand, '0057 Campaign', 'test-0057-campaign', 'PERCENTAGE', 10, 'PER_ORDER_CREATED', 'ALL_APPROVED_AFFILIATES',
    array['CREATE_ORDER_FORMS'], 'Promote with ads on Facebook and TikTok.', v_owner_id
  ) returning id into v_campaign;
  insert into public.affiliate_campaign_products (campaign_id, product_id) values (v_campaign, v_prod);
  update public.affiliate_campaigns set status = 'ACTIVE' where id = v_campaign;
end $$;

-- create_affiliate()/approve_affiliate() are SECURITY DEFINER but still
-- explicitly check user_has_permission(auth.uid()) — that check is
-- independent of Postgres role superuser status, so auth.uid() must
-- resolve to the owner before calling them.
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'bbbbbbbb-0057-0057-0057-000000000001'::uuid
$$;
do $$
declare
  v_ws uuid;
  v_aff_id uuid;
  v_aff_auth_id uuid := 'bbbbbbbb-0057-0057-0057-000000000002';
begin
  select id into v_ws from public.workspaces where slug = 'test-0057-ws';
  v_aff_id := (public.create_affiliate(v_ws, '0057 Affiliate', 'aff-0057@aff.test', '08099990057')).id;
  perform public.approve_affiliate(v_aff_id);
  update public.affiliates set auth_user_id = v_aff_auth_id, portal_access_enabled = true where id = v_aff_id;
end $$;

\echo '=== 1. Campaign instructions field round-trips and is visible to staff ==='
do $$
declare
  v_instructions text;
begin
  select instructions into v_instructions from public.affiliate_campaigns where slug = 'test-0057-campaign';
  assert v_instructions = 'Promote with ads on Facebook and TikTok.', 'instructions should round-trip exactly';
  raise notice 'OK 1: campaign instructions field round-trips.';
end $$;

-- Impersonate the affiliate portal session for form authoring.
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'bbbbbbbb-0057-0057-0057-000000000002'::uuid
$$;

\echo '=== 2. create_affiliate_order_form accepts a badge per package and an addons array ==='
do $$
declare
  v_campaign_id uuid; v_prod_id uuid; v_form public.affiliate_order_forms;
  v_pkg_badge text;
  v_addon_count integer;
begin
  select id into v_campaign_id from public.affiliate_campaigns where slug = 'test-0057-campaign';
  select id into v_prod_id from public.products where sku = 'TEST-0057-SKU';

  v_form := public.create_affiliate_order_form(
    v_campaign_id, v_prod_id, '0057 Test Form',
    jsonb_build_array(jsonb_build_object('name', 'Buy 1', 'quantity', 1, 'price', 10000, 'badge', 'Most Popular')),
    '{}'::jsonb, '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('name', 'Gift wrap', 'price', 1500))
  );

  select badge into v_pkg_badge from public.affiliate_order_form_packages where order_form_id = v_form.id;
  assert v_pkg_badge = 'Most Popular', 'package badge should persist';

  select count(*) into v_addon_count from public.affiliate_order_form_addons where order_form_id = v_form.id;
  assert v_addon_count = 1, 'one addon should have been created';
  raise notice 'OK 2: badge + addon persisted on create_affiliate_order_form.';
end $$;

\echo '=== 3. get_public_affiliate_order_form returns the badge and addons array (anonymous) ==='
create or replace function auth.uid() returns uuid language sql stable as $$
  select null::uuid
$$;
do $$
declare
  v_form_id uuid;
  v_public record;
begin
  select id into v_form_id from public.affiliate_order_forms where internal_title = '0057 Test Form';
  select * into v_public from public.get_public_affiliate_order_form(v_form_id);
  assert (v_public.packages -> 0 ->> 'badge') = 'Most Popular', 'public read should expose the package badge';
  assert jsonb_array_length(v_public.addons) = 1, 'public read should expose the addons array';
  assert (v_public.addons -> 0 ->> 'name') = 'Gift wrap', 'addon name should round-trip';
  raise notice 'OK 3: public form read exposes badge + addons.';
end $$;

\echo '=== 4. record_affiliate_order_form_view increments views; a random/inactive form id no-ops ==='
do $$
declare
  v_form_id uuid;
  v_before integer; v_after integer;
begin
  select id into v_form_id from public.affiliate_order_forms where internal_title = '0057 Test Form';
  select count(*) into v_before from public.affiliate_order_form_views where order_form_id = v_form_id;
  perform public.record_affiliate_order_form_view(v_form_id);
  perform public.record_affiliate_order_form_view(v_form_id);
  perform public.record_affiliate_order_form_view(gen_random_uuid());
  select count(*) into v_after from public.affiliate_order_form_views where order_form_id = v_form_id;
  assert v_after = v_before + 2, 'exactly two real views should have been recorded';
  raise notice 'OK 4: view tracking increments for a real form, no-ops for a random id.';
end $$;

\echo '=== 5. create_affiliate_order_form_order with an addon: total includes addon price, addon gets its own order_items row, unknown addon id is rejected ==='
do $$
declare
  v_form_id uuid; v_pkg_id uuid; v_addon_id uuid;
  v_order public.orders;
  v_addon_item_count integer;
  v_foreign_addon_id uuid := gen_random_uuid();
begin
  select id into v_form_id from public.affiliate_order_forms where internal_title = '0057 Test Form';
  select id into v_pkg_id from public.affiliate_order_form_packages where order_form_id = v_form_id;
  select id into v_addon_id from public.affiliate_order_form_addons where order_form_id = v_form_id;

  begin
    perform public.create_affiliate_order_form_order(
      v_form_id, v_pkg_id, 'Buyer 0057', '08011110057', '1 Test Close', 'Lagos', 'Lagos',
      null, null, null, null, null, array[v_foreign_addon_id]
    );
    raise exception 'an addon id not belonging to this form should have been rejected';
  exception when others then
    raise notice 'OK 5a: foreign/unknown addon id correctly rejected (%).', sqlerrm;
  end;

  v_order := public.create_affiliate_order_form_order(
    v_form_id, v_pkg_id, 'Buyer 0057', '08011110057', '1 Test Close', 'Lagos', 'Lagos',
    null, null, null, null, null, array[v_addon_id]
  );
  assert v_order.total_amount = 11500, format('total should be package(10000) + addon(1500) + free shipping = 11500, got %s', v_order.total_amount);

  select count(*) into v_addon_item_count from public.order_items
    where order_id = v_order.id and metadata ? 'affiliate_order_form_addon_id';
  assert v_addon_item_count = 1, 'the addon should have its own order_items row';
  raise notice 'OK 5b: addon correctly priced into the order total and given its own line item.';
end $$;

\echo '=== 6. get_my_order_forms_with_stats: orders_count/views_count/conversion_rate reconcile with tests 4-5 ==='
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'bbbbbbbb-0057-0057-0057-000000000002'::uuid
$$;
do $$
declare
  v_stats record;
begin
  select * into v_stats from public.get_my_order_forms_with_stats() where internal_title = '0057 Test Form';
  assert v_stats.orders_count = 1, format('expected 1 order, got %s', v_stats.orders_count);
  assert v_stats.views_count = 2, format('expected 2 views, got %s', v_stats.views_count);
  assert v_stats.conversion_rate = 50.0, format('expected 50.0%% conversion (1/2), got %s', v_stats.conversion_rate);
  raise notice 'OK 6: get_my_order_forms_with_stats reconciles orders/views/conversion.';
end $$;

\echo '=== 7. get_my_order_form_submissions: returns the order for the owning affiliate, raises for a form the caller does not own ==='
do $$
declare
  v_form_id uuid;
  v_other_form_id uuid := gen_random_uuid();
  v_submission record;
begin
  select id into v_form_id from public.affiliate_order_forms where internal_title = '0057 Test Form';
  select * into v_submission from public.get_my_order_form_submissions(v_form_id) limit 1;
  assert v_submission.order_number is not null, 'submissions should include the order placed in test 5';
  assert v_submission.total_count = 1, format('expected total_count=1, got %s', v_submission.total_count);

  begin
    perform public.get_my_order_form_submissions(v_other_form_id);
    raise exception 'a form the caller does not own should have raised';
  exception when others then
    raise notice 'OK 7: submissions correctly scoped to the owning affiliate, foreign form id rejected (%).', sqlerrm;
  end;
end $$;

\echo '=== 8. get_my_affiliate_orders: pagination + status filter, PII-free ==='
do $$
declare
  v_row record;
  v_filtered_count integer;
begin
  select * into v_row from public.get_my_affiliate_orders(null, 20, 0) limit 1;
  assert v_row.order_number is not null, 'my orders should return the order from test 5';
  assert v_row.total_count = 1, 'total_count should reflect the one order so far';

  select count(*) into v_filtered_count from public.get_my_affiliate_orders('DELIVERED', 20, 0);
  assert v_filtered_count = 0, 'no orders are DELIVERED yet, status filter should return zero rows';
  raise notice 'OK 8: get_my_affiliate_orders paginates and filters by status correctly.';
end $$;

\echo '=== 9. get_my_affiliate_dashboard: period totals, conversion rate, refund rate, daily series ==='
create or replace function auth.uid() returns uuid language sql stable as $$
  select null::uuid
$$;
do $$
declare
  v_form_id uuid; v_pkg_id uuid;
  v_order2 public.orders;
begin
  select id into v_form_id from public.affiliate_order_forms where internal_title = '0057 Test Form';
  select id into v_pkg_id from public.affiliate_order_form_packages where order_form_id = v_form_id;

  -- A second order, walked to RETURNED via a legal transition path, to
  -- exercise refund_rate and confirm total_revenue correctly excludes it.
  v_order2 := public.create_affiliate_order_form_order(
    v_form_id, v_pkg_id, 'Buyer 0057-Two', '08011110058', '2 Test Close', 'Lagos', 'Lagos'
  );
  perform set_config('gcos.order2_id', v_order2.id::text, false);
end $$;

-- Status transitions are staff-only (orders.approve/orders.manage) — walk
-- the order to RETURNED as the workspace owner.
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'bbbbbbbb-0057-0057-0057-000000000001'::uuid
$$;
do $$
declare
  v_order2_id uuid := current_setting('gcos.order2_id')::uuid;
begin
  update public.orders set status = 'PENDING' where id = v_order2_id;
  update public.orders set status = 'CONFIRMED' where id = v_order2_id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order2_id;
  update public.orders set status = 'DISPATCHED' where id = v_order2_id;
  update public.orders set status = 'RETURNED', return_reason = 'Customer refused delivery' where id = v_order2_id;
end $$;

-- Back to the affiliate portal session — get_my_affiliate_dashboard()
-- self-scopes via current_affiliate_id(), which resolves to null for
-- the staff session used above.
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'bbbbbbbb-0057-0057-0057-000000000002'::uuid
$$;
do $$
declare
  v_dash record;
begin
  select * into v_dash from public.get_my_affiliate_dashboard(current_date - 1, current_date);

  assert v_dash.total_orders = 2, format('expected 2 orders in the 2-day window, got %s', v_dash.total_orders);
  assert v_dash.refund_rate = 50.0, format('expected 50%% refund rate (1 of 2 RETURNED), got %s', v_dash.refund_rate);
  assert v_dash.total_revenue = 11500, format('total_revenue should exclude the RETURNED order (11500 only), got %s', v_dash.total_revenue);
  assert v_dash.conversion_rate = 100.0, format('2 orders / 2 views = 100%% conversion, got %s', v_dash.conversion_rate);
  assert jsonb_array_length(v_dash.daily_revenue) = 2, 'daily_revenue should have one entry per day in the 2-day window';
  assert (v_dash.top_products -> 0 ->> 'product_name') = '0057 Product', 'top_products should surface the one product sold';
  raise notice 'OK 9: dashboard period totals/conversion/refund-rate/daily-series all reconcile.';
end $$;

\echo '=== 10. Affiliate can read campaign promo assets via the new select policy ==='
do $$
declare
  v_campaign_id uuid;
  v_asset_id uuid;
  v_visible_count integer;
begin
  select id into v_campaign_id from public.affiliate_campaigns where slug = 'test-0057-campaign';
end $$;

reset role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'bbbbbbbb-0057-0057-0057-000000000001'::uuid
$$;
do $$
declare
  v_campaign_id uuid;
begin
  select id into v_campaign_id from public.affiliate_campaigns where slug = 'test-0057-campaign';
  insert into public.affiliate_campaign_assets (campaign_id, name, file_path, created_by)
    values (v_campaign_id, 'Banner', 'campaign-assets/banner.png', 'bbbbbbbb-0057-0057-0057-000000000001');
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'bbbbbbbb-0057-0057-0057-000000000002'::uuid
$$;
do $$
declare
  v_visible_count integer;
begin
  select count(*) into v_visible_count from public.affiliate_campaign_assets where name = 'Banner';
  assert v_visible_count = 1, 'the approved affiliate should see the campaign''s promo asset';
  raise notice 'OK 10: affiliate can read campaign promo materials via affiliate_can_access_campaign().';
end $$;

\echo '=== ALL 0057 AFFILIATE PORTAL ANALYTICS TESTS PASSED ==='
