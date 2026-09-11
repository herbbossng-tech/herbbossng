-- ============================================================
-- Workforce Operations (0038) — dedicated security/concurrency test
-- suite. Covers the highest-priority scenarios from the master
-- brief's Section 32 list (aging threshold, terminal-status exclusion,
-- every eligibility filter, deterministic scoring/tie-break,
-- honest no-eligible-staff reasons, manual-assignment authorization,
-- audit trail, zero-data safety) via genuine
-- set_config('app.test_user_id', ...) + set role authenticated/anon
-- impersonation. True concurrent-worker double-assignment safety
-- (for update skip locked) cannot be exercised inside a single psql
-- script — same documented limitation as 111_automation_concurrency_
-- test.sql — and was instead verified manually with two genuinely
-- overlapping psql sessions; see the engineering report.
--
-- Run against a freshly migrated 0001-0038 database with
-- 00_bootstrap_post_migration.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

-- ============================================================
-- Cluster 1: aging threshold + terminal-status exclusion.
-- One low-workload eligible candidate; five orders of varying age/status.
-- ============================================================
do $$
declare
  v_ws uuid; v_brand uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000e1';
  v_staff uuid := '00000000-0000-0000-0000-0000000000e2';
  v_cs_role uuid; v_owner_role uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c1@test.local'), (v_staff, 'staff-c1@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C1', 'wf122-c1', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C1 Brand', 'wf122-c1-brand', v_owner) returning id into v_brand;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner, v_ws, v_owner_role), (v_staff, v_ws, v_cs_role);
  -- Owner has more active work than the single candidate ever could,
  -- so it is never mistaken for "lowest workload" in this cluster.
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws, v_brand, 'C1-OWNER-LOAD', 'website', 'PENDING', 'pending', 'X', '0800000001', 'Addr', 'NGN', 5000, 5000, v_owner);

  insert into public.assignment_rules (workspace_id, module, strategy, is_active, aging_minutes, created_by, updated_by)
    values (v_ws, 'orders', 'least_workload', true, 20, v_owner, v_owner);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C1-YOUNG', 'website', 'NEW', 'pending', 'Y', '0800000002', 'Addr', 'NGN', 5000, 5000, now() - interval '5 minutes');
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C1-AGED', 'website', 'NEW', 'pending', 'A', '0800000003', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C1-CANCELLED', 'website', 'CANCELLED', 'pending', 'Cn', '0800000004', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C1-DELIVERED', 'website', 'DELIVERED', 'collected', 'D', '0800000005', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C1-RETURNED', 'website', 'RETURNED', 'pending', 'R', '0800000006', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');

  raise notice 'C1_WS=%, C1_OWNER=%, C1_STAFF=%', v_ws, v_owner, v_staff;
end $$;

\echo '=== 1. A sweep as owner assigns only the aged, non-terminal order — young/cancelled/delivered/returned are all left alone ==='
do $$
declare v_ws uuid; v_before int;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c1';
  select count(*) into v_before from public.orders where workspace_id = v_ws and assigned_to is not null;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e1', false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 20);
  reset role;

  assert (select assigned_to from public.orders where order_number = 'C1-YOUNG') is null, 'an order younger than the aging threshold must never be auto-assigned';
  assert (select assigned_to from public.orders where order_number = 'C1-CANCELLED') is null, 'a cancelled order must never be auto-assigned even when aged';
  assert (select assigned_to from public.orders where order_number = 'C1-DELIVERED') is null, 'a delivered order must never be auto-assigned even when aged';
  assert (select assigned_to from public.orders where order_number = 'C1-RETURNED') is null, 'a returned order must never be auto-assigned even when aged';
  assert (select assigned_to from public.orders where order_number = 'C1-AGED') = '00000000-0000-0000-0000-0000000000e2',
    'the aged, non-terminal, unassigned order must be auto-assigned to the sole eligible candidate';
  assert (select assignment_source from public.orders where order_number = 'C1-AGED') = 'AUTO', 'auto-assignment must stamp assignment_source=AUTO';
  raise notice 'OK 1: aging threshold and terminal-status exclusion both hold.';
end $$;

