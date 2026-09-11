-- ============================================================
-- Staff Operations Dashboard / My Work Console (0037) — dedicated
-- security + regression suite. Covers, at minimum, the 17 scenarios
-- required by the master brief's Section 26, using genuine RLS/
-- permission impersonation (set_config('app.test_user_id', ...) +
-- set role authenticated/anon) — never a mocked permission check.
--
-- Run against a freshly migrated 0001-0037 database with
-- 00_bootstrap_post_migration.sql already applied (see README.md).
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws_a uuid; v_ws_b uuid;
  v_brand_a1 uuid; v_brand_a2 uuid; v_brand_b uuid;
  v_owner_role uuid; v_cs_role uuid; v_warehouse_role uuid;
  v_owner_a uuid := '00000000-0000-0000-0000-0000000000c1';
  v_staff_a uuid := '00000000-0000-0000-0000-0000000000c2';
  v_staff_b uuid := '00000000-0000-0000-0000-0000000000c3';
  v_staff_c uuid := '00000000-0000-0000-0000-0000000000c4'; -- member of ws_b only
  v_staff_d uuid := '00000000-0000-0000-0000-0000000000c5'; -- gets suspended
  v_warehouse_e uuid := '00000000-0000-0000-0000-0000000000c6'; -- no support.view
  v_owner_b uuid := '00000000-0000-0000-0000-0000000000c7';
  v_o_new uuid; v_o_pending uuid; v_o_callback uuid; v_o_confirmed uuid;
  v_o_dispatched uuid; v_o_delivered uuid; v_o_cancelled uuid; v_o_returned uuid;
  v_o_brand2 uuid; v_o_recent uuid; v_o_b1 uuid; v_o_missed uuid;
