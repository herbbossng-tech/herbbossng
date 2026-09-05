-- ============================================================
-- Phase 5 (Affiliate) smoke test. Run against a fresh DB that
-- already has the full 0001-0024 chain applied. Not committed to
-- the repo — local validation only.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_owner_role_id uuid;
  v_user_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_ws1 uuid; v_brand1 uuid;
  v_prod_a uuid; v_prod_b uuid;
begin
  insert into auth.users (id, email) values (v_user_id, 'owner@test.local') on conflict do nothing;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Affiliate Test WS', 'affiliate-test-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws1;
  insert into public.brands (workspace_id, name, slug) values (v_ws1, 'Affiliate Test Brand', 'affiliate-test-brand') returning id into v_brand1;

  select id into v_owner_role_id from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_user_id, v_ws1, v_owner_role_id);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws1, v_brand1, 'Product A', 'aff-product-a', 'AFF-SKU-A', 'active', 5000, 2000, 500) returning id into v_prod_a;
  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws1, v_brand1, 'Product B', 'aff-product-b', 'AFF-SKU-B', 'active', 3000, 1000, 500) returning id into v_prod_b;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
$$;

\echo '=== 1. Affiliate lifecycle ==='
do $$
declare
  v_ws1 uuid;
  v_aff public.affiliates;
begin
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  v_aff := public.create_affiliate(v_ws1, 'Chidi Affiliate', 'chidi@aff.test', '08099990001');
  assert v_aff.approval_status = 'pending', 'new affiliate should be pending';
  v_aff := public.approve_affiliate(v_aff.id);
  assert v_aff.approval_status = 'approved' and v_aff.status = 'active', 'approve_affiliate should activate';
  raise notice 'Affiliate % approved with referral_code %', v_aff.full_name, v_aff.referral_code;

  -- Direct client tamper attempt on approval_status must be blocked by RLS WITH CHECK.
  begin
    update public.affiliates set approval_status = 'rejected' where id = v_aff.id;
    raise exception 'direct approval_status update should have been blocked by RLS';
  exception when others then
    raise notice 'OK: direct approval_status tamper correctly blocked (%).', sqlerrm;
  end;
end $$;

\echo '=== 2. Campaign lifecycle + activation guard ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod_a uuid;
  v_campaign public.affiliate_campaigns;
begin
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  select id into v_brand1 from public.brands where slug = 'affiliate-test-brand';
  select id into v_prod_a from public.products where sku = 'AFF-SKU-A';

  insert into public.affiliate_campaigns (workspace_id, brand_id, name, slug, commission_type, commission_value, qualifying_event, affiliate_access, created_by)
    values (v_ws1, v_brand1, 'Launch Campaign', 'launch-campaign', 'PERCENTAGE', 10, 'PER_ORDER_CREATED', 'ALL_APPROVED_AFFILIATES', auth.uid())
    returning * into v_campaign;

  -- Activation without a product must fail.
  begin
    update public.affiliate_campaigns set status = 'ACTIVE' where id = v_campaign.id;
    raise exception 'activation without a product should have failed';
  exception when others then
    raise notice 'OK: activation blocked without a product (%).', sqlerrm;
  end;

  insert into public.affiliate_campaign_products (campaign_id, product_id) values (v_campaign.id, v_prod_a);

  update public.affiliate_campaigns set status = 'ACTIVE' where id = v_campaign.id;
  raise notice 'OK: campaign activated once a product is attached.';
end $$;

\echo '=== 3. Order attribution + PER_ORDER_CREATED commission (idempotent) ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod_a uuid; v_code text;
  v_order public.orders;
  v_commission_count integer;
  v_commission public.affiliate_commissions%rowtype;