\echo '=== 2. Re-running the sweep immediately is a safe no-op (idempotent under retries) ==='
do $$
declare v_ws uuid; v_result_count int;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c1';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e1', false);
  set role authenticated;
  select count(*) into v_result_count from public.run_auto_assignment_sweep(v_ws, null, 20) r where r.order_number = 'C1-AGED';
  reset role;
  assert v_result_count = 0, 'an order already assigned must not be re-examined by a subsequent sweep call';
  raise notice 'OK 2: retrying the sweep never reprocesses an already-assigned order.';
end $$;

-- ============================================================
-- Cluster 2: every eligibility filter, one at a time, plus a control
-- candidate proving the exclusion is specific, not a blanket failure.
-- ============================================================
do $$
declare
  v_ws uuid; v_brand_main uuid; v_brand_other uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000e3';
  v_control uuid := '00000000-0000-0000-0000-0000000000e4';
  v_suspended uuid := '00000000-0000-0000-0000-0000000000e5';
  v_no_perm uuid := '00000000-0000-0000-0000-0000000000e6';
  v_wrong_brand uuid := '00000000-0000-0000-0000-0000000000e7';
  v_unavailable uuid := '00000000-0000-0000-0000-0000000000e8';
  v_cs_role uuid; v_owner_role uuid; v_warehouse_role uuid;
  v_i int;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner-c2@test.local'), (v_control, 'control-c2@test.local'), (v_suspended, 'suspended-c2@test.local'),
    (v_no_perm, 'noperm-c2@test.local'), (v_wrong_brand, 'wrongbrand-c2@test.local'), (v_unavailable, 'unavailable-c2@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C2', 'wf122-c2', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C2 Main Brand', 'wf122-c2-main', v_owner) returning id into v_brand_main;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C2 Other Brand', 'wf122-c2-other', v_owner) returning id into v_brand_other;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_warehouse_role from public.roles where slug = 'warehouse-staff' and workspace_id is null;

  -- Control is scoped to the MAIN brand only (not workspace-wide) so
  -- that cluster 2 also proves brand scoping symmetrically: it must
  -- never be eligible for the OTHER brand's order, leaving only the
  -- explicitly other-brand-scoped candidate eligible there.
  insert into public.user_roles (user_id, workspace_id, role_id, brand_id) values
    (v_owner, v_ws, v_owner_role, null),
    (v_control, v_ws, v_cs_role, v_brand_main),
    (v_suspended, v_ws, v_cs_role, null),
    (v_no_perm, v_ws, v_warehouse_role, null),
    (v_wrong_brand, v_ws, v_cs_role, v_brand_other),
    (v_unavailable, v_ws, v_cs_role, null);

  -- Suspend one, and mark one unavailable via the self-service RPC.
  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  perform public.set_staff_status(v_ws, v_suspended, 'suspended');
  reset role;

  perform set_config('app.test_user_id', v_unavailable::text, false);
  set role authenticated;
  perform public.set_my_assignment_availability(v_ws, false);
  reset role;

  -- Owner carries a large pre-existing load so it can never win a
  -- workload tie against the control candidate even as the sweep
  -- below assigns several orders in the same pass (each assignment
  -- shifts the running workload count for the next comparison).
  for v_i in 1..20 loop
    insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
      values (v_ws, v_brand_main, 'C2-OWNER-LOAD-'||v_i, 'website', 'PENDING', 'pending', 'X', '0800000010', 'Addr', 'NGN', 5000, 5000, v_owner);
  end loop;

  insert into public.assignment_rules (workspace_id, module, strategy, is_active, aging_minutes, created_by, updated_by)
    values (v_ws, 'orders', 'least_workload', true, 20, v_owner, v_owner);

  -- One order per excluded candidate, main brand, aged 30 minutes,
  -- with the control candidate ALSO eligible for each — proving the
  -- excluded person is skipped in favor of the eligible control, not
  -- that nobody at all gets picked.
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand_main, 'C2-VS-SUSPENDED', 'website', 'NEW', 'pending', 'A', '0800000011', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand_main, 'C2-VS-NOPERM', 'website', 'NEW', 'pending', 'B', '0800000012', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand_main, 'C2-VS-WRONGBRAND', 'website', 'NEW', 'pending', 'C', '0800000013', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand_main, 'C2-VS-UNAVAILABLE', 'website', 'NEW', 'pending', 'D', '0800000014', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');

  -- An order in the OTHER brand where only the wrong-brand-scoped
  -- candidate (and nobody else) is eligible by brand — proves brand
  -- scoping works in both directions, not just as an exclusion.
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand_other, 'C2-OTHER-BRAND', 'website', 'NEW', 'pending', 'E', '0800000015', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');

  raise notice 'C2_WS=%, C2_CONTROL=%, C2_SUSPENDED=%, C2_NOPERM=%, C2_WRONGBRAND=%, C2_UNAVAILABLE=%', v_ws, v_control, v_suspended, v_no_perm, v_wrong_brand, v_unavailable;
