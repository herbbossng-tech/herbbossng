-- ============================================================
-- Phase 8 (Automation/Event Engine) CONCURRENCY test setup.
-- Creates the workspace/rule/order fixtures needed by the two
-- genuinely-parallel scenarios driven by run_concurrency_test.sh
-- (which spawns real concurrent psql processes — a single psql
-- script cannot exercise true concurrency). Local-only, not
-- committed. Run via setup_and_migrate.sh + grant_authenticated.sql
-- first, exactly like 109/110.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_ws uuid; v_brand uuid; v_owner_role uuid; v_prod uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Concurrency WS', 'conc-ws', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws;
  insert into public.brands (workspace_id, name, slug) values (v_ws, 'Concurrency Brand', 'conc-brand') returning id into v_brand;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000d1', 'owner-conc@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000d1', v_owner_role, v_ws);

  insert into public.products (workspace_id, brand_id, name, slug, sku, status, selling_price, cost_price, stock_quantity)
    values (v_ws, v_brand, 'Concurrency Product', 'conc-product', 'CONC-1', 'active', 5000, 2000, 50);
end $$;

select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;

do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders;
begin
  select id into v_ws from public.workspaces where slug = 'conc-ws';
  select id into v_brand from public.brands where slug = 'conc-brand';
  select id into v_prod from public.products where sku = 'CONC-1';

  insert into public.automation_rules (workspace_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, 'Concurrency CREATE_TASK rule', 'test.concurrency', 'active',
    '[{"type": "CREATE_TASK", "config": {"task_type": "OTHER", "title": "Race task"}}]'::jsonb,
    auth.uid(), auth.uid());

  v_order := public.create_order(v_ws, v_brand, 'manual', 'Concurrency Buyer', '08099990010', '10 Conc Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  raise notice 'CONC_ORDER_ID=%', v_order.id;
end $$;
reset role;

-- Scenario B fixture: a single PENDING automation_events row created
-- directly (bypassing emit_automation_event, which would process it
-- synchronously and close the race window) so two concurrent
-- process_automation_event() calls have a genuine pending event to
-- race over.
insert into public.automation_events (workspace_id, brand_id, event_type, entity_type, entity_id, payload, source, idempotency_key)
select w.id, b.id, 'test.concurrency', 'order', o.id, '{}'::jsonb, 'system', 'race-scenario-b-1'
from public.workspaces w
join public.brands b on b.workspace_id = w.id and b.slug = 'conc-brand'
join public.orders o on o.customer_name = 'Concurrency Buyer'
where w.slug = 'conc-ws';

select 'CONC_WS_ID=' || id::text from public.workspaces where slug = 'conc-ws';
select 'CONC_BRAND_ID=' || id::text from public.brands where slug = 'conc-brand';
select 'CONC_ORDER_ID=' || id::text from public.orders where customer_name = 'Concurrency Buyer';
select 'CONC_EVENT_B_ID=' || id::text from public.automation_events where idempotency_key = 'race-scenario-b-1';