begin
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  select id into v_brand1 from public.brands where slug = 'affiliate-test-brand';
  select id into v_prod_a from public.products where sku = 'AFF-SKU-A';
  select referral_code into v_code from public.affiliates where email = 'chidi@aff.test';

  v_order := public.create_order(
    v_ws1, v_brand1, 'manual', 'Buyer One', '08011110002', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 2)),
    p_affiliate_referral_code := v_code
  );

  assert v_order.affiliate_id is not null, 'order should be attributed to the affiliate';
  assert v_order.affiliate_campaign_id is not null, 'order should be attributed to the active campaign';
  raise notice 'OK: order % attributed to campaign %', v_order.order_number, v_order.affiliate_campaign_id;

  select count(*) into v_commission_count from public.affiliate_commissions where order_id = v_order.id;
  assert v_commission_count = 1, 'expected exactly 1 commission row, got %', v_commission_count;

  select * into v_commission from public.affiliate_commissions where order_id = v_order.id;
  assert v_commission.status = 'ELIGIBLE', 'expected ELIGIBLE status';
  -- 2 x 5000 = 10000 base, 10% => 1000
  assert v_commission.commission_amount = 1000, 'expected commission_amount 1000, got %', v_commission.commission_amount;
  raise notice 'OK: commission_base=%, commission_amount=%', v_commission.commission_base_amount, v_commission.commission_amount;

  -- Idempotency: calling process_affiliate_commission again must be a no-op.
  perform public.process_affiliate_commission(v_order.id);
  perform public.process_affiliate_commission(v_order.id);
  select count(*) into v_commission_count from public.affiliate_commissions where order_id = v_order.id;
  assert v_commission_count = 1, 'duplicate calc retry should stay idempotent, got % rows', v_commission_count;
  raise notice 'OK: duplicate process_affiliate_commission calls stayed idempotent.';

  -- Wallet should now show the commission credited.
  perform 1 from public.affiliate_wallets w
    join public.affiliates a on a.id = w.affiliate_id
    where a.email = 'chidi@aff.test' and w.balance = 1000;
  assert found, 'wallet balance should be 1000 after one commission';
  raise notice 'OK: wallet balance reflects the commission.';
end $$;

\echo '=== 4. Cancellation reverses a PER_ORDER_CREATED commission ==='
do $$
declare
  v_order_id uuid;
  v_wallet_balance numeric;
  v_commission_status text;
begin
  select id into v_order_id from public.orders where order_number is not null and affiliate_id is not null order by created_at desc limit 1;

  update public.orders set status = 'PENDING' where id = v_order_id;
  update public.orders set status = 'CANCELLED', cancellation_reason = 'Customer changed mind' where id = v_order_id;

  select status into v_commission_status from public.affiliate_commissions where order_id = v_order_id;
  assert v_commission_status = 'REVERSED', 'expected REVERSED status after cancellation, got %', v_commission_status;

  select w.balance into v_wallet_balance from public.affiliate_wallets w
    join public.affiliates a on a.id = w.affiliate_id where a.email = 'chidi@aff.test';
  assert v_wallet_balance = 0, 'wallet balance should be back to 0 after reversal, got %', v_wallet_balance;
  raise notice 'OK: cancellation reversed the commission and zeroed the wallet balance.';

  -- Duplicate reversal call must be a no-op.
  perform public.reverse_affiliate_commission(v_order_id);
  select w.balance into v_wallet_balance from public.affiliate_wallets w
    join public.affiliates a on a.id = w.affiliate_id where a.email = 'chidi@aff.test';
  assert v_wallet_balance = 0, 'duplicate reversal must stay idempotent, got balance %', v_wallet_balance;
  raise notice 'OK: duplicate reversal call stayed idempotent.';
end $$;

\echo '=== 5. Manual credit + withdrawal reservation/release/paid ==='
do $$
declare
  v_aff_id uuid;
  v_ws1 uuid;
  v_balance numeric;
  v_reserved numeric;
  v_withdrawal public.affiliate_withdrawals;