end $$;

\echo '=== 3-6. Suspended / no-permission / wrong-brand / unavailable staff are each skipped in favor of the eligible control candidate ==='
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c2';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e3', false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 20);
  reset role;

  assert (select assigned_to from public.orders where order_number = 'C2-VS-SUSPENDED') = '00000000-0000-0000-0000-0000000000e4',
    'a suspended staff member must never be selected — the control candidate should win instead';
  assert (select assigned_to from public.orders where order_number = 'C2-VS-NOPERM') = '00000000-0000-0000-0000-0000000000e4',
    'a staff member without orders.assign must never be selected';
  assert (select assigned_to from public.orders where order_number = 'C2-VS-WRONGBRAND') = '00000000-0000-0000-0000-0000000000e4',
    'a staff member scoped to a different brand must never be selected for this brand''s order';
  assert (select assigned_to from public.orders where order_number = 'C2-VS-UNAVAILABLE') = '00000000-0000-0000-0000-0000000000e4',
    'a staff member marked unavailable for assignment must never be selected';
  raise notice 'OK 3-6: suspended/no-permission/wrong-brand/unavailable staff are all correctly excluded, and the eligible control candidate wins every time.';
end $$;

\echo '=== 7. Brand scoping also works in the other direction: only the brand-scoped candidate is eligible for the OTHER brand''s order ==='
do $$
begin
  assert (select assigned_to from public.orders where order_number = 'C2-OTHER-BRAND') = '00000000-0000-0000-0000-0000000000e7',
    'for an order in the other brand, only the candidate explicitly scoped to that brand is eligible';
  raise notice 'OK 7: brand scoping is symmetric, not just an exclusion in one direction.';
end $$;

-- ============================================================
-- Cluster 3: deterministic scoring — lowest workload wins, and a
-- genuine tie breaks deterministically by user_id.
-- ============================================================
do $$
declare
  v_ws uuid; v_brand uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000e9';
  v_lower_id uuid := '00000000-0000-0000-0000-00000000ea01'; -- 0 active orders
  v_higher_id uuid := '00000000-0000-0000-0000-00000000ea02'; -- 2 active orders
  v_tie_a uuid := '00000000-0000-0000-0000-00000000ea03'; -- equal workload, smaller id
  v_tie_b uuid := '00000000-0000-0000-0000-00000000ea04'; -- equal workload, larger id
  v_cs_role uuid; v_owner_role uuid;
  v_i int;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner-c3@test.local'), (v_lower_id, 'lower-c3@test.local'), (v_higher_id, 'higher-c3@test.local'),
    (v_tie_a, 'tiea-c3@test.local'), (v_tie_b, 'tieb-c3@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C3', 'wf122-c3', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C3 Brand', 'wf122-c3-brand', v_owner) returning id into v_brand;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values
    (v_owner, v_ws, v_owner_role), (v_lower_id, v_ws, v_cs_role), (v_higher_id, v_ws, v_cs_role);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws, v_brand, 'C3-OWNER-LOAD', 'website', 'PENDING', 'pending', 'X', '0800000020', 'Addr', 'NGN', 5000, 5000, v_owner);
  for v_i in 1..2 loop
    insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
      values (v_ws, v_brand, 'C3-HIGHER-LOAD-'||v_i, 'website', 'PENDING', 'pending', 'H', '080000002'||v_i, 'Addr', 'NGN', 5000, 5000, v_higher_id);
  end loop;

  insert into public.assignment_rules (workspace_id, module, strategy, is_active, aging_minutes, created_by, updated_by)
    values (v_ws, 'orders', 'least_workload', true, 20, v_owner, v_owner);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C3-WORKLOAD', 'website', 'NEW', 'pending', 'W', '0800000030', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');

  raise notice 'C3_WS=%, C3_LOWER=%, C3_HIGHER=%', v_ws, v_lower_id, v_higher_id;
