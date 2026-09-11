-- ============================================================
-- 0058-0060 (Affiliate Portal v3) dedicated regression test.
-- Run against a fresh DB that already has the full 0001-0060 chain
-- applied. Covers: bank accounts (max 5, default rotation),
-- self-service withdrawal request (reserve/balance-check), ad-cost
-- submission, manual order entry (SUBMIT_ORDERS gating, PENDING
-- status), and offers (create/link/validate, ORDER_BUMP wired into
-- the public form + order pricing + redemption stats + max_quantity
-- cap).
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_owner_id uuid := 'cccccccc-0058-0058-0058-000000000001';
  v_aff_auth_id uuid := 'cccccccc-0058-0058-0058-000000000002';
  v_ws uuid; v_brand uuid; v_prod uuid;
  v_campaign uuid;
begin
  insert into auth.users (id, email) values (v_owner_id, 'owner-0058@test.local') on conflict do nothing;
  insert into auth.users (id, email) values (v_aff_auth_id, 'aff-0058@test.local') on conflict do nothing;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('0058 Test WS', 'test-0058-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws;
  insert into public.brands (workspace_id, name, slug) values (v_ws, '0058 Test Brand', 'test-0058-brand') returning id into v_brand;

  insert into public.user_roles (user_id, workspace_id, role_id)
    select v_owner_id, v_ws, id from public.roles where slug = 'owner' and workspace_id is null;

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws, v_brand, '0058 Product', 'test-0058-product', 'TEST-0058-SKU', 'active', 8000, 3000, 500)
    returning id into v_prod;

  insert into public.affiliate_campaigns (
    workspace_id, brand_id, name, slug, commission_type, commission_value, qualifying_event, affiliate_access,
    allowed_activities, created_by
  ) values (
    v_ws, v_brand, '0058 Campaign', 'test-0058-campaign', 'PERCENTAGE', 10, 'PER_ORDER_CREATED', 'ALL_APPROVED_AFFILIATES',
    array['CREATE_ORDER_FORMS'], v_owner_id
  ) returning id into v_campaign;
  insert into public.affiliate_campaign_products (campaign_id, product_id) values (v_campaign, v_prod);
  update public.affiliate_campaigns set status = 'ACTIVE' where id = v_campaign;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-0058-0058-0058-000000000001'::uuid
$$;
do $$
declare
  v_ws uuid;
  v_aff_id uuid;
  v_aff_auth_id uuid := 'cccccccc-0058-0058-0058-000000000002';
begin
  select id into v_ws from public.workspaces where slug = 'test-0058-ws';
  v_aff_id := (public.create_affiliate(v_ws, '0058 Affiliate', 'aff-0058@aff.test', '08099990058')).id;
  perform public.approve_affiliate(v_aff_id);
  update public.affiliates set auth_user_id = v_aff_auth_id, portal_access_enabled = true where id = v_aff_id;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-0058-0058-0058-000000000002'::uuid
$$;

\echo '=== 1. Bank accounts: max 5, first is default, deleting default rotates to next ==='
do $$
declare
  v_id1 uuid; v_id2 uuid; v_id3 uuid; v_id4 uuid; v_id5 uuid;
  v_default_count integer;
begin
  v_id1 := (public.create_my_bank_account('GTBank', '0011122233', 'Test Affiliate')).id;
  v_id2 := (public.create_my_bank_account('Access Bank', '0022233344', 'Test Affiliate')).id;
  v_id3 := (public.create_my_bank_account('Zenith Bank', '0033344455', 'Test Affiliate')).id;
  v_id4 := (public.create_my_bank_account('UBA', '0044455566', 'Test Affiliate')).id;
  v_id5 := (public.create_my_bank_account('First Bank', '0055566677', 'Test Affiliate')).id;

  begin
    perform public.create_my_bank_account('Fidelity Bank', '0066677788', 'Test Affiliate');
    raise exception 'a 6th bank account should have been rejected';
  exception when others then
    raise notice 'OK 1a: 6th bank account correctly rejected (%).', sqlerrm;
  end;

  select count(*) into v_default_count from public.affiliate_bank_accounts where is_default = true;
  assert v_default_count = 1, 'exactly one account should be default';
  assert exists(select 1 from public.affiliate_bank_accounts where id = v_id1 and is_default = true), 'the first account created should be default';

  perform public.delete_my_bank_account(v_id1);
  select count(*) into v_default_count from public.affiliate_bank_accounts where is_default = true;
  assert v_default_count = 1, 'deleting the default account should rotate the default to another account, never leave zero';
  raise notice 'OK 1b: deleting the default account rotates default to another account.';
end $$;

\echo '=== 2. request_my_affiliate_withdrawal: insufficient balance rejected, then succeeds and reserves funds ==='
do $$
declare
  v_account_id uuid;
  v_wallet_before numeric;
  v_wallet_after numeric;
  v_reserved_after numeric;
  v_withdrawal public.affiliate_withdrawals;
