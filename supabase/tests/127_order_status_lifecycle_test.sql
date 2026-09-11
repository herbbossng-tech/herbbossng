-- ============================================================
-- Order Status Lifecycle Remediation (0043) — dedicated regression/
-- security suite. Covers: all 14 canonical statuses exist and are
-- readable/filterable; the primary flow and the CS follow-up
-- exception sub-graph both work end to end; role-appropriate
-- transition enforcement (Customer Support has orders.approve,
-- Warehouse Staff does not — both per the PRE-EXISTING RBAC seed,
-- unchanged by this migration); anonymous/cross-workspace/suspended-
-- staff denial; invalid transitions still rejected; REPEATED_ORDER's
-- revenue-correctness fix (an order that moves DELIVERED ->
-- REPEATED_ORDER must not vanish from delivered_revenue, and must not
-- double-count in pending_revenue or workforce active-order capacity);
-- the new DISPATCHED -> SCHEDULED -> IN_TRANSIT path and its
-- record_delivery_attempt() companion fix; audit-trail correctness.
--
-- Run against a freshly migrated 0001-0043 database with
-- 00_bootstrap_post_migration.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws uuid; v_ws2 uuid; v_brand uuid; v_brand2 uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_cs uuid := '00000000-0000-0000-0000-0000000000a2';
  v_warehouse uuid := '00000000-0000-0000-0000-0000000000a3';
  v_suspended uuid := '00000000-0000-0000-0000-0000000000a4';
  v_outsider uuid := '00000000-0000-0000-0000-0000000000a5';
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner-osl@test.local'),
    (v_cs, 'cs-osl@test.local'),
    (v_warehouse, 'warehouse-osl@test.local'),
    (v_suspended, 'suspended-osl@test.local'),
    (v_outsider, 'outsider-osl@test.local');

  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('OSL WS', 'osl-ws', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by)
    values (v_ws, 'OSL Brand', 'osl-brand', v_owner) returning id into v_brand;

  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('OSL WS2', 'osl-ws2', 'KE', 'KES', v_outsider) returning id into v_ws2;
  insert into public.brands (workspace_id, name, slug, created_by)
    values (v_ws2, 'OSL Brand2', 'osl-brand2', v_outsider) returning id into v_brand2;

  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_owner, id, v_ws, v_owner from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_cs, id, v_ws, v_owner from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_warehouse, id, v_ws, v_owner from public.roles where slug = 'warehouse-staff' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_suspended, id, v_ws, v_owner from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select v_outsider, id, v_ws2, v_outsider from public.roles where slug = 'owner' and workspace_id is null;

  insert into public.profiles (id, email, status) values (v_owner, 'owner-osl@test.local', 'active')
    on conflict (id) do update set status = 'active';
  insert into public.profiles (id, email, status) values (v_cs, 'cs-osl@test.local', 'active')
    on conflict (id) do update set status = 'active';
  insert into public.profiles (id, email, status) values (v_warehouse, 'warehouse-osl@test.local', 'active')
    on conflict (id) do update set status = 'active';
  insert into public.profiles (id, email, status) values (v_suspended, 'suspended-osl@test.local', 'suspended')
    on conflict (id) do update set status = 'suspended';
  insert into public.profiles (id, email, status) values (v_outsider, 'outsider-osl@test.local', 'active')
    on conflict (id) do update set status = 'active';
end $$;

\echo '=== 1. All 14 canonical statuses are present, distinct, and correctly ordered ==='
do $$
declare v_ws uuid; v_brand uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  select count(*) into v_count from public.get_order_status_value_breakdown(v_ws, v_brand, null, null);
  reset role;
  assert v_count = 14, format('expected 14 canonical statuses, got %s', v_count);
  assert (
    select array_agg(status order by status) from public.get_order_status_value_breakdown(
      (select id from public.workspaces where slug = 'osl-ws'), (select id from public.brands where slug = 'osl-brand'), null, null)
  ) = array['CANCELLED','CONFIRMED','DELIVERED','DISPATCHED','IN_TRANSIT','NEEDS_FOLLOW_UP','NEW','PARTIALLY_DELIVERED','PENDING','PROCESSING_FOR_DISPATCH','REPEATED_ORDER','RETURNED','SCHEDULED','WILL_CALL_BACK']::text[],
    'the 3 new statuses (CONFIRMED, NEEDS_FOLLOW_UP, REPEATED_ORDER) must appear alongside all 11 pre-existing ones';
  raise notice 'OK 1: all 14 canonical statuses present and correctly named.';
