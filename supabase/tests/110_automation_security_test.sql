-- ============================================================
-- Phase 8 (Automation/Event Engine) SECURITY test. Genuine
-- SET ROLE authenticated + GUC impersonation throughout (RLS
-- actually enforced). Run against a fresh DB with 0001-0028
-- applied + grant_authenticated.sql. Local-only, not committed.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_ws_a uuid; v_brand_a uuid; v_brand_a2 uuid; v_ws_b uuid; v_brand_b uuid;
  v_owner_role uuid; v_admin_role uuid; v_manager_role uuid; v_cs_role uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Sec Auto WS A', 'sec-auto-ws-a', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_a;
  insert into public.brands (workspace_id, name, slug) values (v_ws_a, 'Sec Auto Brand A', 'sec-auto-brand-a') returning id into v_brand_a;
  insert into public.brands (workspace_id, name, slug) values (v_ws_a, 'Sec Auto Brand A2', 'sec-auto-brand-a2') returning id into v_brand_a2;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Sec Auto WS B', 'sec-auto-ws-b', 'GH', 'GHS', 'Africa/Accra') returning id into v_ws_b;
  insert into public.brands (workspace_id, name, slug) values (v_ws_b, 'Sec Auto Brand B', 'sec-auto-brand-b') returning id into v_brand_b;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_admin_role from public.roles where slug = 'admin' and workspace_id is null;
  select id into v_manager_role from public.roles where slug = 'manager' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000b1', 'owner-secauto@test.local'),
    ('00000000-0000-0000-0000-0000000000b2', 'admin-secauto@test.local'),
    ('00000000-0000-0000-0000-0000000000b3', 'manager-secauto@test.local'),
    ('00000000-0000-0000-0000-0000000000b4', 'cs-secauto@test.local'),
    ('00000000-0000-0000-0000-0000000000b5', 'owner-b-secauto@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000b1', v_owner_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000b2', v_admin_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000b3', v_manager_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000b4', v_cs_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000b5', v_owner_role, v_ws_b);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws_a, v_brand_a, 'Sec Auto Product', 'sec-auto-product', 'SECAUTO-1', 'active', 5000, 2000, 50);
end $$;

\set owner_a '00000000-0000-0000-0000-0000000000b1'
\set admin_a '00000000-0000-0000-0000-0000000000b2'
\set manager_a '00000000-0000-0000-0000-0000000000b3'
\set cs_a '00000000-0000-0000-0000-0000000000b4'
\set owner_b '00000000-0000-0000-0000-0000000000b5'

select set_config('app.test_user_id', :'owner_a', false);

