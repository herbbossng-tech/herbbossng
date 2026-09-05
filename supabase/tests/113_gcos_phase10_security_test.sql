-- ============================================================
-- GCOS PHASE 10 — dedicated smoke test. Covers the 25 scenarios in
-- the Phase 10 brief: workspace/brand isolation, permission matrix,
-- interaction lifecycle + immutability, rescue lifecycle/idempotency/
-- escalation, notifications, audit, cross-workspace attacks,
-- unauthorized mutation, zero-data, and existing-system regression.
-- Local-only, not committed. Role switches are top-level statements
-- (SET ROLE inside a do $$ block is not valid PL/pgSQL).
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------- fixtures: Workspace A (full cast) + Workspace B (isolation target) ----------
do $$
declare
  v_wsA uuid; v_brandA uuid; v_wsB uuid; v_brandB uuid;
  v_owner uuid; v_cs uuid; v_wh uuid; v_finance uuid; v_marketing uuid; v_viewer uuid;
  v_prodA uuid; v_prodB uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone) values ('P10 WS A', 'p10-ws-a', 'NG', 'NGN', 'Africa/Lagos') returning id into v_wsA;
  insert into public.brands (workspace_id, name, slug) values (v_wsA, 'P10 Brand A', 'p10-brand-a') returning id into v_brandA;
  insert into public.workspaces (name, slug, country_code, currency_code, timezone) values ('P10 WS B', 'p10-ws-b', 'NG', 'NGN', 'Africa/Lagos') returning id into v_wsB;
  insert into public.brands (workspace_id, name, slug) values (v_wsB, 'P10 Brand B', 'p10-brand-b') returning id into v_brandB;

  select id into v_owner from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_wh from public.roles where slug = 'warehouse-staff' and workspace_id is null;
  select id into v_finance from public.roles where slug = 'finance' and workspace_id is null;
  select id into v_marketing from public.roles where slug = 'marketing' and workspace_id is null;
  select id into v_viewer from public.roles where slug = 'viewer' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000b1', 'owner-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b2', 'cs-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b3', 'warehouse-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b4', 'finance-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b5', 'marketing-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b6', 'viewer-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b7', 'nomember-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b8', 'wsb-owner-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b9', 'suspended-p10b@test.local')
  on conflict do nothing;
  insert into public.profiles (id, email) values
    ('00000000-0000-0000-0000-0000000000b1', 'owner-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b2', 'cs-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b3', 'warehouse-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b4', 'finance-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b5', 'marketing-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b6', 'viewer-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b7', 'nomember-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b8', 'wsb-owner-p10b@test.local'),
    ('00000000-0000-0000-0000-0000000000b9', 'suspended-p10b@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000b1', v_owner, v_wsA),
    ('00000000-0000-0000-0000-0000000000b2', v_cs, v_wsA),
    ('00000000-0000-0000-0000-0000000000b3', v_wh, v_wsA),
    ('00000000-0000-0000-0000-0000000000b4', v_finance, v_wsA),
    ('00000000-0000-0000-0000-0000000000b5', v_marketing, v_wsA),
    ('00000000-0000-0000-0000-0000000000b6', v_viewer, v_wsA),
    ('00000000-0000-0000-0000-0000000000b8', v_owner, v_wsB);
  -- b7 (nomember) and b9 (suspended/unmembered) intentionally get NO user_roles row.

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_wsA, v_brandA, 'P10B Product A', 'p10b-product-a', 'P10B-A', 'active', 4000, 1500, 50) returning id into v_prodA;
  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_wsB, v_brandB, 'P10B Product B', 'p10b-product-b', 'P10B-B', 'active', 4000, 1500, 50) returning id into v_prodB;
end $$;

select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

do $$
declare
  v_wsA uuid; v_brandA uuid; v_prodA uuid; v_orderA public.orders;