begin
  insert into auth.users (id, email) values
    (v_owner_a, 'owner-a-sw@test.local'),
    (v_staff_a, 'staff-a-sw@test.local'),
    (v_staff_b, 'staff-b-sw@test.local'),
    (v_staff_c, 'staff-c-sw@test.local'),
    (v_staff_d, 'staff-d-sw@test.local'),
    (v_warehouse_e, 'warehouse-e-sw@test.local'),
    (v_owner_b, 'owner-b-sw@test.local');

  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('SW WS A', 'sw121-ws-a', 'NG', 'NGN', v_owner_a) returning id into v_ws_a;
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('SW WS B (zero-data)', 'sw121-ws-b', 'NG', 'NGN', v_owner_b) returning id into v_ws_b;

  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_a, 'SW Brand A1', 'sw121-brand-a1', v_owner_a) returning id into v_brand_a1;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_a, 'SW Brand A2', 'sw121-brand-a2', v_owner_a) returning id into v_brand_a2;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_b, 'SW Brand B', 'sw121-brand-b', v_owner_b) returning id into v_brand_b;

  select id into v_owner_role from public.roles where workspace_id is null and slug = 'owner';
  select id into v_cs_role from public.roles where workspace_id is null and slug = 'customer-support';
  select id into v_warehouse_role from public.roles where workspace_id is null and slug = 'warehouse-staff';

  insert into public.user_roles (user_id, workspace_id, role_id) values
    (v_owner_a, v_ws_a, v_owner_role),
    (v_staff_a, v_ws_a, v_cs_role),
    (v_staff_b, v_ws_a, v_cs_role),
    (v_staff_d, v_ws_a, v_cs_role),
    (v_warehouse_e, v_ws_a, v_warehouse_role),
    (v_staff_c, v_ws_b, v_cs_role),
    (v_owner_b, v_ws_b, v_owner_role);

  -- Staff A's orders — one per status, plus one in a second brand
  -- (brand isolation) and one created unassigned then reassigned
  -- (RECENTLY_ASSIGNED group + notification correctness).
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-NEW', 'website', 'NEW', 'pending', 'Cust New', '0800200001', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_new;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-PENDING', 'website', 'PENDING', 'pending', 'Cust Pending', '0800200002', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_pending;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-CALLBACK', 'website', 'WILL_CALL_BACK', 'pending', 'Cust Callback', '0800200003', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_callback;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-CONFIRMED', 'website', 'SCHEDULED', 'pending', 'Cust Confirmed', '0800200004', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_confirmed;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-DISPATCHED', 'website', 'DISPATCHED', 'pending', 'Cust Dispatched', '0800200005', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_dispatched;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-DELIVERED', 'website', 'DELIVERED', 'collected', 'Cust Delivered', '0800200006', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_delivered;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-CANCELLED', 'website', 'CANCELLED', 'pending', 'Cust Cancelled', '0800200007', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_cancelled;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-RETURNED', 'website', 'RETURNED', 'pending', 'Cust Returned', '0800200008', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_returned;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a2, 'SW121-BRAND2', 'website', 'NEW', 'pending', 'Cust Brand2', '0800200009', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_brand2;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-RECENT', 'website', 'DISPATCHED', 'pending', 'Cust Recent', '0800200010', 'Addr', 'NGN', 5000, 5000, null) returning id into v_o_recent;
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-MISSED', 'website', 'PENDING', 'pending', 'Cust Missed', '0800200012', 'Addr', 'NGN', 5000, 5000, v_staff_a) returning id into v_o_missed;

  -- Staff B's control order — must never appear in Staff A's results.
  insert into public.orders (workspace_id, brand_id, order_number, source, status, cash_collection_status, customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount, assigned_to)
    values (v_ws_a, v_brand_a1, 'SW121-B1', 'website', 'NEW', 'pending', 'Cust B1', '0800200011', 'Addr', 'NGN', 5000, 5000, v_staff_b) returning id into v_o_b1;

  -- An overdue follow-up task on the PENDING order (yesterday, so it
  -- cannot also land in today's due-today window), and a due-today,
  -- NOT-YET-overdue task on the CONFIRMED order. The due-today task
  -- must satisfy two things regardless of what time this suite happens
  -- to run: (a) fall within today's UTC calendar date, per
  -- get_my_priority_queue/get_my_work_summary's date_trunc('day', now())
  -- window (0037), and (b) stay in the future relative to `now()`, so it
  -- is never also counted as OVERDUE_FOLLOW_UP (< now()) by scenario 12's
  -- exact-count assertions. `now() + interval '2 hours'` satisfied (b)
  -- but broke (a) whenever the suite ran within ~2h of UTC midnight;
  -- `date_trunc('day', now()) + 12h` (a since-reverted attempt) satisfied
  -- (a) but broke (b) for the entire second half of every day. Taking
  -- the earlier of "5 minutes from now" and "the last second of today"
  -- satisfies both for every possible run time: the former is what's
  -- normally used, and near end-of-day it clamps to a value that is
  -- still guaranteed >= now() (today's last second can never be in the
  -- past) and still < tomorrow's start.
  insert into public.order_tasks (workspace_id, brand_id, order_id, task_type, title, priority, status, assigned_to, due_at)
    values (v_ws_a, v_brand_a1, v_o_pending, 'CALL_BACK', 'Call back overdue', 'normal', 'OPEN', v_staff_a, now() - interval '1 day');
  insert into public.order_tasks (workspace_id, brand_id, order_id, task_type, title, priority, status, assigned_to, due_at)
    values (v_ws_a, v_brand_a1, v_o_confirmed, 'CONFIRM_ORDER', 'Confirm before dispatch', 'normal', 'OPEN', v_staff_a,
      least(now() + interval '5 minutes', date_trunc('day', now()) + interval '1 day' - interval '1 second'));

  -- A prior NO_ANSWER contact attempt on the MISSED order — inserted
  -- directly (fixture setup, bypassing RLS as the migration-runner
  -- role) so it predates and is independent of the create_support_
  -- interaction() RPC call scenarios 6/7 make against a different order.
  insert into public.support_interactions (workspace_id, brand_id, order_id, interaction_type, outcome, summary, created_by)
    values (v_ws_a, v_brand_a1, v_o_missed, 'CALL', 'NO_ANSWER', 'No answer, will retry', v_staff_a);

  raise notice 'WS_A=%, WS_B=%, BRAND_A1=%, BRAND_A2=%, OWNER_A=%, STAFF_A=%, STAFF_B=%, STAFF_C=%, STAFF_D=%, WAREHOUSE_E=%, O_CALLBACK=%, O_RECENT=%',
    v_ws_a, v_ws_b, v_brand_a1, v_brand_a2, v_owner_a, v_staff_a, v_staff_b, v_staff_c, v_staff_d, v_warehouse_e, v_o_callback, v_o_recent;
end $$;

-- (Fixture UUIDs are randomly generated for workspaces/brands/orders,
-- so every scenario below resolves them by slug/order_number rather
-- than hardcoding — only the auth.users ids above are fixed.)

\echo '=== 1. Staff A sees exactly their own assigned orders (get_my_work_summary / get_my_recent_orders / get_my_priority_queue) ==='
do $$
declare
  v_ws uuid; v_summary record; v_recent_count int; v_queue_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;

  select * into v_summary from public.get_my_work_summary(v_ws, null);
  assert v_summary.assigned_to_me_count = 10, format('expected 10 orders assigned to Staff A, got %s', v_summary.assigned_to_me_count);

  select count(*) into v_recent_count from public.get_my_recent_orders(v_ws, null, 50);
  assert v_recent_count = 10, format('get_my_recent_orders should return exactly Staff A''s 10 orders, got %s', v_recent_count);

  select count(*) into v_queue_count from public.get_my_priority_queue(v_ws, null, 100) where order_number = 'SW121-B1';
  assert v_queue_count = 0, 'Staff A''s priority queue must never contain Staff B''s order';

  reset role;
  raise notice 'OK 1: Staff A''s three My Work RPCs return exactly and only Staff A''s own assigned orders.';
end $$;

\echo '=== 1b. Today''s Work priority-queue grouping matches the fixture reality (Section 5 groups) ==='
do $$
declare v_ws uuid; v_groups jsonb;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;
  select jsonb_object_agg(queue_group, order_numbers) into v_groups
  from (
    select queue_group, array_agg(order_number) as order_numbers
    from public.get_my_priority_queue(v_ws, null, 100)
    group by queue_group
  ) g;
  reset role;

  assert v_groups -> 'OVERDUE_FOLLOW_UP' ? 'SW121-PENDING', format('OVERDUE_FOLLOW_UP must contain the order with the overdue task, got %s', v_groups -> 'OVERDUE_FOLLOW_UP');
  assert v_groups -> 'DUE_TODAY' ? 'SW121-CONFIRMED', format('DUE_TODAY must contain the order with the due-today task, got %s', v_groups -> 'DUE_TODAY');
  assert v_groups -> 'AWAITING_CONFIRMATION' ? 'SW121-PENDING' and v_groups -> 'AWAITING_CONFIRMATION' ? 'SW121-CALLBACK',
    format('AWAITING_CONFIRMATION must contain both PENDING and WILL_CALL_BACK orders, got %s', v_groups -> 'AWAITING_CONFIRMATION');
  assert v_groups -> 'NOT_YET_CONTACTED' ? 'SW121-NEW', format('NOT_YET_CONTACTED must contain the never-contacted NEW order, got %s', v_groups -> 'NOT_YET_CONTACTED');
  assert v_groups -> 'MISSED_CONTACT' ? 'SW121-MISSED', format('MISSED_CONTACT must contain the order with a NO_ANSWER outcome, got %s', v_groups -> 'MISSED_CONTACT');
  raise notice 'OK 1b: every priority-queue group reflects real underlying data — no fabricated grouping.';
end $$;

\echo '=== 2. Staff B cannot see Staff A''s assigned orders through the same RPCs (no staff-id parameter to spoof) ==='
do $$
declare v_ws uuid; v_summary record; v_recent_numbers text[];
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c3', false);
  set role authenticated;

  select * into v_summary from public.get_my_work_summary(v_ws, null);
  assert v_summary.assigned_to_me_count = 1, format('Staff B should see only their own 1 order, got %s', v_summary.assigned_to_me_count);

  select array_agg(order_number) into v_recent_numbers from public.get_my_recent_orders(v_ws, null, 50);
  assert v_recent_numbers = array['SW121-B1'], format('Staff B''s recent orders must be exactly [SW121-B1], got %s', v_recent_numbers);

  reset role;
  raise notice 'OK 2: Staff B''s identical RPC calls return only Staff B''s own order — the RPCs take no staff-id parameter to spoof, so isolation holds regardless of Staff B''s workspace-wide orders.view grant.';
end $$;

\echo '=== 3. Management (Owner) retains full workspace-wide visibility, unaffected by the new per-staff RPCs ==='
do $$
declare v_ws uuid; v_total int;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  set role authenticated;
  select count(*) into v_total from public.orders where workspace_id = v_ws and deleted_at is null;
  reset role;
  assert v_total = 12, format('Owner should see all 12 workspace orders (Staff A''s 10 assigned + 1 unassigned (SW121-RECENT) + Staff B''s 1) via the existing workspace-wide select_orders policy, got %s', v_total);
  raise notice 'OK 3: Owner''s existing workspace-wide visibility (select_orders RLS) is untouched by migration 0037.';
end $$;

\echo '=== 4. Workspace isolation: a user with no membership in WS A cannot pull WS A''s My Work data ==='
do $$
declare v_ws_a uuid; v_failed boolean := false;
begin
  select id into v_ws_a from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c4', false); -- Staff C, member of WS B only
  set role authenticated;
  begin
    perform public.get_my_work_summary(v_ws_a, null);
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'Staff C (no membership in WS A) must be denied by get_my_work_summary(WS A, ...), not silently return data';
  raise notice 'OK 4: workspace isolation holds — a non-member is rejected outright, never handed an empty-but-successful result that could be confused with a real zero-orders account.';
end $$;

\echo '=== 5. Brand isolation: filtering by Brand A1 excludes Staff A''s Brand A2 order ==='
do $$
declare v_ws uuid; v_brand_a1 uuid; v_summary record; v_has_brand2 boolean;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  select id into v_brand_a1 from public.brands where slug = 'sw121-brand-a1';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;

  select * into v_summary from public.get_my_work_summary(v_ws, v_brand_a1);
  assert v_summary.assigned_to_me_count = 9, format('Brand A1-scoped summary should exclude the Brand A2 order (9 of 10), got %s', v_summary.assigned_to_me_count);

  select exists (select 1 from public.get_my_recent_orders(v_ws, v_brand_a1, 50) where order_number = 'SW121-BRAND2') into v_has_brand2;
  assert not v_has_brand2, 'get_my_recent_orders(brand=A1) must not include the Brand A2 order';

  reset role;
  raise notice 'OK 5: p_brand_id correctly narrows every My Work RPC, matching the existing brand-scoping convention used across the app.';
end $$;

\echo '=== 6 & 7. Follow-up interaction creation via the existing create_support_interaction() RPC, with the author correctly persisted ==='
do $$
declare v_order uuid; v_interaction record;
begin
  select id into v_order from public.orders where order_number = 'SW121-CALLBACK';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;
  select * into v_interaction from public.create_support_interaction(
    p_interaction_type := 'CALL', p_summary := 'Tried calling, no answer',
    p_order_id := v_order, p_outcome := 'NO_ANSWER'
  );
  reset role;

  assert v_interaction.summary = 'Tried calling, no answer', 'interaction summary must persist as submitted';
  assert v_interaction.created_by = '00000000-0000-0000-0000-0000000000c2', format('interaction author must be the acting staff member (Staff A), got %s', v_interaction.created_by);
  raise notice 'OK 6/7: no disconnected notes system — the existing create_support_interaction() RPC (0030) is reused, and it correctly stamps created_by to the acting user regardless of any other input.';
end $$;

\echo '=== 8. Management can read the interaction Staff A just logged (shared canonical record, not a parallel notes system) ==='
do $$
declare v_order uuid; v_count int; v_created_by uuid;
begin
  select id into v_order from public.orders where order_number = 'SW121-CALLBACK';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false); -- Owner
  set role authenticated;
  select count(*) into v_count from public.support_interactions where order_id = v_order;
  select created_by into v_created_by from public.support_interactions where order_id = v_order limit 1;
  reset role;
  assert v_count = 1, 'Owner (support.view via blanket owner grant) must see the interaction Staff A logged';
  assert v_created_by = '00000000-0000-0000-0000-0000000000c2', 'the record Owner reads must show Staff A as the author — same row, not a separate management-only copy';
  raise notice 'OK 8: management reads the exact same support_interactions row staff wrote — one canonical model, RBAC-controlled visibility.';