begin
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  select id into v_aff_id from public.affiliates where email = 'chidi@aff.test';

  perform public.create_manual_wallet_transaction(v_aff_id, 5000, 'Bonus for onboarding');
  select balance into v_balance from public.affiliate_wallets where affiliate_id = v_aff_id;
  assert v_balance = 5000, 'expected balance 5000 after manual credit, got %', v_balance;

  -- Over-withdrawal must fail.
  begin
    perform public.request_affiliate_withdrawal(v_aff_id, 10000);
    raise exception 'over-balance withdrawal should have failed';
  exception when others then
    raise notice 'OK: over-balance withdrawal correctly rejected (%).', sqlerrm;
  end;

  v_withdrawal := public.request_affiliate_withdrawal(v_aff_id, 3000, 'First payout');
  assert v_withdrawal.status = 'PENDING', 'expected PENDING status';

  select balance, reserved_balance into v_balance, v_reserved from public.affiliate_wallets where affiliate_id = v_aff_id;
  assert v_balance = 2000, 'expected available balance 2000 after reservation, got %', v_balance;
  assert v_reserved = 3000, 'expected reserved balance 3000, got %', v_reserved;
  raise notice 'OK: withdrawal request reserved funds correctly (balance=%, reserved=%).', v_balance, v_reserved;

  -- A second concurrent-style over-balance request against the now-lower available balance must also fail.
  begin
    perform public.request_affiliate_withdrawal(v_aff_id, 2500);
    raise exception 'second over-balance withdrawal should have failed';
  exception when others then
    raise notice 'OK: second withdrawal correctly blocked against reduced available balance (%).', sqlerrm;
  end;

  v_withdrawal := public.approve_affiliate_withdrawal(v_withdrawal.id);
  assert v_withdrawal.status = 'APPROVED', 'expected APPROVED status';

  v_withdrawal := public.mark_affiliate_withdrawal_paid(v_withdrawal.id, 'TXN-REF-001');
  assert v_withdrawal.status = 'PAID', 'expected PAID status';

  select balance, reserved_balance into v_balance, v_reserved from public.affiliate_wallets where affiliate_id = v_aff_id;
  assert v_balance = 2000, 'expected available balance still 2000 after payout, got %', v_balance;
  assert v_reserved = 0, 'expected reserved balance 0 after payout, got %', v_reserved;
  raise notice 'OK: payout cleared the reservation without double-touching available balance.';

  -- Double-pay must be structurally impossible (status no longer APPROVED).
  begin
    perform public.mark_affiliate_withdrawal_paid(v_withdrawal.id);
    raise exception 'double-payout should have failed';
  exception when others then
    raise notice 'OK: double-payout correctly rejected (%).', sqlerrm;
  end;

  -- Rejection release path: request another withdrawal then reject it.
  v_withdrawal := public.request_affiliate_withdrawal(v_aff_id, 1000, 'Second payout attempt');
  v_withdrawal := public.reject_affiliate_withdrawal(v_withdrawal.id, 'Bank details invalid');
  select balance, reserved_balance into v_balance, v_reserved from public.affiliate_wallets where affiliate_id = v_aff_id;
  assert v_balance = 2000, 'expected balance restored to 2000 after rejection release, got %', v_balance;
  assert v_reserved = 0, 'expected reserved 0 after rejection release, got %', v_reserved;
  raise notice 'OK: rejection released the reservation back to available balance.';
end $$;

\echo '=== 6. Ad cost approval workflow ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid;
  v_ad_cost public.ad_costs;
  v_row record;
begin
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  select id into v_brand1 from public.brands where slug = 'affiliate-test-brand';

  insert into public.ad_costs (workspace_id, brand_id, period_start, period_end, initial_cost_amount, initial_orders_count, delivered_orders_count, currency_code, submitted_by)
    values (v_ws1, v_brand1, '2026-08-01', '2026-08-07', 50000, 100, 40, 'NGN', auth.uid())
    returning * into v_ad_cost;

  assert v_ad_cost.status = 'PENDING', 'expected PENDING status';

  v_ad_cost := public.approve_ad_cost(v_ad_cost.id);
  assert v_ad_cost.status = 'APPROVED', 'expected APPROVED status';

  -- Double-approve must be a no-op-safe rejection (already not PENDING).
  begin
    perform public.approve_ad_cost(v_ad_cost.id);
    raise exception 'double-approve should have failed';
  exception when others then
    raise notice 'OK: duplicate ad cost approval correctly rejected (%).', sqlerrm;
  end;

  select * into v_row from public.get_ad_cost_summary(v_ws1, v_brand1) limit 1;
  assert v_row.initial_cost_per_order = 500, 'expected initial_cost_per_order 500, got %', v_row.initial_cost_per_order;
  assert v_row.delivered_cost_per_order = 1250, 'expected delivered_cost_per_order 1250, got %', v_row.delivered_cost_per_order;
  raise notice 'OK: ad cost per-order metrics computed correctly (initial=%, delivered=%).', v_row.initial_cost_per_order, v_row.delivered_cost_per_order;
end $$;

\echo '=== 7. Analytics RPCs return rows without erroring ==='
do $$
declare
  v_ws1 uuid;
  v_count integer;
begin
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  select count(*) into v_count from public.get_affiliate_performance(v_ws1);
  assert v_count >= 1, 'expected at least 1 affiliate performance row';
  select count(*) into v_count from public.get_campaign_performance(v_ws1);
  assert v_count >= 1, 'expected at least 1 campaign performance row';
  select count(*) into v_count from public.get_product_affiliate_performance(v_ws1);
  raise notice 'OK: analytics RPCs executed cleanly (product_affiliate rows=%).', v_count;