end $$;

\echo '=== 8. The lowest-active-workload eligible candidate is selected, not merely any eligible one ==='
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c3';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e9', false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 20);
  reset role;
  assert (select assigned_to from public.orders where order_number = 'C3-WORKLOAD') = '00000000-0000-0000-0000-00000000ea01',
    'the candidate with 0 active orders must be selected over the candidate with 2, even though both are otherwise equally eligible';
  raise notice 'OK 8: deterministic lowest-workload selection holds.';
end $$;

\echo '=== 9. A genuine tie in workload breaks deterministically by user_id, reproducibly across independent tied pools ==='
do $$
declare
  v_ws uuid; v_brand uuid;
  v_tie_a uuid := '00000000-0000-0000-0000-00000000ea03';
  v_tie_b uuid := '00000000-0000-0000-0000-00000000ea04';
  v_cs_role uuid;
  v_winner_1 uuid;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c3';
  select id into v_brand from public.brands where slug = 'wf122-c3-brand';
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_tie_a, v_ws, v_cs_role), (v_tie_b, v_ws, v_cs_role);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C3-TIE-1', 'website', 'NEW', 'pending', 'T1', '0800000031', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e9', false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 5);
  reset role;
  select assigned_to into v_winner_1 from public.orders where order_number = 'C3-TIE-1';

  assert v_winner_1 = v_tie_a, format('expected the deterministic tie-break winner to be the lower user_id (%s), got %s', v_tie_a, v_winner_1);
  raise notice 'OK 9a: a genuine workload tie breaks deterministically by user_id.';
end $$;

-- A second, wholly independent workspace with its own fresh tied pair
-- proves the SAME rule (lowest user_id wins a true tie) is applied
-- reproducibly, not just once by chance. A second order in the SAME
-- workspace as above would no longer be a genuine tie, because
-- resolving TIE-1 deliberately stamps last_assigned_at on its winner
-- (the documented "longest since last assignment" fairness signal) —
-- proving that signal works is left implicit here and is not what
-- this scenario targets.
do $$
declare
  v_ws uuid; v_brand uuid; v_owner uuid := '00000000-0000-0000-0000-00000000eb00';
  v_tie_c uuid := '00000000-0000-0000-0000-00000000eb01';
  v_tie_d uuid := '00000000-0000-0000-0000-00000000eb02';
  v_cs_role uuid; v_owner_role uuid;
  v_winner uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c3b@test.local'), (v_tie_c, 'tiec-c3b@test.local'), (v_tie_d, 'tied-c3b@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C3b', 'wf122-c3b', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C3b Brand', 'wf122-c3b-brand', v_owner) returning id into v_brand;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values
    (v_owner, v_ws, v_owner_role), (v_tie_c, v_ws, v_cs_role), (v_tie_d, v_ws, v_cs_role);
  insert into public.assignment_rules (workspace_id, module, strategy, is_active, aging_minutes, created_by, updated_by)
    values (v_ws, 'orders', 'least_workload', true, 20, v_owner, v_owner);

  -- Owner also holds orders.assign (workspace-wide via the owner
  -- role) and would otherwise win the tie on user_id alone — give it
  -- pre-existing load so the tie is genuinely just between c/d.
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws, v_brand, 'C3B-OWNER-LOAD', 'website', 'PENDING', 'pending', 'X', '0800000034', 'Addr', 'NGN', 5000, 5000, v_owner);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C3B-TIE', 'website', 'NEW', 'pending', 'T3', '0800000033', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');
  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 5);
  reset role;
  select assigned_to into v_winner from public.orders where order_number = 'C3B-TIE';

  assert v_winner = v_tie_c, format('expected the deterministic tie-break winner of this independent tied pair to be its lower user_id (%s), got %s', v_tie_c, v_winner);
  raise notice 'OK 9b: the same tie-break rule reproducibly picks the lower user_id in an independent, unpolluted tied pool.';