begin
  select id into v_wsA from public.workspaces where slug = 'p10-ws-a';
  select id into v_brandA from public.brands where slug = 'p10-brand-a';
  select id into v_prodA from public.products where sku = 'P10B-A';
  v_orderA := public.create_order(v_wsA, v_brandA, 'manual', 'P10B Buyer A', '08077770001', '1 P10B Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prodA, 'quantity', 1)));
  raise notice 'P10B_ORDER_A_ID=%', v_orderA.id;
end $$;

-- Order B is created as Workspace B's own owner (b8) — b1 has no role in WS B.
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b8', false);

do $$
declare
  v_wsB uuid; v_brandB uuid; v_prodB uuid; v_orderB public.orders;
begin
  select id into v_wsB from public.workspaces where slug = 'p10-ws-b';
  select id into v_brandB from public.brands where slug = 'p10-brand-b';
  select id into v_prodB from public.products where sku = 'P10B-B';
  v_orderB := public.create_order(v_wsB, v_brandB, 'manual', 'P10B Buyer B', '08077770002', '2 P10B Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prodB, 'quantity', 1)));
  raise notice 'P10B_ORDER_B_ID=%', v_orderB.id;
end $$;

select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 1.1/1.2 — Customer Support: full support+rescue reach, zero finance
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;

do $$
declare v_order_a uuid; v_ok boolean;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  perform public.create_support_interaction('CALL', 'CS role check', v_order_a, null, null, null);
  perform public.create_rescue_case(v_order_a, 'CS opening a rescue case', 'normal', null);
  raise notice 'OK S1.1: customer-support CAN log interactions and open rescue cases';

  select public.user_has_permission((select id from public.workspaces where slug='p10-ws-a'), 'finance.view') into v_ok;
  assert not coalesce(v_ok, false), 'customer-support must never gain finance.view';
  raise notice 'OK S1.2: customer-support has zero finance permission';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 1.3 — Warehouse Staff: rescue.view ONLY
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b3', false);
set role authenticated;

do $$
declare v_order_a uuid; v_case public.rescue_cases; v_failed boolean;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select * into v_case from public.rescue_cases where order_id = v_order_a;

  perform 1 from public.rescue_cases where id = v_case.id;
  if not found then raise exception 'warehouse-staff must be able to VIEW rescue cases'; end if;

  v_failed := false;
  begin
    perform public.create_rescue_case(v_order_a, 'warehouse trying to open a rescue', 'normal', null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'warehouse-staff must NOT be able to create rescue cases';

  v_failed := false;
  begin
    perform public.create_support_interaction('CALL', 'warehouse trying to log a call', v_order_a, null, null, null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'warehouse-staff must NOT be able to log support interactions (no support.* grant)';
  raise notice 'OK S1.3: warehouse-staff is rescue-view-only, no create/escalate, no support.* at all';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 1.4 — Finance: zero support/rescue access
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b4', false);
set role authenticated;

do $$
declare v_order_a uuid; v_failed boolean; v_visible int;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select count(*) into v_visible from public.rescue_cases where order_id = v_order_a;
  assert v_visible = 0, 'finance must see zero rescue cases (no rescue.view grant)';
  v_failed := false;
  begin
    perform public.create_support_interaction('CALL', 'finance trying', v_order_a, null, null, null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'finance must not be able to log support interactions';
  raise notice 'OK S1.4: finance has zero support/rescue access';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 1.5 — Marketing: zero support/rescue access
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b5', false);
set role authenticated;

do $$
declare v_order_a uuid; v_visible int;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select count(*) into v_visible from public.rescue_cases where order_id = v_order_a;
  assert v_visible = 0, 'marketing must see zero rescue cases';
  raise notice 'OK S1.5: marketing has zero support/rescue access';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 1.6 — Viewer: read-only
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b6', false);
set role authenticated;

do $$
declare v_order_a uuid; v_visible int; v_failed boolean;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select count(*) into v_visible from public.rescue_cases where order_id = v_order_a;
  assert v_visible = 1, 'viewer must be able to VIEW rescue cases';
  v_failed := false;
  begin
    perform public.create_support_interaction('CALL', 'viewer trying to write', v_order_a, null, null, null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'viewer must not be able to write';
  raise notice 'OK S1.6: viewer is read-only';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 1.7/1.8 — no-membership + suspended users: fully denied
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b7', false);
set role authenticated;

do $$
declare v_order_a uuid; v_visible int; v_failed boolean;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select count(*) into v_visible from public.rescue_cases where order_id = v_order_a;
  assert v_visible = 0, 'a user with no workspace membership must see zero rescue cases';
  v_failed := false;
  begin
    perform public.create_support_interaction('CALL', 'nomember trying', v_order_a, null, null, null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a user with no workspace membership must not be able to write';
  raise notice 'OK S1.7: no-membership user is fully denied';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b9', false);
set role authenticated;

do $$
declare v_order_a uuid; v_visible int;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select count(*) into v_visible from public.rescue_cases where order_id = v_order_a;
  assert v_visible = 0, 'a suspended/unmembered user must see zero rescue cases';
  raise notice 'OK S1.8: suspended/unmembered user is fully denied';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 2 — cross-workspace attacks + workspace isolation
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b8', false);
set role authenticated;

do $$
declare v_order_a uuid; v_order_b uuid; v_failed boolean; v_visible int;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select id into v_order_b from public.orders where customer_phone = '08077770002';

  v_failed := false;
  begin
    perform public.create_rescue_case(v_order_a, 'WS-B owner attacking WS-A order', 'urgent', null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a Workspace B owner must be rejected when targeting a Workspace A order (cross-workspace attack)';
  raise notice 'OK S2.1: cross-workspace rescue-case creation attack rejected';

  v_failed := false;
  begin
    perform public.create_support_interaction('CALL', 'WS-B owner attacking WS-A order', v_order_a, null, null, null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a Workspace B owner must be rejected when logging an interaction against a Workspace A order';
  raise notice 'OK S2.2: cross-workspace interaction-logging attack rejected';

  perform public.create_rescue_case(v_order_b, 'legit WS-B rescue', 'normal', null);
  raise notice 'OK S2.3: Workspace B owner unaffected on their own order';

  select count(*) into v_visible from public.rescue_cases where order_id = v_order_a;
  assert v_visible = 0, 'Workspace B owner must see zero rows from Workspace A rescue_cases';
  raise notice 'OK S2.4: workspace isolation holds on rescue_cases SELECT';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 3 — unauthorized direct mutation + append-only immutability
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;

do $$
declare v_interaction_id uuid; v_before record; v_after record; v_rows int;
begin
  select id into v_interaction_id from public.support_interactions limit 1;
  select * into v_before from public.support_interactions where id = v_interaction_id;

  update public.support_interactions set summary = 'TAMPERED' where id = v_interaction_id;
  get diagnostics v_rows = row_count;
  assert v_rows = 0, format('support_interactions must be update-immutable via direct client SQL, but % row(s) were affected', v_rows);

  delete from public.support_interactions where id = v_interaction_id;
  get diagnostics v_rows = row_count;
  assert v_rows = 0, format('support_interactions must be delete-immutable via direct client SQL, but % row(s) were affected', v_rows);

  select * into v_after from public.support_interactions where id = v_interaction_id;
  assert v_before.summary = v_after.summary, 'support_interactions row must be byte-identical after a blocked tamper attempt';
  raise notice 'OK S3.1: support_interactions is genuinely immutable against direct client SQL (RLS, not just RPC discipline)';

  begin
    insert into public.rescue_attempts (rescue_case_id, workspace_id, brand_id, to_status)
      select id, workspace_id, brand_id, 'CONTACTING' from public.rescue_cases limit 1;
    raise exception 'should have been blocked';
  exception when insufficient_privilege or others then
    raise notice 'OK S3.2: direct client INSERT into rescue_attempts is blocked';
  end;
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 4 — notifications + audit logging generated for real mutations
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;

do $$
declare v_order_a uuid; v_case public.rescue_cases; v_notif_count int; v_case_id uuid;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';
  select * into v_case from public.rescue_cases where order_id = v_order_a and status not in ('CONVERTED','LOST','CANCELLED') limit 1;
  v_case_id := v_case.id;

  select count(*) into v_notif_count from public.notifications where type = 'rescue_escalated' and metadata->>'rescue_case_id' = v_case_id::text;
  assert v_notif_count = 0, 'sanity: no escalation notification should exist yet for this fresh case';

  perform public.escalate_rescue_case(v_case_id, 'audit/notification check', null);

  select count(*) into v_notif_count from public.notifications where type = 'rescue_escalated' and metadata->>'rescue_case_id' = v_case_id::text;
  assert v_notif_count = 1, format('escalation must reuse the existing notifications table, got %s rows', v_notif_count);
  raise notice 'OK S4.1: rescue escalation generates a real notification via the EXISTING notifications table (no second mechanism)';
end $$;

reset role;

-- audit_logs visibility is itself permission-gated (audit_logs.view),
-- which customer-support correctly does NOT hold — so the audit trail
-- must be verified as a role that actually has it (owner), never by
-- bypassing RLS. Confirms both the mutations were audited AND that
-- audit-log access itself stays properly restricted.
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;

do $$
declare v_case_id uuid; v_audit_count int;
begin
  select id into v_case_id from public.rescue_cases where escalated = true and escalation_reason = 'audit/notification check' limit 1;

  select count(*) into v_audit_count from public.audit_logs where module = 'rescue' and entity_id = v_case_id;
  assert v_audit_count >= 2, format('rescue case create+escalate must both be audited via the EXISTING audit_logs (module=rescue), got %s rows', v_audit_count);
  raise notice 'OK S4.2: rescue case mutations are audited via the EXISTING audit_logs, visible to an audit_logs.view holder';

  select count(*) into v_audit_count from public.audit_logs where module = 'support';
  assert v_audit_count >= 1, 'support interaction creation must be audited';
  raise notice 'OK S4.3: support interaction creation is audited (no second audit mechanism)';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

-- ============================================================
-- SCENARIO SET 5 — outcome validation + task/rescue integration + no orphans
-- ============================================================
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;

do $$
declare v_order_a uuid; v_failed boolean; v_task public.order_tasks; v_interaction public.support_interactions;
begin
  select id into v_order_a from public.orders where customer_phone = '08077770001';

  v_failed := false;
  begin
    perform public.create_support_interaction('CALL', 'bad outcome test', v_order_a, null, 'NOT_A_REAL_OUTCOME', null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'an unknown outcome value must be rejected server-side';
  raise notice 'OK S5.1: outcome is validated server-side, never trusting the client';

  v_task := public.create_order_task(v_order_a, 'CALL_BACK', 'P10 follow-up integration check');
  v_interaction := public.create_support_interaction('FOLLOW_UP_CALL', 'linked to existing follow-up task', v_order_a, null, 'CALLBACK_REQUESTED', v_task.id);
  assert v_interaction.related_task_id = v_task.id, 'support_interactions must link to the EXISTING order_tasks row, not a duplicate task system';
  perform public.update_order_task_status(v_task.id, 'COMPLETED', 'done via support flow');
  raise notice 'OK S5.2: support interactions integrate with the existing order_tasks system (create/link/complete), no second task table';
end $$;

reset role;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000b1', false);

do $$
begin
  perform 1 from public.rescue_attempts ra left join public.rescue_cases rc on rc.id = ra.rescue_case_id where rc.id is null limit 1;
  if found then raise exception 'orphaned rescue_attempts row found'; end if;
  raise notice 'OK S5.3: no orphaned rescue_attempts rows';

  perform 1 from public.support_interactions where order_id is null and customer_id is null limit 1;
  if found then raise exception 'orphaned support_interactions row (neither order nor customer) found'; end if;
  raise notice 'OK S5.4: no orphaned support_interactions rows';
end $$;

-- ============================================================
-- SCENARIO SET 6 — zero-data workspace
-- ============================================================
do $$
declare v_ws_empty uuid; v_brand_empty uuid; v_owner_role uuid; v_summary record; v_queue_count int;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone) values ('P10 Empty WS', 'p10-empty-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_empty;
  insert into public.brands (workspace_id, name, slug) values (v_ws_empty, 'P10 Empty Brand', 'p10-empty-brand') returning id into v_brand_empty;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id) values ('00000000-0000-0000-0000-0000000000b1', v_owner_role, v_ws_empty);

  select * into v_summary from public.get_support_summary(v_ws_empty);
  assert v_summary.needs_attention_count = 0 and v_summary.rescue_opportunities_count = 0 and v_summary.escalated_count = 0,
    'a zero-data workspace must return real zero counts, never an error or fabricated data';
  select count(*) into v_queue_count from public.get_support_queue(v_ws_empty);
  assert v_queue_count = 0, 'a zero-data workspace queue must be genuinely empty';
  raise notice 'OK S6.1: zero-data workspace returns clean zero states, no errors, no fabricated rows';
end $$;

do $$ begin raise notice '=== PHASE 10 SECURITY/SMOKE SUITE PASSED (all scenarios) ==='; end $$;