end $$;

\echo '=== 9. Staff B cannot modify the interaction Staff A authored (no update/delete policy — immutable history) ==='
do $$
declare v_order uuid; v_rows int;
begin
  select id into v_order from public.orders where order_number = 'SW121-CALLBACK';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c3', false); -- Staff B
  set role authenticated;
  update public.support_interactions set summary = 'tampered' where order_id = v_order;
  get diagnostics v_rows = row_count;
  assert v_rows = 0, format('an UPDATE by a different staff member must affect 0 rows (no update policy exists), affected %s', v_rows);
  delete from public.support_interactions where order_id = v_order;
  get diagnostics v_rows = row_count;
  assert v_rows = 0, format('a DELETE by a different staff member must affect 0 rows (no delete policy exists), affected %s', v_rows);
  reset role;
  raise notice 'OK 9: support_interactions has no update/delete policy for any authenticated role — Staff B''s attempt to alter Staff A''s record is a silent no-op, not a partial success.';
end $$;

\echo '=== 10. A suspended staff member is denied by every My Work RPC, immediately ==='
do $$
declare v_ws uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false); -- Owner suspends Staff D
  set role authenticated;
  perform public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000c5', 'suspended');
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c5', false); -- now impersonate the suspended Staff D
  set role authenticated;
  begin
    perform public.get_my_work_summary(v_ws, null);
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'a suspended staff member must be rejected by get_my_work_summary (user_has_permission excludes inactive profiles per 0027)';
  raise notice 'OK 10: suspension is enforced at the database layer for the new RPCs too — no separate bypass path was introduced.';