end $$;

\echo '=== 2. Anonymous cannot mutate order status at all ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0001', 'NEW', 'Jane Doe', '08010000001', '1 Test Rd', 'NGN', 5000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  set role anon;
  begin
    update public.orders set status = 'PENDING' where id = v_order_id;
  exception when others then v_failed := true;
  end;
  reset role;
  -- Even if RLS silently filters (0 rows updated) rather than raising,
  -- the status must be unchanged either way.
  perform 1 from public.orders where id = v_order_id and status = 'NEW';
  if not found then v_failed := false; end if;
  assert v_failed, 'anonymous must never be able to mutate an order status (raised, or silently filtered to zero rows)';
  raise notice 'OK 2: anonymous denied — order status unchanged.';
end $$;

\echo '=== 3. Full primary flow (New -> Pending -> Confirmed -> Processing -> Dispatched -> Scheduled -> In Transit -> Delivered) as Customer Support ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0002', 'NEW', 'Primary Flow', '08010000002', '1 Test Rd', 'NGN', 8000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'PENDING', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'CONFIRMED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'DISPATCHED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() + interval '1 day', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'IN_TRANSIT', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  -- SCHEDULED -> DELIVERED requires orders.approve; Customer Support has it per the pre-existing RBAC seed.
  update public.orders set status = 'DELIVERED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  reset role;

  perform 1 from public.orders where id = v_order_id and status = 'DELIVERED' and cash_collection_status = 'collected' and confirmed_at is not null;
  if not found then raise exception 'primary flow did not complete correctly'; end if;
  raise notice 'OK 3: primary flow (New..Delivered via the new Confirmed/Scheduled-post-dispatch states) completed correctly.';
end $$;

\echo '=== 4. Warehouse Staff (no orders.approve) can perform non-approval transitions but is rejected on an approval-gated one ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0003', 'PROCESSING_FOR_DISPATCH', 'Warehouse Flow', '08010000003', '1 Test Rd', 'NGN', 3000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a3', false);
  set role authenticated;
  update public.orders set status = 'DISPATCHED', updated_by = '00000000-0000-0000-0000-0000000000a3' where id = v_order_id;
  update public.orders set status = 'IN_TRANSIT', updated_by = '00000000-0000-0000-0000-0000000000a3' where id = v_order_id;
  begin
    -- IN_TRANSIT -> DELIVERED requires orders.approve; Warehouse Staff does not hold it.
    update public.orders set status = 'DELIVERED', updated_by = '00000000-0000-0000-0000-0000000000a3' where id = v_order_id;
  exception when others then v_failed := true;
  end;
  reset role;

  assert v_failed, 'Warehouse Staff must be rejected on an approval-gated transition (IN_TRANSIT -> DELIVERED)';
  perform 1 from public.orders where id = v_order_id and status = 'IN_TRANSIT';
  if not found then raise exception 'order must remain at IN_TRANSIT after the rejected attempt'; end if;
  raise notice 'OK 4: Warehouse Staff correctly advances non-approval statuses and is rejected on an approval-gated one — this is existing RBAC (0008), unchanged by 0043.';
end $$;

\echo '=== 5. Suspended staff denied ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0004', 'NEW', 'Suspended Test', '08010000004', '1 Test Rd', 'NGN', 4000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  -- Authenticated holds table-level UPDATE grant, so an RLS `using`
  -- clause matching zero rows does NOT raise — it silently updates
  -- zero rows. Denial must therefore be checked by asserting the row
  -- is unchanged, not by expecting an exception.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a4', false);
  set role authenticated;
  update public.orders set status = 'PENDING' where id = v_order_id;
  reset role;
  perform 1 from public.orders where id = v_order_id and status = 'NEW';
  v_failed := found;
  assert v_failed, 'a suspended staff member must remain blocked by the existing database-level authorization boundary (user_workspace_ids()/user_has_permission(), hardened in 0027)';
  raise notice 'OK 5: suspended staff denied — order status unchanged (RLS-filtered to zero rows).';