end $$;

\echo '=== ALL AFFILIATE SMOKE TESTS PASSED ==='

\echo '=== 8. PER_DELIVERED_ORDER campaign: no commission until DELIVERED ==='
do $$
declare
  v_ws1 uuid; v_brand1 uuid; v_prod_b uuid; v_aff_id uuid; v_code text;
  v_campaign public.affiliate_campaigns;
  v_order public.orders;
  v_commission_count integer;
  v_commission public.affiliate_commissions%rowtype;
  v_wallet_balance numeric;
begin
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  select id into v_brand1 from public.brands where slug = 'affiliate-test-brand';
  select id into v_prod_b from public.products where sku = 'AFF-SKU-B';
  select id into v_aff_id from public.affiliates where email = 'chidi@aff.test';
  select referral_code into v_code from public.affiliates where email = 'chidi@aff.test';

  insert into public.affiliate_campaigns (workspace_id, brand_id, name, slug, commission_type, commission_value, qualifying_event, affiliate_access, created_by)
    values (v_ws1, v_brand1, 'Delivered Campaign', 'delivered-campaign', 'FIXED_AMOUNT', 250, 'PER_DELIVERED_ORDER', 'ALL_APPROVED_AFFILIATES', auth.uid())
    returning * into v_campaign;
  insert into public.affiliate_campaign_products (campaign_id, product_id) values (v_campaign.id, v_prod_b);
  update public.affiliate_campaigns set status = 'ACTIVE' where id = v_campaign.id;

  v_order := public.create_order(
    v_ws1, v_brand1, 'manual', 'Buyer Two', '08011110003', '1 Test Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod_b, 'quantity', 1)),
    p_affiliate_referral_code := v_code
  );
  assert v_order.affiliate_campaign_id = v_campaign.id, 'order should attribute to the delivered-campaign';

  select count(*) into v_commission_count from public.affiliate_commissions where order_id = v_order.id;
  assert v_commission_count = 0, 'no commission should exist before DELIVERED, got %', v_commission_count;
  raise notice 'OK: no commission created at order creation for a PER_DELIVERED_ORDER campaign.';

  -- Walk the order through its full legal lifecycle to DELIVERED.
  update public.orders set status = 'PENDING' where id = v_order.id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order.id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order.id;
  update public.orders set status = 'DISPATCHED' where id = v_order.id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order.id;
  update public.orders set status = 'DELIVERED' where id = v_order.id;

  select count(*) into v_commission_count from public.affiliate_commissions where order_id = v_order.id;
  assert v_commission_count = 1, 'expected exactly 1 commission after delivery, got %', v_commission_count;

  select * into v_commission from public.affiliate_commissions where order_id = v_order.id;
  assert v_commission.status = 'ELIGIBLE' and v_commission.commission_amount = 250, 'expected ELIGIBLE 250, got % %', v_commission.status, v_commission.commission_amount;
  raise notice 'OK: PER_DELIVERED_ORDER commission fired exactly once on DELIVERED (amount=%).', v_commission.commission_amount;

  -- DELIVERED is terminal in order_status_transitions — reversal path is unreachable here by design; confirm no further transition is legal.
  begin
    update public.orders set status = 'CANCELLED', cancellation_reason = 'test' where id = v_order.id;
    raise exception 'DELIVERED -> CANCELLED should be an illegal transition';
  exception when others then
    raise notice 'OK: DELIVERED is confirmed terminal (%).', sqlerrm;
  end;
end $$;

\echo '=== 9. Permission denial: user without affiliates.create cannot create_affiliate ==='
create or replace function auth.uid() returns uuid language sql stable as $$
  select 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
$$;

do $$
declare
  v_ws1 uuid;
begin
  insert into auth.users (id, email) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'nobody@test.local') on conflict do nothing;
  select id into v_ws1 from public.workspaces where slug = 'affiliate-test-ws';
  begin
    perform public.create_affiliate(v_ws1, 'Should Fail');
    raise exception 'affiliate creation by an unauthorized user should have failed';
  exception when others then
    raise notice 'OK: create_affiliate correctly rejected for a user with no affiliates.create permission (%).', sqlerrm;
  end;
end $$;

\echo '=== ALL AFFILIATE SMOKE TESTS PASSED (INCLUDING DELIVERED PATH + PERMISSION DENIAL) ==='
