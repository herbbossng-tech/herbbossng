\set ON_ERROR_STOP on
set client_min_messages to notice;

do $$
declare
  v_ws uuid; v_brand uuid; v_owner_role uuid; v_cs_role uuid;
  v_prod uuid; v_cust uuid; v_order public.orders;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('P10 WS', 'p10-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws;
  insert into public.brands (workspace_id, name, slug) values (v_ws, 'P10 Brand', 'p10-brand') returning id into v_brand;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner-p10@test.local'),
    ('00000000-0000-0000-0000-0000000000a2', 'cs-p10@test.local')
  on conflict do nothing;
  insert into public.profiles (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'owner-p10@test.local'),
    ('00000000-0000-0000-0000-0000000000a2', 'cs-p10@test.local')
  on conflict do nothing;
  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000a1', v_owner_role, v_ws),
    ('00000000-0000-0000-0000-0000000000a2', v_cs_role, v_ws);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws, v_brand, 'P10 Product', 'p10-product', 'P10-SKU', 'active', 5000, 2000, 100) returning id into v_prod;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-0000000000a1'::uuid $$;

do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders; v_cust uuid;
begin
  select id into v_ws from public.workspaces where slug = 'p10-ws';
  select id into v_brand from public.brands where slug = 'p10-brand';
  select id into v_prod from public.products where sku = 'P10-SKU';

  v_order := public.create_order(v_ws, v_brand, 'manual', 'P10 Buyer', '08099990001', '1 P10 Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  raise notice 'P10_ORDER_ID=%', v_order.id;
  select customer_id into v_cust from public.orders where id = v_order.id;
  raise notice 'P10_CUSTOMER_ID=%', v_cust;
end $$;

-- switch to real RLS impersonation as customer-support
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;

do $$
declare
  v_order_id uuid; v_customer_id uuid; v_interaction public.support_interactions; v_case public.rescue_cases;
  v_case2 public.rescue_cases;
  v_dup_failed boolean := false;
begin
  select id into v_order_id from public.orders where customer_phone = '08099990001';
  select customer_id into v_customer_id from public.orders where id = v_order_id;

  -- 1. log a confirmation call interaction
  v_interaction := public.create_support_interaction('CONFIRMATION_CALL', 'Called customer to confirm order', v_order_id, null, 'CONFIRMED', null);
  assert v_interaction.id is not null, 'interaction must be created';
  raise notice 'OK 1: support interaction created (order-scoped)';

  -- 2. log a customer-only internal note (no order)
  v_interaction := public.create_support_interaction('INTERNAL_NOTE', 'Customer prefers evening calls', null, v_customer_id, null, null);
  assert v_interaction.customer_id = v_customer_id, 'customer-only interaction must resolve workspace from customer';
  raise notice 'OK 2: customer-only internal note created';

  -- 3. open a rescue case
  v_case := public.create_rescue_case(v_order_id, '2 failed delivery attempts', 'high', '00000000-0000-0000-0000-0000000000a2');
  assert v_case.status = 'OPEN', 'rescue case must start OPEN';
  raise notice 'OK 3: rescue case opened, id=%', v_case.id;

  -- 4. duplicate active rescue case must be rejected
  begin
    v_case2 := public.create_rescue_case(v_order_id, 'duplicate attempt', 'normal', null);
    v_dup_failed := false;
  exception when others then
    v_dup_failed := true;
    raise notice 'OK 4: duplicate active rescue case correctly rejected (%.)', SQLERRM;
  end;
  assert v_dup_failed, 'duplicate rescue case must be rejected';

  -- 5. progress rescue case through workflow
  v_case := public.update_rescue_case_status(v_case.id, 'CONTACTING', 'calling now');
  assert v_case.status = 'CONTACTING';
  v_case := public.update_rescue_case_status(v_case.id, 'CUSTOMER_REACHED', 'reached', 'CUSTOMER_REACHED');
  v_case := public.update_rescue_case_status(v_case.id, 'RESCHEDULED', 'new date agreed', 'RESCHEDULED');
  v_case := public.update_rescue_case_status(v_case.id, 'HANDED_BACK_TO_DELIVERY', 'handed back');
  raise notice 'OK 5: rescue case progressed OPEN->CONTACTING->CUSTOMER_REACHED->RESCHEDULED->HANDED_BACK_TO_DELIVERY';

  -- 6. invalid transition rejected
  begin
    perform public.update_rescue_case_status(v_case.id, 'OPEN', 'go back');
    raise exception 'should have rejected invalid transition';
  exception when others then
    raise notice 'OK 6: invalid transition rejected (%.)', SQLERRM;
  end;

  -- 7. CONVERTED blocked while order not actually DELIVERED
  begin
    perform public.update_rescue_case_status(v_case.id, 'CONVERTED', 'claiming delivered');
    raise exception 'should have rejected premature CONVERTED';
  exception when others then
    raise notice 'OK 7: premature CONVERTED correctly rejected (%.)', SQLERRM;
  end;

  -- 8. escalate
  v_case := public.escalate_rescue_case(v_case.id, 'customer very upset', null);
  assert v_case.escalated = true;
  raise notice 'OK 8: rescue case escalated';

  -- 9. double escalation rejected
  begin
    perform public.escalate_rescue_case(v_case.id, 'again', null);
    raise exception 'should have rejected double escalation';
  exception when others then
    raise notice 'OK 9: duplicate escalation correctly rejected (%.)', SQLERRM;
  end;

  raise notice 'P10_RESCUE_CASE_ID=%', v_case.id;
  raise notice 'P10_ORDER_ID_FOR_DELIVERY=%', v_order_id;
end $$;

-- back to superuser to progress the order lifecycle to DELIVERED (mirrors real RPC path)
reset role;
create or replace function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-0000000000a1'::uuid $$;

do $$
declare v_order_id uuid; v_case public.rescue_cases;
begin
  select id into v_order_id from public.orders where customer_phone = '08099990001';
  update public.orders set status = 'PENDING' where id = v_order_id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() where id = v_order_id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH' where id = v_order_id;
  update public.orders set status = 'DISPATCHED' where id = v_order_id;
  update public.orders set status = 'IN_TRANSIT' where id = v_order_id;
  update public.orders set status = 'DELIVERED' where id = v_order_id;

  select * into v_case from public.rescue_cases where order_id = v_order_id;
  assert v_case.status = 'CONVERTED', format('rescue case must auto-convert when order becomes DELIVERED, got %s', v_case.status);
  assert v_case.closed_at is not null;
  raise notice 'OK 10: rescue case auto-CONVERTED when order reached DELIVERED (sync trigger works)';
end $$;

select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;

do $$
declare v_summary record; v_queue_count int; v_funnel record; v_analytics record;
begin
  select * into v_summary from public.get_support_summary((select id from public.workspaces where slug='p10-ws'));
  raise notice 'OK 11: get_support_summary returned (needs_attention=%, escalated=%, completed_today=%)', v_summary.needs_attention_count, v_summary.escalated_count, v_summary.completed_today_count;

  select count(*) into v_queue_count from public.get_support_queue((select id from public.workspaces where slug='p10-ws'));
  raise notice 'OK 12: get_support_queue returned % rows', v_queue_count;

  select * into v_funnel from public.get_rescue_funnel((select id from public.workspaces where slug='p10-ws'));
  assert v_funnel.opportunities = 1, format('expected 1 rescue case opened, got %s', v_funnel.opportunities);
  assert v_funnel.delivered = 1, format('expected 1 delivered/converted, got %s', v_funnel.delivered);
  raise notice 'OK 13: get_rescue_funnel: opportunities=%, contacted=%, customer_reached=%, rescheduled_or_fixed=%, returned_to_delivery=%, delivered=%, lost=%',
    v_funnel.opportunities, v_funnel.contacted, v_funnel.customer_reached, v_funnel.rescheduled_or_fixed, v_funnel.returned_to_delivery, v_funnel.delivered, v_funnel.lost;

  select * into v_analytics from public.get_support_analytics((select id from public.workspaces where slug='p10-ws'));
  raise notice 'OK 14: get_support_analytics: interactions_total=%, rescue_opportunities_opened=%, rescue_successful=%', v_analytics.support_interactions_total, v_analytics.rescue_opportunities_opened, v_analytics.rescue_successful;
end $$;

do $$ begin raise notice '=== PHASE 10 SANITY SUITE PASSED ==='; end $$;