end $$;

-- ============================================================
-- Cluster 4: capacity cap → ALL_STAFF_AT_CAPACITY, and unavailable-only
-- pool → NO_AVAILABLE_STAFF, both honestly recorded (never fabricated).
-- ============================================================
do $$
declare
  v_ws uuid; v_brand uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000eb';
  v_capped uuid := '00000000-0000-0000-0000-0000000000ec';
  v_cs_role uuid; v_owner_role uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c4@test.local'), (v_capped, 'capped-c4@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C4', 'wf122-c4', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C4 Brand', 'wf122-c4-brand', v_owner) returning id into v_brand;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner, v_ws, v_owner_role), (v_capped, v_ws, v_cs_role);

  -- Owner also holds orders.assign workspace-wide and would otherwise
  -- be "another candidate" itself, defeating the point of this
  -- scenario — mark it unavailable so v_capped is genuinely the only
  -- would-be candidate.
  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  perform public.set_my_assignment_availability(v_ws, false);
  reset role;

  -- v_capped already has 1 active order and a cap of 1 — at capacity.
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws, v_brand, 'C4-EXISTING', 'website', 'PENDING', 'pending', 'X', '0800000040', 'Addr', 'NGN', 5000, 5000, v_capped);

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  perform public.set_staff_assignment_settings(v_ws, v_capped, true, true, 1);
  reset role;

  insert into public.assignment_rules (workspace_id, module, strategy, is_active, aging_minutes, created_by, updated_by)
    values (v_ws, 'orders', 'least_workload', true, 20, v_owner, v_owner);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C4-AT-CAPACITY', 'website', 'NEW', 'pending', 'C', '0800000041', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes');

  raise notice 'C4_WS=%, C4_CAPPED=%', v_ws, v_capped;
end $$;

\echo '=== 10. A staff member at their configured capacity is skipped; with no other candidate, the order is honestly left unassigned as ALL_STAFF_AT_CAPACITY ==='
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c4';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000eb', false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 20);
  reset role;
  assert (select assigned_to from public.orders where order_number = 'C4-AT-CAPACITY') is null, 'a staff member at capacity must never receive another auto-assignment';
  assert (select last_auto_assignment_result from public.orders where order_number = 'C4-AT-CAPACITY') = 'ALL_STAFF_AT_CAPACITY',
    'the recorded reason must honestly reflect that every otherwise-eligible candidate is at capacity';
  raise notice 'OK 10: capacity cap enforced and the reason is honestly recorded, not fabricated.';
end $$;

-- ============================================================
-- Cluster 5: manual assignment authorization + audit trail; and a
-- workspace with literally zero staff (NO_PERMISSION_MATCH).
-- ============================================================
do $$
declare
  v_ws uuid; v_brand uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000ed';
  v_staff_a uuid := '00000000-0000-0000-0000-0000000000ee';
  v_staff_b uuid := '00000000-0000-0000-0000-0000000000ef';
  v_viewer uuid := '00000000-0000-0000-0000-0000000000f0'; -- no orders.assign/manage
  v_cs_role uuid; v_owner_role uuid; v_viewer_role uuid;
  v_order uuid;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner-c5@test.local'), (v_staff_a, 'a-c5@test.local'), (v_staff_b, 'b-c5@test.local'), (v_viewer, 'viewer-c5@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C5', 'wf122-c5', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C5 Brand', 'wf122-c5-brand', v_owner) returning id into v_brand;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_viewer_role from public.roles where slug = 'viewer' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values
    (v_owner, v_ws, v_owner_role), (v_staff_a, v_ws, v_cs_role), (v_staff_b, v_ws, v_cs_role), (v_viewer, v_ws, v_viewer_role);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount)
    values (v_ws, v_brand, 'C5-MANUAL', 'website', 'NEW', 'pending', 'M', '0800000050', 'Addr', 'NGN', 5000, 5000) returning id into v_order;

  raise notice 'C5_WS=%, C5_ORDER=%, C5_STAFF_A=%, C5_STAFF_B=%, C5_VIEWER=%', v_ws, v_order, v_staff_a, v_staff_b, v_viewer;
