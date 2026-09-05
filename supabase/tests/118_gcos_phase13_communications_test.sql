-- ============================================================
-- GCOS Phase 13 — Communications production completion smoke test.
-- Run against a freshly migrated 0001-0034 database with
-- grant_authenticated.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws_a uuid; v_ws_b uuid; v_brand_a uuid; v_brand_b uuid;
  v_owner_role uuid; v_manager_role uuid; v_cs_role uuid; v_wh_role uuid; v_marketing_role uuid;
  v_prod uuid; v_customer uuid;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000d1', 'owner-p13@test.local'),
    ('00000000-0000-0000-0000-0000000000d2', 'manager-p13@test.local'),
    ('00000000-0000-0000-0000-0000000000d3', 'cs-p13@test.local'),
    ('00000000-0000-0000-0000-0000000000d4', 'wh-p13@test.local'),
    ('00000000-0000-0000-0000-0000000000d5', 'marketing-p13@test.local'),
    ('00000000-0000-0000-0000-0000000000d6', 'ownerb-p13@test.local');

  insert into public.workspaces (name, slug, country_code, currency_code, timezone, created_by)
    values ('P13 WS A', 'p13-ws-a', 'NG', 'NGN', 'Africa/Lagos', '00000000-0000-0000-0000-0000000000d1') returning id into v_ws_a;
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('P13 WS B', 'p13-ws-b', 'KE', 'KES', '00000000-0000-0000-0000-0000000000d6') returning id into v_ws_b;

  insert into public.brands (workspace_id, name, slug, email_sender_name, email_sender_address, created_by)
    values (v_ws_a, 'P13 Brand A', 'p13-brand-a', 'P13 Store', 'orders@p13.test', '00000000-0000-0000-0000-0000000000d1') returning id into v_brand_a;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_b, 'P13 Brand B', 'p13-brand-b', '00000000-0000-0000-0000-0000000000d6') returning id into v_brand_b;

  select id into v_owner_role from public.roles where workspace_id is null and slug = 'owner';
  select id into v_manager_role from public.roles where workspace_id is null and slug = 'manager';
  select id into v_cs_role from public.roles where workspace_id is null and slug = 'customer-support';
  select id into v_wh_role from public.roles where workspace_id is null and slug = 'warehouse-staff';
  select id into v_marketing_role from public.roles where workspace_id is null and slug = 'marketing';

  insert into public.user_roles (user_id, workspace_id, role_id) values
    ('00000000-0000-0000-0000-0000000000d1', v_ws_a, v_owner_role),
    ('00000000-0000-0000-0000-0000000000d2', v_ws_a, v_manager_role),
    ('00000000-0000-0000-0000-0000000000d3', v_ws_a, v_cs_role),
    ('00000000-0000-0000-0000-0000000000d4', v_ws_a, v_wh_role),
    ('00000000-0000-0000-0000-0000000000d5', v_ws_a, v_marketing_role),
    ('00000000-0000-0000-0000-0000000000d6', v_ws_b, v_owner_role);

  insert into public.products (workspace_id, brand_id, name, slug, sku, selling_price, cost_price, status, created_by, updated_by)
    values (v_ws_a, v_brand_a, 'P13 Product', 'p13-product', 'P13-1', 8000, 3000, 'active', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1')
    returning id into v_prod;

  raise notice 'P13_WS_A=%, P13_BRAND_A=%, P13_WS_B=%, P13_PROD=%', v_ws_a, v_brand_a, v_ws_b, v_prod;
end $$;

\echo '=== 1. Owner configures email provider; provider secrets never selectable directly ==='
do $$
declare v_brand uuid; v_count int;
begin
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
  set role authenticated;
  perform public.set_brand_communication_config(v_brand, 'resend_test_key_abc');
  select count(*) into v_count from public.brand_communication_secrets where brand_id = v_brand;
  reset role;
  assert v_count = 0, format('brand_communication_secrets has zero client-facing SELECT policies by design — expected 0 rows visible, got %s', v_count);
  raise notice 'OK 1: email provider configured; brand_communication_secrets correctly invisible to direct client select.';
end $$;

\echo '=== 2. Anonymous caller cannot call any new Phase 13 privileged RPC ==='
do $$
declare v_brand uuid; v_order_id uuid; v_denied1 boolean := false; v_denied2 boolean := false; v_denied3 boolean := false;
begin
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  perform set_config('app.test_user_id', '', false);
  set role anon;
  begin
    perform public.upsert_communication_template((select id from public.workspaces where slug = 'p13-ws-a'), v_brand, 'x', 'X', 'email', 'hi', 'hi');
  exception when others then v_denied1 := true; end;
  begin
    perform public.test_communication_provider(v_brand, 'email', 'me@example.com');
  exception when others then v_denied2 := true; end;
  begin
    perform public.send_manual_communication('00000000-0000-0000-0000-000000000000'::uuid, 'email', null, 'hi', 'hi');
  exception when others then v_denied3 := true; end;
  reset role;
  assert v_denied1, 'anon must not be able to upsert a communication template';
  assert v_denied2, 'anon must not be able to test a provider';
  assert v_denied3, 'anon must not be able to send a manual communication';
  raise notice 'OK 2: anonymous caller denied on all three new privileged RPCs.';
end $$;

\echo '=== 3. Template resolution precedence: brand > workspace > system ==='
do $$
declare v_ws uuid; v_brand uuid; v_rendered record;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';

  select subject, body, template_found into v_rendered
    from public.render_communication_template(v_ws, v_brand, 'order_confirmation', 'email', jsonb_build_object('customer_name', 'Ada', 'order_number', 'GC-1'));
  assert v_rendered.template_found, 'system template must resolve when no override exists';
  assert v_rendered.body like '%Ada%', format('expected rendered body to contain Ada, got %s', v_rendered.body);

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
  perform public.upsert_communication_template(v_ws, null, 'order_confirmation', 'WS Override', 'email', 'WS subject', 'WS BODY {{customer_name}}');
  select subject, body, template_found into v_rendered
    from public.render_communication_template(v_ws, v_brand, 'order_confirmation', 'email', jsonb_build_object('customer_name', 'Ada'));
  assert v_rendered.body = 'WS BODY Ada', format('expected workspace override to win over system default, got %s', v_rendered.body);

  perform public.upsert_communication_template(v_ws, v_brand, 'order_confirmation', 'Brand Override', 'email', 'Brand subject', 'BRAND BODY {{customer_name}}');
  select subject, body, template_found into v_rendered
    from public.render_communication_template(v_ws, v_brand, 'order_confirmation', 'email', jsonb_build_object('customer_name', 'Ada'));
  assert v_rendered.body = 'BRAND BODY Ada', format('expected brand override to win over workspace override, got %s', v_rendered.body);

  raise notice 'OK 3: brand > workspace > system precedence confirmed.';
end $$;

\echo '=== 4. Manager (templates.manage) can manage templates; Customer Support (view-only) cannot ==='
do $$
declare v_ws uuid; v_brand uuid; v_denied boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d2', false);
  set role authenticated;
  perform public.upsert_communication_template(v_ws, v_brand, 'manager_test', 'Manager Test', 'email', 'S', 'B');
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d3', false);
  set role authenticated;
  begin
    perform public.upsert_communication_template(v_ws, v_brand, 'cs_test', 'CS Test', 'email', 'S', 'B');
  exception when others then
    v_denied := true;
  end;
  perform public.list_communication_templates(v_ws, v_brand); -- CS has templates.view, must succeed
  reset role;

  assert v_denied, 'Customer Support (no communications.templates.manage) must not be able to create a template';
  raise notice 'OK 4: Manager can manage templates, Customer Support is correctly restricted to view.';
end $$;

\echo '=== 5. Warehouse Staff has zero communications access ==='
do $$
declare v_ws uuid; v_brand uuid; v_denied1 boolean := false; v_denied2 boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d4', false);
  set role authenticated;
  begin
    perform public.list_communication_templates(v_ws, v_brand);
  exception when others then v_denied1 := true; end;
  begin
    perform public.test_communication_provider(v_brand, 'email', 'wh@test.local');
  exception when others then v_denied2 := true; end;
  reset role;
  assert v_denied1, 'Warehouse Staff must not see communication templates';
  assert v_denied2, 'Warehouse Staff must not be able to test a communication provider';
  raise notice 'OK 5: Warehouse Staff correctly denied all communications access.';
end $$;

\echo '=== 6. Order-triggered SEND_EMAIL with template_key + {{customer_email}} token renders and queues correctly ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  select id into v_prod from public.products where slug = 'p13-product';

  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, v_brand, 'P13 order confirmation email', 'orders.created', 'active',
    jsonb_build_array(jsonb_build_object('type', 'SEND_EMAIL', 'config', jsonb_build_object('recipient', '{{customer_email}}', 'template_key', 'order_confirmation'))),
    '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1');

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
  v_order := public.create_order(v_ws, v_brand, 'manual', 'P13 Buyer', '08011119999', '1 Comms Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.orders set customer_email = 'buyer@p13.test' where id = v_order.id;

  -- customer_email was set AFTER create_order fired the orders.created
  -- event, so re-fire it to exercise the resolved-recipient path
  -- deterministically within this test (process_automation_event is
  -- idempotent per rule/event via automation_executions' own
  -- unique(event_id, rule_id), so a second real order is used instead
  -- of re-processing the same event).
  update public.orders set customer_email = null where id = v_order.id;

  v_order := public.create_order(v_ws, v_brand, 'manual', 'P13 Buyer 2', '08011118888', '2 Comms Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.orders set customer_email = 'buyer2@p13.test' where id = v_order.id;
  delete from public.communication_log where entity_id = v_order.id;
  perform public.process_automation_event((select id from public.automation_events where entity_id = v_order.id and event_type = 'orders.created'));

  select * into v_row from public.communication_log where entity_id = v_order.id and communication_type = 'SEND_EMAIL';
  assert found, 'expected a communication_log row queued for the order-confirmation rule';
  assert v_row.recipient = 'buyer2@p13.test', format('expected {{customer_email}} to resolve to the order''s own customer_email, got %s', v_row.recipient);
  assert v_row.status = 'queued', format('expected status=queued (email is configured for this brand), got %s', v_row.status);
  assert v_row.body like '%P13 Buyer 2%', format('expected the rendered template to include the customer name, got %s', v_row.body);
  assert v_row.is_transactional, 'an order-confirmation email must default to transactional';
  raise notice 'OK 6: template_key + {{customer_email}} resolution + rendering all correct.';
end $$;

\echo '=== 7. Invalid SMS recipient is never queued — permanently_failed instead ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  select id into v_prod from public.products where slug = 'p13-product';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
  perform public.set_brand_communication_config(v_brand, null, 'twilio', 'AC123:authtoken', '+15550001111');

  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, v_brand, 'P13 SMS bad recipient', 'orders.created', 'active',
    jsonb_build_array(jsonb_build_object('type', 'SEND_SMS', 'config', jsonb_build_object('recipient', 'not-a-phone-number', 'body', 'hi'))),
    '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1');

  v_order := public.create_order(v_ws, v_brand, 'manual', 'P13 Buyer 3', '08011117777', '3 Comms Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select * into v_row from public.communication_log where entity_id = v_order.id and channel = 'sms';
  assert found, 'expected a communication_log row for the bad-recipient SMS rule';
  assert v_row.status = 'permanently_failed', format('expected permanently_failed for an unnormalizable recipient, got %s', v_row.status);
  assert v_row.failure_category = 'client_error', format('expected failure_category=client_error, got %s', v_row.failure_category);
  raise notice 'OK 7: invalid SMS recipient never queued, recorded permanently_failed honestly.';
end $$;

\echo '=== 8. Valid SMS recipient normalizes correctly and queues ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  select id into v_prod from public.products where slug = 'p13-product';

  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, v_brand, 'P13 SMS good recipient', 'orders.created', 'active',
    jsonb_build_array(jsonb_build_object('type', 'SEND_SMS', 'config', jsonb_build_object('recipient', '{{customer_phone}}', 'body', 'Hi {{customer_name}}'))),
    '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1');

  v_order := public.create_order(v_ws, v_brand, 'manual', 'P13 Buyer 4', '08011116666', '4 Comms Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select * into v_row from public.communication_log where entity_id = v_order.id and channel = 'sms' and recipient like '234%';
  assert found, format('expected a queued SMS with an NG-normalized recipient (234...), none found for order %s', v_order.id);
  assert v_row.status = 'queued', format('expected status=queued, got %s', v_row.status);
  raise notice 'OK 8: valid recipient normalized to 234-prefixed NG number and queued.';
end $$;

\echo '=== 9. Marketing send to an opted-out customer is skipped_preference; transactional bypasses the same flag ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders; v_row record;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  select id into v_prod from public.products where slug = 'p13-product';

  v_order := public.create_order(v_ws, v_brand, 'manual', 'P13 Buyer 5', '08011115555', '5 Comms Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.customers set email_opt_in = false where id = v_order.customer_id;
  update public.orders set customer_email = 'optedout@p13.test' where id = v_order.id;

  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values
    (v_ws, v_brand, 'P13 marketing email', 'orders.status_changed', 'active',
      jsonb_build_array(jsonb_build_object('type', 'SEND_EMAIL', 'config', jsonb_build_object('recipient', '{{customer_email}}', 'subject', 'Offer', 'body', 'Buy more!', 'is_transactional', false))),
      '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1'),
    (v_ws, v_brand, 'P13 transactional email', 'orders.status_changed', 'active',
      jsonb_build_array(jsonb_build_object('type', 'SEND_EMAIL', 'config', jsonb_build_object('recipient', '{{customer_email}}', 'subject', 'Status update', 'body', 'Your order status changed'))),
      '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1');

  update public.orders set status = 'PENDING' where id = v_order.id;

  select * into v_row from public.communication_log where entity_id = v_order.id and subject = 'Offer';
  assert found, 'expected a communication_log row for the marketing rule';
  assert v_row.status = 'skipped_preference', format('expected skipped_preference for an opted-out marketing send, got %s', v_row.status);

  select * into v_row from public.communication_log where entity_id = v_order.id and subject = 'Status update';
  assert found, 'expected a communication_log row for the transactional rule';
  assert v_row.status = 'queued', format('expected the transactional send to bypass the opt-out and queue, got %s', v_row.status);

  raise notice 'OK 9: marketing consent enforced; transactional communication correctly bypasses the marketing opt-out.';
end $$;

\echo '=== 10. Manual communication (Contact Customer): Customer Support can send, resolves recipient server-side from order id only ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_order public.orders; v_row public.communication_log;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  select id into v_prod from public.products where slug = 'p13-product';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
  v_order := public.create_order(v_ws, v_brand, 'manual', 'P13 Buyer 6', '08011114444', '6 Comms Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.orders set customer_email = 'manual6@p13.test' where id = v_order.id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d3', false);
  set role authenticated;
  v_row := public.send_manual_communication(v_order.id, 'email', null, 'A note from us', 'We wanted to check in about your order.');
  reset role;

  assert v_row.recipient = 'manual6@p13.test', format('expected recipient resolved server-side from the order, got %s', v_row.recipient);
  assert v_row.triggered_by = 'manual', 'manual send must be tagged triggered_by=manual';
  assert v_row.is_transactional, 'a manual staff-initiated contact is always transactional';
  assert v_row.created_by = '00000000-0000-0000-0000-0000000000d3', 'created_by must record the sending staff member';
  raise notice 'OK 10: Customer Support successfully sent a manual communication, recipient resolved server-side.';
end $$;

\echo '=== 11. Manual send throttle: a 4th send within 5 minutes for the same order/channel/staff is rejected ==='
do $$
declare v_ws uuid; v_brand uuid; v_order public.orders; v_prod uuid; v_denied boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  select id into v_prod from public.products where slug = 'p13-product';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
  v_order := public.create_order(v_ws, v_brand, 'manual', 'P13 Buyer 7', '08011113333', '7 Comms Street',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
  update public.orders set customer_email = 'manual7@p13.test' where id = v_order.id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d3', false);
  set role authenticated;
  perform public.send_manual_communication(v_order.id, 'email', null, 'Note 1', 'body 1');
  perform public.send_manual_communication(v_order.id, 'email', null, 'Note 2', 'body 2');
  perform public.send_manual_communication(v_order.id, 'email', null, 'Note 3', 'body 3');
  begin
    perform public.send_manual_communication(v_order.id, 'email', null, 'Note 4', 'body 4');
  exception when others then
    v_denied := true;
  end;
  reset role;
  assert v_denied, 'a 4th manual send to the same order/channel within 5 minutes must be rejected as abuse protection';
  raise notice 'OK 11: manual-send abuse throttle correctly rejects rapid repeated sends.';
end $$;

\echo '=== 12. Cross-workspace order id is rejected — Workspace B owner cannot manually message a Workspace A order ==='
do $$
declare v_order_a uuid; v_denied boolean := false;
begin
  select id into v_order_a from public.orders where customer_email = 'manual6@p13.test';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d6', false);
  set role authenticated;
  begin
    perform public.send_manual_communication(v_order_a, 'email', null, 'hack', 'hack');
  exception when others then
    v_denied := true;
  end;
  reset role;
  assert v_denied, 'a Workspace B owner must never be able to send a manual communication against a Workspace A order';
  raise notice 'OK 12: cross-workspace manual-send attempt correctly denied.';
end $$;

\echo '=== 13. Test Connection: sends only to the explicit recipient supplied, never a customer looked up from any table ==='
do $$
declare v_brand uuid; v_row public.communication_log; v_denied boolean := false;
begin
  select id into v_brand from public.brands where slug = 'p13-brand-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d1', false);
  set role authenticated;
  v_row := public.test_communication_provider(v_brand, 'email', 'admin-self-test@p13.test');
  reset role;
  assert v_row.recipient = 'admin-self-test@p13.test', 'test connection must send exactly to the admin-supplied recipient';
  assert v_row.communication_type = 'TEST_CONNECTION', 'test message must be clearly identified as a test';
  assert v_row.triggered_by = 'manual', 'a test send is a manual/system action, never attributed to automation';

  -- Manager holds communications.send but not communications.manage —
  -- test connection (a credential-adjacent action) must still require manage.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d2', false);
  set role authenticated;
  begin
    perform public.test_communication_provider(v_brand, 'email', 'x@x.com');
  exception when others then
    v_denied := true;
  end;
  reset role;
  assert v_denied, 'Manager (communications.send only, not communications.manage) must not be able to test-send a provider';
  raise notice 'OK 13: test connection correctly scoped to an explicit recipient and gated by communications.manage.';
end $$;

\echo '=== 14. communication_log RLS: a caller with only automation.view (no communications.view) cannot read it directly ==='
do $$
declare v_ws uuid; v_no_comm_role uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'p13-ws-a';
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d7', 'automation-only-p13@test.local');
  insert into public.roles (workspace_id, name, slug, description) values (v_ws, 'P13 Automation Only', 'p13-automation-only', 'test role')
    returning id into v_no_comm_role;
  insert into public.role_permissions (role_id, permission_id)
    select v_no_comm_role, p.id from public.permissions p where p.slug = 'automation.view';
  insert into public.user_roles (user_id, workspace_id, role_id) values ('00000000-0000-0000-0000-0000000000d7', v_ws, v_no_comm_role);

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000d7', false);
  set role authenticated;
  select count(*) into v_count from public.communication_log where workspace_id = v_ws;
  reset role;
  assert v_count = 0, format('a caller holding only automation.view must not see communication_log rows via direct select, saw %s', v_count);
  raise notice 'OK 14: communication_log RLS correctly requires communications.view/integrations.view, not merely automation.view.';
end $$;

\echo '=== 15. Zero-data: a workspace with no templates configured still resolves system defaults, never errors ==='
do $$
declare v_row record;
begin
  select subject, body, template_found into v_row
    from public.render_communication_template((select id from public.workspaces where slug = 'p13-ws-b'), (select id from public.brands where slug = 'p13-brand-b'), 'order_confirmation', 'email', '{}'::jsonb);
  assert v_row.template_found, 'Workspace B (no overrides at all) must still resolve the system default template';

  select subject, body, template_found into v_row
    from public.render_communication_template((select id from public.workspaces where slug = 'p13-ws-b'), (select id from public.brands where slug = 'p13-brand-b'), 'no_such_key', 'email', '{}'::jsonb);
  assert not v_row.template_found, 'a genuinely missing template key must return template_found=false, never an exception';
  raise notice 'OK 15: zero-data template resolution behaves honestly (system fallback, or template_found=false).';
end $$;

\echo '=== ALL PHASE 13 COMMUNICATIONS TESTS PASSED ==='