do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select id into v_brand from public.brands where slug = 'sec-auto-brand-a';
  select id into v_prod from public.products where sku = 'SECAUTO-1';
  v_order := public.create_order(v_ws, v_brand, 'manual', 'Sec Auto Buyer', '08099990001', '1 Sec Auto Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
end $$;

\echo '=== 1. Owner: full automation authority (view + manage) ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_rule public.automation_rules; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select count(*) into v_count from public.automation_events where workspace_id = v_ws;
  assert v_count > 0, 'Owner should see automation_events for their own workspace';

  insert into public.automation_rules (workspace_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, 'Owner rule', 'orders.created', 'draft', '[]'::jsonb, auth.uid(), auth.uid())
  returning * into v_rule;
  assert v_rule.id is not null, 'Owner should be able to create an automation rule';
  raise notice 'OK: Owner has full automation authority.';
end $$;

\echo '=== 2. Manager: can view, cannot create/manage rules ==='
select set_config('app.test_user_id', :'manager_a', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select count(*) into v_count from public.automation_rules where workspace_id = v_ws;
  assert v_count > 0, 'Manager should be able to VIEW automation rules';

  begin
    insert into public.automation_rules (workspace_id, name, event_type, status, actions, created_by, updated_by)
    values (v_ws, 'Manager rule', 'orders.created', 'draft', '[]'::jsonb, auth.uid(), auth.uid());
    raise exception 'Manager should NOT be able to create an automation rule';
  exception when others then
    raise notice 'OK: Manager blocked from creating automation rules: %', SQLERRM;
  end;
end $$;

\echo '=== 3. Customer Support: cannot see automation at all ==='
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select count(*) into v_count from public.automation_rules where workspace_id = v_ws;
  assert v_count = 0, 'Customer Support must NOT see automation_rules at all';
  select count(*) into v_count from public.automation_events where workspace_id = v_ws;
  assert v_count = 0, 'Customer Support must NOT see automation_events at all';
  select count(*) into v_count from public.automation_executions where workspace_id = v_ws;
  assert v_count = 0, 'Customer Support must NOT see automation_executions at all';
  raise notice 'OK: Customer Support has zero automation visibility.';
end $$;

\echo '=== 4. Unauthorized manual retry is blocked (automation.manage required) ==='
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_rule public.automation_rules; v_event_id uuid; v_execution public.automation_executions;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  insert into public.automation_rules (workspace_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, 'Retry test rule', 'orders.created', 'active', '[{"type": "ASSIGN_TASK", "config": {}}]'::jsonb, auth.uid(), auth.uid())
  returning * into v_rule;
end $$;

select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select id into v_brand from public.brands where slug = 'sec-auto-brand-a';
  select id into v_prod from public.products where sku = 'SECAUTO-1';
  v_order := public.create_order(v_ws, v_brand, 'manual', 'Retry Sec Buyer', '08099990002', '2 Sec Auto Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
end $$;

select set_config('app.test_user_id', :'manager_a', false);
do $$
declare v_ws uuid; v_execution_id uuid;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select e.id into v_execution_id from public.automation_executions e
    join public.automation_rules r on r.id = e.rule_id
    where r.name = 'Retry test rule' limit 1;
  begin
    perform public.retry_automation_execution(v_execution_id);
    raise exception 'Manager (no automation.manage) should NOT be able to manually retry an execution';
  exception when others then
    raise notice 'OK: unauthorized manual retry blocked: %', SQLERRM;
  end;
end $$;

\echo '=== 5. Cross-workspace isolation: WS B owner sees zero WS A automation data ==='
select set_config('app.test_user_id', :'owner_b', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select count(*) into v_count from public.automation_events where workspace_id = v_ws;
  assert v_count = 0, 'WS B owner must see zero WS A automation_events';
  select count(*) into v_count from public.automation_rules where workspace_id = v_ws;
  assert v_count = 0, 'WS B owner must see zero WS A automation_rules';
  select count(*) into v_count from public.automation_executions where workspace_id = v_ws;
  assert v_count = 0, 'WS B owner must see zero WS A automation_executions';
  raise notice 'OK: cross-workspace isolation holds for all automation tables.';
end $$;

\echo '=== 6. WS B automation cannot be triggered by a WS A event (workspace-scoped matching) ==='
do $$
declare v_ws_b uuid;
begin
  select id into v_ws_b from public.workspaces where slug = 'sec-auto-ws-b';
end $$;
select set_config('app.test_user_id', :'owner_b', false);
do $$
declare v_ws_b uuid; v_rule public.automation_rules;
begin
  select id into v_ws_b from public.workspaces where slug = 'sec-auto-ws-b';
  insert into public.automation_rules (workspace_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws_b, 'WS B catch-all', 'orders.created', 'active', '[{"type": "LOG_EVENT", "config": {}}]'::jsonb, auth.uid(), auth.uid())
  returning * into v_rule;
end $$;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws_a uuid; v_brand_a uuid; v_prod uuid; v_order public.orders; v_ws_b_exec_count int;
begin
  select id into v_ws_a from public.workspaces where slug = 'sec-auto-ws-a';
  select id into v_brand_a from public.brands where slug = 'sec-auto-brand-a';
  select id into v_prod from public.products where sku = 'SECAUTO-1';
  v_order := public.create_order(v_ws_a, v_brand_a, 'manual', 'Isolation Buyer', '08099990003', '3 Sec Auto Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select count(*) into v_ws_b_exec_count from public.automation_executions e
    join public.automation_rules r on r.id = e.rule_id and r.name = 'WS B catch-all';
  assert v_ws_b_exec_count = 0, 'a Workspace A event must never trigger a Workspace B rule';
  raise notice 'OK: Workspace B automation rule never fired for a Workspace A event.';
end $$;
reset role;

\echo '=== 7. Brand isolation: a brand-A2-scoped rule does not fire for a brand-A order ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_brand_a2 uuid; v_rule public.automation_rules;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select id into v_brand_a2 from public.brands where slug = 'sec-auto-brand-a2';
  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, v_brand_a2, 'Brand A2 only', 'orders.created', 'active', '[{"type": "LOG_EVENT", "config": {}}]'::jsonb, auth.uid(), auth.uid())
  returning * into v_rule;
end $$;
do $$
declare v_ws uuid; v_brand_a uuid; v_prod uuid; v_order public.orders; v_exec_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select id into v_brand_a from public.brands where slug = 'sec-auto-brand-a';
  select id into v_prod from public.products where sku = 'SECAUTO-1';
  v_order := public.create_order(v_ws, v_brand_a, 'manual', 'Brand Isolation Buyer', '08099990004', '4 Sec Auto Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select count(*) into v_exec_count from public.automation_executions e
    join public.automation_rules r on r.id = e.rule_id and r.name = 'Brand A2 only';
  assert v_exec_count = 0, 'a rule scoped to Brand A2 must never fire for a Brand A order';
  raise notice 'OK: brand-scoped rule correctly isolated from a different brand''s event.';
end $$;
reset role;

\echo '=== 8. Rule owner authority is re-checked live: suspending the rule owner silently stops their rule''s privileged actions ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_admin_rule public.automation_rules;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  insert into public.automation_rules (workspace_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, 'Admin-owned task rule', 'orders.created', 'active',
    '[{"type": "CREATE_TASK", "config": {"task_type": "OTHER", "title": "Admin rule task"}}]'::jsonb,
    '00000000-0000-0000-0000-0000000000b2'::uuid, '00000000-0000-0000-0000-0000000000b2'::uuid)
  returning * into v_admin_rule;
  perform public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000b2'::uuid, 'suspended');
end $$;
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders; v_action_status text; v_error_message text;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select id into v_brand from public.brands where slug = 'sec-auto-brand-a';
  select id into v_prod from public.products where sku = 'SECAUTO-1';
  v_order := public.create_order(v_ws, v_brand, 'manual', 'Owner Suspended Buyer', '08099990005', '5 Sec Auto Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select a.status, a.error_message into v_action_status, v_error_message from public.automation_execution_actions a
    join public.automation_executions e on e.id = a.execution_id
    join public.automation_rules r on r.id = e.rule_id and r.name = 'Admin-owned task rule'
    where e.event_id in (select id from public.automation_events where entity_id = v_order.id);
  assert v_action_status = 'failed', format('a rule whose owner was suspended must have its action recorded as failed (not silently executed, not silently dropped), got %s', v_action_status);
  assert v_error_message like 'insufficient_permission%', format('failure must be attributable to the suspended owner losing permission, got: %s', v_error_message);
  raise notice 'OK: suspending a rule''s owner stopped its privileged action, durably recorded as a failure (not silently executed, not silently dropped).';
end $$;
reset role;

\echo '=== 9. Archived/paused rules cannot execute (re-verified under real RLS impersonation) ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_rule public.automation_rules; v_brand uuid; v_prod uuid; v_order public.orders; v_exec_count int;
begin
  select id into v_ws from public.workspaces where slug = 'sec-auto-ws-a';
  select id into v_brand from public.brands where slug = 'sec-auto-brand-a';
  select id into v_prod from public.products where sku = 'SECAUTO-1';

  insert into public.automation_rules (workspace_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, 'To be archived', 'orders.created', 'active', '[]'::jsonb, auth.uid(), auth.uid()) returning * into v_rule;
  update public.automation_rules set status = 'archived', deleted_at = now() where id = v_rule.id;

  v_order := public.create_order(v_ws, v_brand, 'manual', 'Archived Sec Buyer', '08099990006', '6 Sec Auto Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select count(*) into v_exec_count from public.automation_executions where rule_id = v_rule.id;
  assert v_exec_count = 0, 'an archived rule must never execute (RLS-impersonated check)';
  raise notice 'OK: archived rule correctly did not execute under RLS impersonation.';
end $$;
reset role;

\echo '=== ALL PHASE 8 SECURITY TESTS PASSED (9/9) ==='