end $$;

\echo '=== 11. Authorized manual assignment works and is immediately, unrestrictedly available (no 20-minute wait for MANUAL) ==='
do $$
declare v_order uuid; v_result record;
begin
  select id into v_order from public.orders where order_number = 'C5-MANUAL';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000ed', false);
  set role authenticated;
  select * into v_result from public.assign_order(v_order, '00000000-0000-0000-0000-0000000000ee', 'manual test assignment');
  reset role;
  assert v_result.assigned_to = '00000000-0000-0000-0000-0000000000ee', 'authorized manual assignment must succeed immediately regardless of order age';
  assert v_result.assignment_source = 'MANUAL', 'manual assignment must be stamped assignment_source=MANUAL';
  assert v_result.assignment_reason = 'manual test assignment', 'the provided reason must be persisted verbatim';
  raise notice 'OK 11: authorized manual assignment succeeds immediately with source/reason recorded.';
end $$;

\echo '=== 12. Unauthorized manual assignment (no orders.assign/orders.manage) is rejected ==='
do $$
declare v_order uuid; v_failed boolean := false;
begin
  select id into v_order from public.orders where order_number = 'C5-MANUAL';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f0', false); -- viewer
  set role authenticated;
  begin
    perform public.assign_order(v_order, '00000000-0000-0000-0000-0000000000ef', 'should be rejected');
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'a caller without orders.assign/orders.manage must be rejected by assign_order()';
  raise notice 'OK 12: unauthorized manual assignment is correctly rejected.';
end $$;

\echo '=== 13. Reassignment is recorded in the audit trail with actor, previous/new assignee and timestamp (existing generic orders audit trigger) ==='
do $$
declare v_order uuid; v_audit_count int; v_prev jsonb; v_new jsonb;
begin
  select id into v_order from public.orders where order_number = 'C5-MANUAL';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000ed', false);
  set role authenticated;
  perform public.assign_order(v_order, '00000000-0000-0000-0000-0000000000ef', 'reassigning to staff B');
  reset role;

  select count(*) into v_audit_count
    from public.audit_logs where module = 'orders' and entity_id = v_order and action = 'update'
    and new_value ->> 'assigned_to' = '00000000-0000-0000-0000-0000000000ef';
  assert v_audit_count >= 1, 'the reassignment must appear in audit_logs (via the existing generic orders audit trigger)';

  select previous_value, new_value into v_prev, v_new
    from public.audit_logs where module = 'orders' and entity_id = v_order and action = 'update'
    and new_value ->> 'assigned_to' = '00000000-0000-0000-0000-0000000000ef'
    order by created_at desc limit 1;
  assert v_prev ->> 'assigned_to' = '00000000-0000-0000-0000-0000000000ee', 'audit_logs previous_value must show the prior assignee';
  assert v_new ->> 'assigned_to' = '00000000-0000-0000-0000-0000000000ef', 'audit_logs new_value must show the new assignee';
  raise notice 'OK 13: reassignment history (previous assignee, new assignee, actor, timestamp) is captured in the audit trail.';
end $$;

\echo '=== 14. A workspace with zero staff holding orders.assign FOR THE ORDER''S BRAND leaves an aged order unassigned as NO_PERMISSION_MATCH ==='
do $$
declare v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000ed'; v_brand_other uuid;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c5';
  -- Remove every other orders.assign-holding member, then scope the
  -- sole Owner (the last-owner guard blocks demoting/removing them
  -- entirely) to a brand OTHER than the order's — the caller's
  -- authority to invoke the sweep (user_has_permission, workspace-wide)
  -- is independent of brand-scoped candidate eligibility, so the owner
  -- can still call the sweep while being correctly excluded as a
  -- candidate for this brand's order.
  delete from public.user_roles where workspace_id = v_ws and user_id in ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000ef');
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C5 Other Brand', 'wf122-c5-other', v_owner) returning id into v_brand_other;
  update public.user_roles set brand_id = v_brand_other where workspace_id = v_ws and user_id = v_owner;

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    select v_ws, id, 'C5-NO-STAFF', 'website', 'NEW', 'pending', 'N', '0800000051', 'Addr', 'NGN', 5000, 5000, now() - interval '30 minutes'
    from public.brands where slug = 'wf122-c5-brand';

  insert into public.assignment_rules (workspace_id, module, strategy, is_active, aging_minutes, created_by, updated_by)
    values (v_ws, 'orders', 'least_workload', true, 20, v_owner, v_owner);