end $$;

\echo '=== 6. Cross-workspace mutation denied for the new statuses too ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0005', 'PENDING', 'Cross WS Test', '08010000005', '1 Test Rd', 'NGN', 4500, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a5', false);
  set role authenticated;
  update public.orders set status = 'CONFIRMED' where id = v_order_id;
  reset role;
  perform 1 from public.orders where id = v_order_id and status = 'PENDING';
  v_failed := found;
  assert v_failed, 'an outsider (member of a different workspace) must never be able to mutate this order into CONFIRMED';
  raise notice 'OK 6: cross-workspace mutation into a new status denied (RLS-filtered to zero rows) — existing workspace-scoping holds for the new statuses too.';
end $$;

\echo '=== 7. Invalid transitions are still rejected (skipping the chain, and from a terminal status) ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0006', 'NEW', 'Invalid Transition', '08010000006', '1 Test Rd', 'NGN', 2000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  begin
    update public.orders set status = 'DELIVERED', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  exception when others then v_failed := true;
  end;
  assert v_failed, 'NEW -> DELIVERED must remain an illegal transition (no shortcut past the chain)';

  update public.orders set status = 'PENDING', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  update public.orders set status = 'CONFIRMED', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  update public.orders set status = 'DISPATCHED', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  update public.orders set status = 'IN_TRANSIT', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  update public.orders set status = 'DELIVERED', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  update public.orders set status = 'REPEATED_ORDER', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;

  v_failed := false;
  begin
    update public.orders set status = 'PENDING', updated_by = '00000000-0000-0000-0000-0000000000a1' where id = v_order_id;
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'REPEATED_ORDER must be a dead end — no further legal transition exists';
  raise notice 'OK 7: invalid transitions (skipping the chain, and out of REPEATED_ORDER) both correctly rejected.';
end $$;

\echo '=== 8. Customer-contact follow-up exception sub-graph: Pending -> Needs Follow-up -> Will call back -> Confirmed ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0007', 'PENDING', 'Follow Up Flow', '08010000007', '1 Test Rd', 'NGN', 6000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'NEEDS_FOLLOW_UP', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'WILL_CALL_BACK', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'CONFIRMED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  reset role;

  perform 1 from public.orders where id = v_order_id and status = 'CONFIRMED';
  if not found then raise exception 'follow-up exception sub-graph did not complete'; end if;
  raise notice 'OK 8: Pending -> Needs Follow-up -> Will call back -> Confirmed exception path works end to end.';
end $$;

\echo '=== 9. record_delivery_attempt() honors the new post-dispatch SCHEDULED state, and rejects a REPEATED_ORDER (terminal) order ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_order_id2 uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0008', 'DISPATCHED', 'Scheduled Attempt', '08010000008', '1 Test Rd', 'NGN', 7000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'SCHEDULED', scheduled_at = now() + interval '2 hours', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  perform public.record_delivery_attempt(v_order_id, 'DELIVERED');
  reset role;

  perform 1 from public.orders where id = v_order_id and status = 'DELIVERED';
  if not found then raise exception 'record_delivery_attempt(DELIVERED) from SCHEDULED must transition the order to DELIVERED'; end if;

  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0009', 'DELIVERED', 'Repeated Order Terminal', '08010000009', '1 Test Rd', 'NGN', 1500, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id2;
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'REPEATED_ORDER', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id2;
  begin
    perform public.record_delivery_attempt(v_order_id2, 'CUSTOMER_UNAVAILABLE');
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'record_delivery_attempt() must reject an order already in the terminal REPEATED_ORDER state';
  raise notice 'OK 9: record_delivery_attempt() correctly handles the new post-dispatch SCHEDULED state and the new REPEATED_ORDER terminal state.';
end $$;