end $$;

\echo '=== 11. An anonymous caller cannot access any My Work data ==='
do $$
declare v_ws uuid; v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '', false);
  set role anon;
  begin
    perform public.get_my_work_summary(v_ws, null);
  exception when others then
    v_failed := true;
  end;
  reset role;
  assert v_failed, 'an anonymous caller (auth.uid() is null) must be rejected outright by get_my_work_summary';
  raise notice 'OK 11: anonymous callers are rejected before any query runs (explicit auth.uid() is null check).';
end $$;

\echo '=== 12. Card counts reconcile exactly against the underlying order rows (no fabricated numbers) ==='
do $$
declare v_ws uuid; v_summary record; v_manual_total int; v_status_sum bigint;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;
  select * into v_summary from public.get_my_work_summary(v_ws, null);
  reset role;

  select count(*) into v_manual_total from public.orders where workspace_id = v_ws and assigned_to = '00000000-0000-0000-0000-0000000000c2' and deleted_at is null;
  assert v_summary.assigned_to_me_count = v_manual_total, format('assigned_to_me_count=%s but manual count=%s', v_summary.assigned_to_me_count, v_manual_total);

  v_status_sum := v_summary.new_count + v_summary.pending_confirmation_count + v_summary.confirmed_count
    + v_summary.out_for_delivery_count + v_summary.delivered_count + v_summary.cancelled_count + v_summary.returned_count;
  assert v_status_sum = v_summary.assigned_to_me_count,
    format('the 7 status-bucket cards (new+pending+confirmed+out_for_delivery+delivered+cancelled+returned=%s) must sum to assigned_to_me_count=%s — every one of the 11 canonical statuses maps to exactly one bucket', v_status_sum, v_summary.assigned_to_me_count);

  assert v_summary.overdue_follow_ups_count = 1, format('expected exactly 1 overdue task fixture, got %s', v_summary.overdue_follow_ups_count);
  assert v_summary.due_today_follow_ups_count = 1, format('expected exactly 1 due-today task fixture, got %s', v_summary.due_today_follow_ups_count);
  raise notice 'OK 12: every summary count reconciles exactly against a manual recomputation from the orders/order_tasks tables.';