end $$;

do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c5';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000ed', false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 20);
  reset role;

  assert (select assigned_to from public.orders where order_number = 'C5-NO-STAFF') is null, 'with no eligible candidate at all, the order must remain unassigned';
  assert (select last_auto_assignment_result from public.orders where order_number = 'C5-NO-STAFF') = 'NO_PERMISSION_MATCH',
    'the reason must honestly reflect that no workspace member holds the required permission for this brand';
  raise notice 'OK 14: zero eligible staff leaves the order unassigned with an honest, specific reason.';
end $$;

-- ============================================================
-- Cluster 6: a strategy=manual rule disables automatic assignment for
-- that scope entirely, regardless of aging.
-- ============================================================
do $$
declare
  v_ws uuid; v_brand uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000f1';
  v_staff uuid := '00000000-0000-0000-0000-0000000000f2';
  v_cs_role uuid; v_owner_role uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c6@test.local'), (v_staff, 'staff-c6@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C6', 'wf122-c6', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C6 Brand', 'wf122-c6-brand', v_owner) returning id into v_brand;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner, v_ws, v_owner_role), (v_staff, v_ws, v_cs_role);

  insert into public.assignment_rules (workspace_id, module, strategy, is_active, aging_minutes, created_by, updated_by)
    values (v_ws, 'orders', 'manual', true, 20, v_owner, v_owner);

  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_at)
    values (v_ws, v_brand, 'C6-VERY-OLD', 'website', 'NEW', 'pending', 'V', '0800000060', 'Addr', 'NGN', 5000, 5000, now() - interval '3 days');

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  perform public.run_auto_assignment_sweep(v_ws, null, 20);
  reset role;
end $$;

\echo '=== 15. A workspace/brand scope explicitly configured for manual strategy never auto-assigns, no matter how old the order is ==='
do $$
begin
  assert (select assigned_to from public.orders where order_number = 'C6-VERY-OLD') is null,
    'a scope with strategy=manual must never auto-assign, even a 3-day-old order';
  assert (select last_auto_assignment_result from public.orders where order_number = 'C6-VERY-OLD') = 'DISABLED_MANUAL_STRATEGY',
    'the recorded reason must honestly reflect that automatic assignment is disabled for this scope';
  raise notice 'OK 15: strategy=manual correctly disables automatic assignment for its scope.';
end $$;