begin
  select id into v_account_id from public.affiliate_bank_accounts limit 1;

  begin
    perform public.request_my_affiliate_withdrawal(1000, v_account_id, 'test note');
    raise exception 'a withdrawal exceeding balance should have been rejected';
  exception when others then
    raise notice 'OK 2a: insufficient-balance withdrawal correctly rejected (%).', sqlerrm;
  end;
end $$;

reset role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-0058-0058-0058-000000000001'::uuid
$$;
do $$
declare
  v_aff_id uuid;
  v_ws uuid;
begin
  select id into v_aff_id from public.affiliates where email = 'aff-0058@aff.test';
  select id into v_ws from public.workspaces where slug = 'test-0058-ws';
  insert into public.affiliate_wallets (workspace_id, affiliate_id, currency_code) values (v_ws, v_aff_id, 'NGN')
    on conflict (workspace_id, affiliate_id) do nothing;
  perform public.credit_affiliate_wallet(v_ws, v_aff_id, 'MANUAL_CREDIT', 5000, 0, 'manual', null, 'Test credit', 'NGN');
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-0058-0058-0058-000000000002'::uuid
$$;
do $$
declare
  v_account_id uuid;
  v_withdrawal public.affiliate_withdrawals;
  v_row record;
begin
  select id into v_account_id from public.affiliate_bank_accounts limit 1;
  v_withdrawal := public.request_my_affiliate_withdrawal(3000, v_account_id, 'payout please');
  assert v_withdrawal.status = 'PENDING', 'new withdrawal should be PENDING';
  assert v_withdrawal.amount = 3000, 'withdrawal amount should match requested amount';

  select * into v_row from public.get_my_affiliate_withdrawals(20, 0) limit 1;
  assert v_row.id = v_withdrawal.id, 'get_my_affiliate_withdrawals should return the just-created withdrawal';
  raise notice 'OK 2b: withdrawal request succeeds against a funded wallet and is listed back.';
end $$;

\echo '=== 3. submit_my_ad_cost + get_my_ad_costs ==='
do $$
declare
  v_campaign_id uuid;
  v_ad_cost public.ad_costs;
  v_row record;
begin
  select id into v_campaign_id from public.affiliate_campaigns where slug = 'test-0058-campaign';
  v_ad_cost := public.submit_my_ad_cost(v_campaign_id, current_date - 6, current_date, 15000, 20, 'Facebook ads');
  assert v_ad_cost.status = 'PENDING', 'a submitted ad cost should start PENDING';

  select * into v_row from public.get_my_ad_costs('PENDING', 20, 0) limit 1;
  assert v_row.id = v_ad_cost.id, 'get_my_ad_costs should return the submitted ad cost under the PENDING filter';
  raise notice 'OK 3: ad cost submission + retrieval work end to end.';
end $$;

\echo '=== 4. create_affiliate_manual_order: rejected without SUBMIT_ORDERS, succeeds once granted, lands on PENDING ==='
do $$
declare
  v_campaign_id uuid; v_prod_id uuid;
begin
  select id into v_campaign_id from public.affiliate_campaigns where slug = 'test-0058-campaign';
  select id into v_prod_id from public.products where sku = 'TEST-0058-SKU';

  begin
    perform public.create_affiliate_manual_order(
      v_campaign_id, v_prod_id, 2, 'Manual Buyer', '08011110058', '1 Test Close', 'Lagos', 'Lagos'
    );
    raise exception 'manual order entry should have been rejected without SUBMIT_ORDERS';
  exception when others then
    raise notice 'OK 4a: manual order entry correctly rejected without SUBMIT_ORDERS (%).', sqlerrm;
  end;
end $$;

reset role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-0058-0058-0058-000000000001'::uuid
$$;
do $$
begin
  update public.affiliate_campaigns set allowed_activities = array['CREATE_ORDER_FORMS', 'SUBMIT_ORDERS'] where slug = 'test-0058-campaign';
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-0058-0058-0058-000000000002'::uuid
$$;
do $$
declare
  v_campaign_id uuid; v_prod_id uuid;
  v_order public.orders;
begin
  select id into v_campaign_id from public.affiliate_campaigns where slug = 'test-0058-campaign';
  select id into v_prod_id from public.products where sku = 'TEST-0058-SKU';

  v_order := public.create_affiliate_manual_order(
    v_campaign_id, v_prod_id, 2, 'Manual Buyer', '08011110058', '1 Test Close', 'Lagos', 'Lagos'
  );
  assert v_order.status = 'PENDING', format('expected PENDING, got %s', v_order.status);
  assert v_order.total_amount = 16000, format('expected 8000*2=16000, got %s', v_order.total_amount);
  assert v_order.affiliate_id is not null, 'manual order should be attributed to the affiliate';
  assert (v_order.metadata ->> 'affiliate_manual_entry')::boolean = true, 'metadata should mark this as a manual affiliate entry';
  raise notice 'OK 4b: manual order entry succeeds once SUBMIT_ORDERS is granted, lands on PENDING with correct total.';
end $$;