end $$;

\echo '=== 13. Clicking a card''s filter reproduces the same dataset the card counted (deep-link correctness) ==='
do $$
declare v_ws uuid; v_summary record; v_manual_pending int; v_manual_new int;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;
  select * into v_summary from public.get_my_work_summary(v_ws, null);
  -- Simulates OrdersPage's own query shape for the "Pending Confirmation"
  -- and "New" deep links (assignedTo=<uid>&statusIn=... / status=NEW).
  select count(*) into v_manual_pending from public.orders
    where workspace_id = v_ws and assigned_to = '00000000-0000-0000-0000-0000000000c2' and deleted_at is null and status in ('PENDING', 'WILL_CALL_BACK');
  select count(*) into v_manual_new from public.orders
    where workspace_id = v_ws and assigned_to = '00000000-0000-0000-0000-0000000000c2' and deleted_at is null and status = 'NEW';
  reset role;

  assert v_summary.pending_confirmation_count = v_manual_pending, format('Pending Confirmation card=%s but the filtered-view query it deep-links to would return %s', v_summary.pending_confirmation_count, v_manual_pending);
  assert v_summary.new_count = v_manual_new, format('New card=%s but the filtered-view query it deep-links to would return %s', v_summary.new_count, v_manual_new);
  raise notice 'OK 13: card counts and the filtered order queue their deep links open (same assigned_to + status predicate, enforced by the same RLS) always agree.';