\echo '=== 10. Revenue correctness: an order that moves DELIVERED -> REPEATED_ORDER is NOT lost from delivered_revenue, and NOT double-counted as pending ==='
do $$
declare
  v_ws uuid; v_brand uuid; v_order_id uuid;
  v_before record; v_after record;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0010', 'DISPATCHED', 'Revenue Correctness', '08010000010', '1 Test Rd', 'NGN', 12345, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'IN_TRANSIT', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'DELIVERED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  reset role;

  -- get_order_stats()'s monetary fields are zeroed unless the caller
  -- holds finance visibility (user_has_finance_visibility) — Customer
  -- Support does not; read as the Owner (holds every permission) so
  -- this assertion is about the revenue fix, not the visibility gate.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  select * into v_before from public.get_order_stats(v_ws, v_brand);
  reset role;
  assert v_before.delivered_revenue >= 12345, format('delivered_revenue must include the newly-delivered order, got %s', v_before.delivered_revenue);

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'REPEATED_ORDER', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  select * into v_after from public.get_order_stats(v_ws, v_brand);
  reset role;

  assert v_after.delivered_revenue = v_before.delivered_revenue,
    format('delivered_revenue must NOT change when a DELIVERED order later moves to REPEATED_ORDER (cash_collection_status is the durable signal): before=%s after=%s', v_before.delivered_revenue, v_after.delivered_revenue);
  assert v_after.repeated_order_count >= 1, 'repeated_order_count must reflect the order now sitting at REPEATED_ORDER';
  raise notice 'OK 10: delivered_revenue correctly survives DELIVERED -> REPEATED_ORDER (before=%s after=%s); repeated_order_count=%s.', v_before.delivered_revenue, v_after.delivered_revenue, v_after.repeated_order_count;
end $$;