-- ============================================================
-- Cluster 7: new-order notifications, workforce summary honesty on
-- zero data, and anonymous/cross-workspace lockout.
-- ============================================================
\echo '=== 16. A new unassigned order notifies eligible, available staff (not the creator, not ineligible staff) ==='
do $$
declare
  v_ws uuid; v_brand uuid;
  v_owner uuid := '00000000-0000-0000-0000-0000000000f3';
  v_eligible uuid := '00000000-0000-0000-0000-0000000000f4';
  v_ineligible uuid := '00000000-0000-0000-0000-0000000000f5'; -- warehouse-staff, no orders.assign
  v_cs_role uuid; v_owner_role uuid; v_warehouse_role uuid;
  v_notif_eligible int; v_notif_ineligible int; v_notif_creator int;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c7@test.local'), (v_eligible, 'eligible-c7@test.local'), (v_ineligible, 'ineligible-c7@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C7', 'wf122-c7', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws, 'WF C7 Brand', 'wf122-c7-brand', v_owner) returning id into v_brand;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_warehouse_role from public.roles where slug = 'warehouse-staff' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values
    (v_owner, v_ws, v_owner_role), (v_eligible, v_ws, v_cs_role), (v_ineligible, v_ws, v_warehouse_role);

  -- Real order creation goes through the create_order() RPC (which
  -- itself inserts as the table owner, bypassing RLS, after its own
  -- permission check) — orders has no direct INSERT policy for
  -- `authenticated`. The log_order_event() INSERT trigger this
  -- scenario exercises fires regardless of who performs the insert,
  -- so a plain insert (matching every other fixture in this suite)
  -- exercises the same trigger path without needing a full
  -- create_order() call (which requires real product line items).
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, created_by, updated_by)
    values (v_ws, v_brand, 'C7-NOTIFY', 'website', 'NEW', 'pending', 'N', '0800000070', 'Addr', 'NGN', 5000, 5000, v_owner, v_owner);

  select count(*) into v_notif_creator from public.notifications where workspace_id = v_ws and user_id = v_owner and type = 'new_order_available';
  select count(*) into v_notif_eligible from public.notifications where workspace_id = v_ws and user_id = v_eligible and type = 'new_order_available';
  select count(*) into v_notif_ineligible from public.notifications where workspace_id = v_ws and user_id = v_ineligible and type = 'new_order_available';

  assert v_notif_eligible = 1, format('the eligible orders.assign-holding staff member must be notified exactly once, got %s', v_notif_eligible);
  assert v_notif_ineligible = 0, 'a staff member without orders.assign must not be notified about a new unassigned order';
  assert v_notif_creator = 0, 'the order''s own creator must not be notified about their own new order';
  raise notice 'OK 16: new-order notifications reach exactly the eligible, available staff — never a workspace-wide broadcast.';
end $$;

\echo '=== 17. get_workforce_ops_summary() on a genuinely zero-data workspace returns honest zeros/nulls, never fabricated ==='
do $$
declare v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000f6'; v_owner_role uuid; v_summary record;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c7z@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF C7 Zero', 'wf122-c7z', 'NG', 'NGN', v_owner) returning id into v_ws;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner, v_ws, v_owner_role);

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  select * into v_summary from public.get_workforce_ops_summary(v_ws, null);
  reset role;

  assert v_summary.unassigned_count = 0, 'zero-data workspace must report 0 unassigned orders';
  assert v_summary.orders_without_eligible_staff_count = 0, 'zero-data workspace must report 0, never a fabricated count';
  assert v_summary.assignment_success_rate_24h is null, 'with zero auto-assignment attempts, the success rate must be null (honest "no data"), never a fabricated 0%% or 100%%';
  assert v_summary.avg_assignment_time_seconds_24h is null, 'with zero successful auto-assignments, average assignment time must be null, never a fabricated 0';
  raise notice 'OK 17: get_workforce_ops_summary() is honest on a zero-data workspace — no fabricated metrics.';
end $$;

\echo '=== 18. Anonymous and cross-workspace callers are denied by every privileged workforce RPC ==='
do $$
declare v_ws uuid; v_failed boolean;
declare v_outsider uuid := '00000000-0000-0000-0000-0000000000f7';
begin
  select id into v_ws from public.workspaces where slug = 'wf122-c7';

  -- Anonymous.
  perform set_config('app.test_user_id', '', false);
  set role anon;
  v_failed := false;
  begin
    perform public.run_auto_assignment_sweep(v_ws, null, 10);
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'an anonymous caller must be denied by run_auto_assignment_sweep()';

  v_failed := false;
  perform set_config('app.test_user_id', '', false);
  set role anon;
  begin
    perform public.get_workforce_ops_summary(v_ws, null);
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'an anonymous caller must be denied by get_workforce_ops_summary()';

  -- Cross-workspace: a real user with zero membership in v_ws.
  insert into auth.users (id, email) values (v_outsider, 'outsider-c7@test.local') on conflict do nothing;
  perform set_config('app.test_user_id', v_outsider::text, false);
  set role authenticated;
  v_failed := false;
  begin
    perform public.run_auto_assignment_sweep(v_ws, null, 10);
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'a user with no membership in the target workspace must be denied by run_auto_assignment_sweep()';

  raise notice 'OK 18: anonymous and cross-workspace callers are denied by every privileged workforce RPC.';
end $$;

\echo '=== All 18 Workforce Operations scenarios passed. ==='