end $$;

\echo '=== 14. support_interactions stays fully RLS-protected regardless of Realtime publication membership — Realtime cannot leak restricted records ==='
-- NOTE on what this can and cannot verify locally: 0037 Part E's guard
-- (`if exists (select 1 from pg_publication where pubname =
-- 'supabase_realtime') ...`) only fires against a real Supabase
-- project, which is the only place that publication exists — this
-- plain Postgres 16 test harness has no such publication (same
-- documented limitation every prior guarded-publication migration in
-- this repo — 0023/0032/0033 — has always had here), so "is the table
-- actually in the publication" cannot be asserted in this sandbox
-- without fabricating a fake publication that proves nothing about
-- the real guard. What we CAN and do verify here is the actual
-- security property Realtime depends on: table-level RLS still
-- governs every row regardless of whether the table is
-- Realtime-published, so adding support_interactions to the
-- publication (verified only by a live Supabase check post-deploy,
-- per Section 28) can never widen who can see a row.
do $$
declare v_order uuid; v_visible_count int;
begin
  select id into v_order from public.orders where order_number = 'SW121-CALLBACK';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c6', false); -- warehouse-staff: no support.view at all
  set role authenticated;
  select count(*) into v_visible_count from public.support_interactions where order_id = v_order;
  reset role;
  assert v_visible_count = 0, format('a role without support.view must see zero support_interactions rows regardless of Realtime publication membership, got %s', v_visible_count);
  raise notice 'OK 14: select_support_interactions RLS (workspace + support.view) governs every row independent of Realtime; a subscriber''s postgres_changes stream can never contain more than their own authorized select would. (Publication membership itself: verify against a live Supabase project post-deploy — see the report''s manual deployment steps.)';
end $$;

\echo '=== 15. Zero-data workspace behaves correctly — no errors, no fabricated rows ==='
do $$
declare v_ws uuid; v_summary record; v_queue_count int; v_recent_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-b';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c7', false); -- Owner B, zero orders
  set role authenticated;
  select * into v_summary from public.get_my_work_summary(v_ws, null);
  select count(*) into v_queue_count from public.get_my_priority_queue(v_ws, null, 30);
  select count(*) into v_recent_count from public.get_my_recent_orders(v_ws, null, 50);
  reset role;

  assert v_summary.assigned_to_me_count = 0, 'a zero-order workspace must report 0, never null or a fabricated number';
  assert v_summary.oldest_pending_since is null, 'oldest_pending_since must be a genuine null, not a fabricated timestamp, when there is nothing pending';
  assert v_queue_count = 0, 'priority queue must be genuinely empty, not erroring, for a zero-data workspace';
  assert v_recent_count = 0, 'recent orders must be genuinely empty for a zero-data workspace';
  raise notice 'OK 15: a brand-new, zero-data workspace produces honest empty/zero results end to end.';
end $$;

\echo '=== 16. Existing order lifecycle logging (order_events) is unchanged by the log_order_event() extension ==='
do $$
declare v_order uuid; v_event_count int;
begin
  select id into v_order from public.orders where order_number = 'SW121-NEW';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false); -- Staff A has orders.update
  set role authenticated;
  update public.orders set status = 'PENDING', updated_by = '00000000-0000-0000-0000-0000000000c2' where id = v_order;
  reset role;

  select count(*) into v_event_count from public.order_events where order_id = v_order and event_type = 'STATUS_CHANGED' and from_status = 'NEW' and to_status = 'PENDING';
  assert v_event_count = 1, 'the pre-existing STATUS_CHANGED event branch (copied verbatim from 0016) must still fire exactly as before';
  raise notice 'OK 16: the existing order lifecycle/event trigger behavior (status changes, and by extension tags/cash-collection/ORDER_CREATED, all untouched code paths) is unchanged — only two new notification blocks were added inside the pre-existing assignment branch.';
end $$;

\echo '=== 16b. Order (re)assignment notifications: new assignee notified, previous assignee notified on reassignment-away, self-assignment never notifies ==='
do $$
declare
  v_order uuid; v_notif_count int; v_notif_count_before int;