\echo '=== 11. get_finance_summary(): pending_revenue excludes REPEATED_ORDER (no double count against an already-resolved order) ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_summary record; v_pending_before numeric;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';

  select pending_revenue into v_pending_before from public.get_finance_summary(v_ws, v_brand, null, null);

  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, cancellation_reason, created_by)
    values (v_ws, v_brand, 'OSL-0012', 'PENDING', 'Pending Then Cancelled Repeat', '08010000012', '1 Test Rd', 'NGN', 4321, null, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'CONFIRMED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'PROCESSING_FOR_DISPATCH', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'DISPATCHED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'IN_TRANSIT', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'DELIVERED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  update public.orders set status = 'REPEATED_ORDER', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  reset role;

  -- Read as the Owner (holds finance visibility) — Customer Support does not.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  select * into v_summary from public.get_finance_summary(v_ws, v_brand, null, null);
  reset role;

  assert v_summary.pending_revenue = v_pending_before,
    format('pending_revenue must be unchanged by an order that resolved to REPEATED_ORDER (never counted as still-pending): before=%s after=%s', v_pending_before, v_summary.pending_revenue);
  raise notice 'OK 11: get_finance_summary() pending_revenue correctly excludes REPEATED_ORDER.';
end $$;

\echo '=== 12. Workforce: a REPEATED_ORDER order does not count toward a staff member''s active-order capacity ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_active_before bigint; v_active_after bigint;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';

  -- get_workspace_staff() is gated on staff.view/staff.manage, which
  -- Customer Support (a2) does NOT hold — read it as the Owner (a1, who
  -- holds every permission) both before and after, rather than relying
  -- on whatever role/GUC state happened to be left over from the
  -- previous scenario (the same class of test-fixture bug fixed in
  -- scenarios 10 and 11: the product code is correct, the test's own
  -- caller context was wrong).
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  select active_order_count into v_active_before from public.get_workspace_staff(v_ws) where user_id = '00000000-0000-0000-0000-0000000000a2';
  reset role;

  insert into public.orders (workspace_id, brand_id, order_number, status, assigned_to, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0013', 'DELIVERED', '00000000-0000-0000-0000-0000000000a2', 'Workforce Capacity Check', '08010000013', '1 Test Rd', 'NGN', 1000, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'REPEATED_ORDER', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  select active_order_count into v_active_after from public.get_workspace_staff(v_ws) where user_id = '00000000-0000-0000-0000-0000000000a2';
  reset role;
  assert v_active_after = v_active_before,
    format('a REPEATED_ORDER order must never count toward active_order_count (it is a resolved, terminal status): before=%s after=%s', v_active_before, v_active_after);
  raise notice 'OK 12: REPEATED_ORDER correctly excluded from workforce active-order capacity.';
end $$;

\echo '=== 13. Audit trail: order_events records the transition, resolvable to the acting staff member''s name ==='
do $$
declare v_ws uuid; v_brand uuid; v_order_id uuid; v_event record; v_actor_email text;
begin
  select id into v_ws from public.workspaces where slug = 'osl-ws';
  select id into v_brand from public.brands where slug = 'osl-brand';
  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values (v_ws, v_brand, 'OSL-0014', 'PENDING', 'Audit Trail Check', '08010000014', '1 Test Rd', 'NGN', 2500, '00000000-0000-0000-0000-0000000000a1')
    returning id into v_order_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a2', false);
  set role authenticated;
  update public.orders set status = 'CONFIRMED', updated_by = '00000000-0000-0000-0000-0000000000a2' where id = v_order_id;
  reset role;

  select * into v_event from public.order_events
    where order_id = v_order_id and event_type = 'STATUS_CHANGED' and from_status = 'PENDING' and to_status = 'CONFIRMED';
  if not found then raise exception 'expected a STATUS_CHANGED audit row for PENDING -> CONFIRMED'; end if;
  assert v_event.description = 'Status changed from PENDING to CONFIRMED', format('unexpected audit description: %s', v_event.description);
  assert v_event.created_by = '00000000-0000-0000-0000-0000000000a2', 'audit row must record the actual acting staff member';

  select email into v_actor_email from public.profiles where id = v_event.created_by;
  assert v_actor_email = 'cs-osl@test.local', 'the acting staff member must be resolvable to a real profile (the frontend timeline join target)';
  raise notice 'OK 13: audit trail correctly records "% changed order from % to %" resolvable to a real staff profile (%).', v_actor_email, v_event.from_status, v_event.to_status, v_actor_email;
end $$;

\echo '=== 14. Dashboard status counts (get_order_stats) correctly reflect confirmed_count/needs_follow_up_count for a zero-data-adjacent workspace ==='
do $$
declare v_ws3 uuid; v_brand3 uuid; v_stats record;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('OSL WS3', 'osl-ws3', 'GH', 'GHS', '00000000-0000-0000-0000-0000000000a1') returning id into v_ws3;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws3, 'OSL Brand3', 'osl-brand3', '00000000-0000-0000-0000-0000000000a1') returning id into v_brand3;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
    select '00000000-0000-0000-0000-0000000000a1', id, v_ws3, '00000000-0000-0000-0000-0000000000a1' from public.roles where slug = 'owner' and workspace_id is null;

  insert into public.orders (workspace_id, brand_id, order_number, status, customer_name, customer_phone, customer_address, currency_code, total_amount, created_by)
    values
      (v_ws3, v_brand3, 'OSL3-0001', 'CONFIRMED', 'A', '08020000001', '1 Rd', 'GHS', 1000, '00000000-0000-0000-0000-0000000000a1'),
      (v_ws3, v_brand3, 'OSL3-0002', 'CONFIRMED', 'B', '08020000002', '1 Rd', 'GHS', 1000, '00000000-0000-0000-0000-0000000000a1'),
      (v_ws3, v_brand3, 'OSL3-0003', 'NEEDS_FOLLOW_UP', 'C', '08020000003', '1 Rd', 'GHS', 1000, '00000000-0000-0000-0000-0000000000a1');

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000a1', false);
  set role authenticated;
  select * into v_stats from public.get_order_stats(v_ws3, v_brand3);
  reset role;

  assert v_stats.confirmed_count = 2, format('expected confirmed_count=2, got %s', v_stats.confirmed_count);
  assert v_stats.needs_follow_up_count = 1, format('expected needs_follow_up_count=1, got %s', v_stats.needs_follow_up_count);
  assert v_stats.repeated_order_count = 0, format('expected repeated_order_count=0, got %s', v_stats.repeated_order_count);
  raise notice 'OK 14: get_order_stats() correctly reports confirmed_count/needs_follow_up_count/repeated_order_count.';
end $$;

\echo '=== ALL ORDER STATUS LIFECYCLE TESTS PASSED ==='