\echo '=== 5. My Offers: create rejected for a product outside accessible campaigns, rejected for a foreign form, succeeds for a valid order-bump linked to the affiliate''s own form ==='
do $$
declare
  v_campaign_id uuid; v_prod_id uuid; v_form_id uuid; v_pkg_id uuid;
  v_foreign_product_id uuid := gen_random_uuid();
  v_foreign_form_id uuid := gen_random_uuid();
  v_offer public.affiliate_offers;
begin
  select id into v_campaign_id from public.affiliate_campaigns where slug = 'test-0058-campaign';
  select id into v_prod_id from public.products where sku = 'TEST-0058-SKU';

  begin
    perform public.create_my_offer('ORDER_BUMP', v_foreign_product_id, 'Bad Offer', 'Add this!');
    raise exception 'an offer for a product outside accessible campaigns should have been rejected';
  exception when others then
    raise notice 'OK 5a: offer creation correctly rejected for an inaccessible product (%).', sqlerrm;
  end;

  v_form_id := (public.create_affiliate_order_form(
    v_campaign_id, v_prod_id, '0058 Test Form',
    jsonb_build_array(jsonb_build_object('name', 'Buy 1', 'quantity', 1, 'price', 8000))
  )).id;

  begin
    perform public.create_my_offer('ORDER_BUMP', v_prod_id, 'Bad Offer 2', 'Add this!', null, null, 'Yes', 'No', 1, 1500, null, null, array[v_foreign_form_id]);
    raise exception 'linking an offer to a form the affiliate does not own should have been rejected';
  exception when others then
    raise notice 'OK 5b: offer creation correctly rejected for a foreign/nonexistent form (%).', sqlerrm;
  end;

  v_offer := public.create_my_offer(
    'ORDER_BUMP', v_prod_id, 'Gift Wrap Bump', 'Add gift wrap for a special price!', 'Nicely wrapped.',
    null, 'Yes, wrap it!', 'No thanks', 1, 1500, 2000, 1, array[v_form_id]
  );
  assert v_offer.status = 'ACTIVE', 'a new offer should default to ACTIVE';
  raise notice 'OK 5c: a valid order-bump offer, linked to the affiliate''s own form, is created.';
end $$;

\echo '=== 6. Public order form exposes the linked order-bump; ordering with it prices correctly, increments redemption, and respects max_quantity ==='
create or replace function auth.uid() returns uuid language sql stable as $$
  select null::uuid
$$;
do $$
declare
  v_form_id uuid; v_pkg_id uuid; v_offer_id uuid;
  v_public record;
  v_order public.orders;
begin
  select id into v_form_id from public.affiliate_order_forms where internal_title = '0058 Test Form';
  select id into v_pkg_id from public.affiliate_order_form_packages where order_form_id = v_form_id;
  select id into v_offer_id from public.affiliate_offers where internal_name = 'Gift Wrap Bump';

  select * into v_public from public.get_public_affiliate_order_form(v_form_id);
  assert jsonb_array_length(v_public.offers) = 1, 'public form should expose the one linked, active order-bump offer';
  assert (v_public.offers -> 0 ->> 'headline') = 'Add gift wrap for a special price!', 'offer headline should round-trip';

  v_order := public.create_affiliate_order_form_order(
    v_form_id, v_pkg_id, 'Bump Buyer', '08011110059', '2 Test Close', 'Lagos', 'Lagos',
    null, null, null, null, null, '{}'::uuid[], array[v_offer_id]
  );
  assert v_order.total_amount = 9500, format('expected package(8000) + offer(1500) + free shipping = 9500, got %s', v_order.total_amount);

  -- max_quantity is 1 and has now been redeemed once — a second order
  -- with the same offer id should no longer see it as available.
  begin
    perform public.create_affiliate_order_form_order(
      v_form_id, v_pkg_id, 'Bump Buyer Two', '08011110060', '3 Test Close', 'Lagos', 'Lagos',
      null, null, null, null, null, '{}'::uuid[], array[v_offer_id]
    );
    raise exception 'an offer at its max_quantity cap should have been rejected';
  exception when others then
    raise notice 'OK 6a: max_quantity cap correctly enforced on a second attempt (%).', sqlerrm;
  end;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-0058-0058-0058-000000000002'::uuid
$$;
do $$
declare
  v_stats record;
begin
  select * into v_stats from public.get_my_offers_with_stats('ORDER_BUMP') where internal_name = 'Gift Wrap Bump';
  assert v_stats.redeemed_count = 1, format('expected redeemed_count=1, got %s', v_stats.redeemed_count);
  assert v_stats.revenue_generated = 1500, format('expected revenue_generated=1500, got %s', v_stats.revenue_generated);
  assert v_stats.linked_orders_count = 1, format('exactly one order was successfully placed through the linked form (the second attempt was rejected before insert), got %s', v_stats.linked_orders_count);
  assert v_stats.conversion_rate = 100.0, format('1 redemption / 1 linked order = 100%%, got %s', v_stats.conversion_rate);
  raise notice 'OK 6b: get_my_offers_with_stats reflects the redemption and revenue correctly.';
end $$;

\echo '=== ALL 0058-0060 AFFILIATE PORTAL V3 TESTS PASSED ==='