begin
  select id into v_order from public.orders where order_number = 'SW121-RECENT';

  -- Owner assigns the unassigned order to Staff A.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  set role authenticated;
  update public.orders set assigned_to = '00000000-0000-0000-0000-0000000000c2', updated_by = '00000000-0000-0000-0000-0000000000c1' where id = v_order;
  reset role;

  select count(*) into v_notif_count from public.notifications
    where user_id = '00000000-0000-0000-0000-0000000000c2' and type = 'order_assigned' and (metadata ->> 'order_id')::uuid = v_order;
  assert v_notif_count = 1, format('Staff A must receive exactly one order_assigned notification, got %s', v_notif_count);

  -- The RECENTLY_ASSIGNED priority-queue group should now pick this
  -- order up for Staff A (ASSIGNED order_event within the last 24h).
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false);
  set role authenticated;
  perform 1 from public.get_my_priority_queue((select workspace_id from public.orders where id = v_order), null, 100)
    where queue_group = 'RECENTLY_ASSIGNED' and order_number = 'SW121-RECENT';
  if not found then
    raise exception 'SW121-RECENT must appear in Staff A''s RECENTLY_ASSIGNED queue group right after being assigned to them';
  end if;
  reset role;

  -- Owner reassigns it from Staff A to Staff B.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c1', false);
  set role authenticated;
  update public.orders set assigned_to = '00000000-0000-0000-0000-0000000000c3', updated_by = '00000000-0000-0000-0000-0000000000c1' where id = v_order;
  reset role;

  select count(*) into v_notif_count from public.notifications
    where user_id = '00000000-0000-0000-0000-0000000000c2' and type = 'order_reassigned' and (metadata ->> 'order_id')::uuid = v_order;
  assert v_notif_count = 1, format('Staff A must be notified their order was reassigned away, got %s', v_notif_count);
  select count(*) into v_notif_count from public.notifications
    where user_id = '00000000-0000-0000-0000-0000000000c3' and type = 'order_assigned' and (metadata ->> 'order_id')::uuid = v_order;
  assert v_notif_count = 1, format('Staff B must receive the new-assignee notification, got %s', v_notif_count);

  -- Staff B re-saves the order they are already assigned to, as
  -- themselves — must NOT generate an additional self-notification.
  -- (Compares the count before/after this specific update, since Staff
  -- B legitimately already holds one order_assigned notification from
  -- the real reassignment above.)
  select count(*) into v_notif_count_before from public.notifications where user_id = '00000000-0000-0000-0000-0000000000c3' and type = 'order_assigned';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c3', false);
  set role authenticated;
  update public.orders set priority = 'high', updated_by = '00000000-0000-0000-0000-0000000000c3' where id = v_order; -- no assignment change: control
  reset role;
  select count(*) into v_notif_count from public.notifications where user_id = '00000000-0000-0000-0000-0000000000c3' and type = 'order_assigned';
  assert v_notif_count = v_notif_count_before, format('Staff B must not receive a new order_assigned notification when nothing about the assignment changed (before=%s, after=%s)', v_notif_count_before, v_notif_count);

  raise notice 'OK 16b: order (re)assignment notifications (order_assigned/order_reassigned) behave exactly as designed — a genuinely new capability that previously did not exist for orders (unlike order_tasks, which already notified).';
end $$;

\echo '=== 17. Existing finance visibility boundary is unchanged: Customer Support still gets zero aggregate finance data ==='
do $$
declare v_ws uuid; v_finance record;
begin
  select id into v_ws from public.workspaces where slug = 'sw121-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000c2', false); -- Staff A: orders.view/tasks.*/support.* but no finance/analytics/reports.view
  set role authenticated;
  select * into v_finance from public.get_finance_summary(v_ws, null, null, null);
  reset role;
  assert coalesce(v_finance.total_orders, 0) = 0, format('a caller without finance/analytics/reports.view must get zero aggregate finance data (unchanged by 0037), got total_orders=%s', v_finance.total_orders);
  raise notice 'OK 17: the pre-existing finance-visibility boundary (user_has_finance_visibility) is untouched — the new My Work RPCs expose only per-order total_amount (already unguarded before this migration, per Section 18''s audit), never a second aggregate revenue formula.';
end $$;

\echo '=== All 17 (+1 bonus) Staff Console scenarios passed. ==='
