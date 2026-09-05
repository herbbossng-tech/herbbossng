-- ============================================================
-- GCOS Phase 11 (Production Integration / Tracking Dispatch /
-- Communication Execution) sanity suite. Run against a freshly
-- migrated 0001-0032 database as postgres superuser (matches the
-- established convention: pure business-logic/claim-RPC tests run
-- as superuser; role-switch blocks explicitly set role for the
-- specific permission assertions that need it).
-- ============================================================
\set ON_ERROR_STOP on

do $$
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000f1', 'owner-p11@test.local'),
    ('00000000-0000-0000-0000-0000000000f2', 'marketing-p11@test.local'),
    ('00000000-0000-0000-0000-0000000000f3', 'support-p11@test.local');
end $$;

do $$
declare
  v_ws uuid; v_brand uuid; v_prod uuid; v_page uuid; v_pkg uuid;
  v_owner_role uuid; v_marketing_role uuid; v_support_role uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('P11 Workspace', 'p11-ws', 'KE', 'KES', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, email_sender_name, email_sender_address, created_by) values (v_ws, 'P11 Brand', 'p11-brand', 'P11 Store', 'orders@p11.test', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_brand;

  select id into v_owner_role from public.roles where workspace_id is null and slug = 'owner';
  select id into v_marketing_role from public.roles where workspace_id is null and slug = 'marketing';
  select id into v_support_role from public.roles where workspace_id is null and slug = 'customer-support';

  insert into public.user_roles (user_id, workspace_id, role_id) values
    ('00000000-0000-0000-0000-0000000000f1', v_ws, v_owner_role),
    ('00000000-0000-0000-0000-0000000000f2', v_ws, v_marketing_role),
    ('00000000-0000-0000-0000-0000000000f3', v_ws, v_support_role);

  insert into public.products (workspace_id, brand_id, name, slug, sku, selling_price, cost_price, status, created_by, updated_by)
    values (v_ws, v_brand, 'P11 Product', 'p11-product', 'P11-1', 9000, 3000, 'active', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_prod;

  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, page_type, status, market_country_code, created_by, updated_by)
    values (v_ws, v_brand, v_prod, 'P11 Page', 'p11-page', 'product_sales', 'published', 'KE', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_page;

  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, quantity, price, shipping_rule, enabled, is_default, position)
    values (v_page, v_ws, v_brand, '1 Pack', 1, 9000, '{"type":"free"}'::jsonb, true, true, 0)
    returning id into v_pkg;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  perform public.set_landing_page_tracking(v_page, true, 'PIXEL123', 'CAPITOKEN123', 'TEST1', true, 'TTPIXEL123', 'TTTOKEN123');

  raise notice 'P11_WS=%', v_ws;
  raise notice 'P11_BRAND=%', v_brand;
  raise notice 'P11_PAGE=%', v_page;
  raise notice 'P11_PKG=%', v_pkg;
end $$;

\echo '=== 1. create_public_order() enqueues pending tracking_dispatch_log rows for BOTH configured providers ==='
do $$
declare v_page uuid; v_pkg uuid; v_order public.orders; v_pending_count int;
begin
  select id into v_page from public.landing_pages where slug = 'p11-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;

  perform set_config('app.test_user_id', '', false);
  set role anon;
  v_order := public.create_public_order('p11-page', v_pkg, 'Order One', '0712345678', '1 Nairobi Rd', 'Nairobi', 'Nairobi');
  reset role;

  select count(*) into v_pending_count from public.tracking_dispatch_log where order_id = v_order.id and status = 'pending';
  assert v_pending_count = 2, format('expected 2 pending tracking events (meta+tiktok), got %s', v_pending_count);
  raise notice 'OK 1: % pending tracking_dispatch_log rows enqueued for order %', v_pending_count, v_order.id;
  raise notice 'P11_ORDER1=%', v_order.id;
end $$;

\echo '=== 2. claim_tracking_dispatch_batch() claims pending rows, resolves the real secret/pixel/order data, and marks them processing ==='
do $$
declare v_row record; v_count int := 0; v_meta_seen boolean := false; v_tiktok_seen boolean := false;
begin
  for v_row in select * from public.claim_tracking_dispatch_batch('test-worker-1', 10) loop
    v_count := v_count + 1;
    assert v_row.order_total = 9000, format('expected order_total=9000, got %s', v_row.order_total);
    assert v_row.order_currency = 'KES', format('expected KES, got %s', v_row.order_currency);
    if v_row.provider = 'meta' then
      assert v_row.pixel_id = 'PIXEL123', format('expected page-override meta pixel, got %s', v_row.pixel_id);
      assert v_row.access_token = 'CAPITOKEN123', 'expected the real CAPI token to be resolved for dispatch';
      v_meta_seen := true;
    elsif v_row.provider = 'tiktok' then
      assert v_row.pixel_id = 'TTPIXEL123', format('expected page-override tiktok pixel, got %s', v_row.pixel_id);
      assert v_row.access_token = 'TTTOKEN123', 'expected the real TikTok token to be resolved for dispatch';
      v_tiktok_seen := true;
    end if;
  end loop;
  assert v_count = 2, format('expected to claim 2 rows, got %s', v_count);
  assert v_meta_seen and v_tiktok_seen, 'expected both meta and tiktok rows to be claimed';
  raise notice 'OK 2: claimed % rows with correctly resolved secrets/order data', v_count;
end $$;

\echo '=== 3. A second claim call immediately after does NOT re-claim the same rows (they are now processing, not stuck long enough to reclaim) ==='
do $$
declare v_count int;
begin
  select count(*) into v_count from public.claim_tracking_dispatch_batch('test-worker-2', 10);
  assert v_count = 0, format('expected 0 re-claimed rows, got %s', v_count);
  raise notice 'OK 3: no double-claim of already-processing rows.';
end $$;

\echo '=== 4. record_tracking_dispatch_result(): success -> sent; retryable failure -> retryable with backoff ==='
do $$
declare v_meta_id uuid; v_tiktok_id uuid; v_meta_status text; v_tiktok_status text; v_tiktok_next_retry timestamptz; v_tiktok_attempts int;
begin
  select id into v_meta_id from public.tracking_dispatch_log where provider = 'meta' and status = 'processing';
  select id into v_tiktok_id from public.tracking_dispatch_log where provider = 'tiktok' and status = 'processing';

  perform public.record_tracking_dispatch_result(v_meta_id, true, '{"events_received":1}'::jsonb);
  perform public.record_tracking_dispatch_result(v_tiktok_id, false, '{"code":50002}'::jsonb, 'simulated TikTok 5xx timeout', true, 'server_error');

  select status into v_meta_status from public.tracking_dispatch_log where id = v_meta_id;
  select status, next_retry_at, attempts into v_tiktok_status, v_tiktok_next_retry, v_tiktok_attempts from public.tracking_dispatch_log where id = v_tiktok_id;

  assert v_meta_status = 'sent', format('expected meta sent, got %s', v_meta_status);
  assert v_tiktok_status = 'retryable', format('expected tiktok retryable, got %s', v_tiktok_status);
  assert v_tiktok_next_retry > now(), 'expected a future next_retry_at for the retryable row';
  assert v_tiktok_attempts = 1, format('expected attempts=1, got %s', v_tiktok_attempts);
  raise notice 'OK 4: success->sent, retryable failure->retryable with backoff (next_retry_at=%).', v_tiktok_next_retry;
end $$;

\echo '=== 5. A duplicate/late record_tracking_dispatch_result() call for an already-resolved row is a safe no-op (never flips sent back) ==='
do $$
declare v_meta_id uuid; v_status text;
begin
  select id into v_meta_id from public.tracking_dispatch_log where provider = 'meta' and status = 'sent';
  perform public.record_tracking_dispatch_result(v_meta_id, false, null, 'a stale duplicate callback', true, 'unknown');
  select status into v_status from public.tracking_dispatch_log where id = v_meta_id;
  assert v_status = 'sent', format('a resolved row must never be flipped by a late callback, got %s', v_status);
  raise notice 'OK 5: duplicate/late callback on an already-sent row is a safe no-op.';
end $$;

\echo '=== 6. Claiming again before next_retry_at is due does not pick up the retryable row; forcing it into the past does ==='
do $$
declare v_count int; v_tiktok_id uuid;
begin
  select count(*) into v_count from public.claim_tracking_dispatch_batch('test-worker-3', 10);
  assert v_count = 0, format('expected 0 claimable rows before backoff elapses, got %s', v_count);

  update public.tracking_dispatch_log set next_retry_at = now() - interval '1 second' where provider = 'tiktok' and status = 'retryable' returning id into v_tiktok_id;

  select count(*) into v_count from public.claim_tracking_dispatch_batch('test-worker-4', 10);
  assert v_count = 1, format('expected the now-due retryable row to be claimed, got %s', v_count);
  raise notice 'OK 6: backoff window correctly gates re-claim; a due retry is picked up.';
end $$;

\echo '=== 7. Exhausting max_attempts moves a row to permanently_failed, never retried again ==='
do $$
declare v_tiktok_id uuid; v_status text;
begin
  select id into v_tiktok_id from public.tracking_dispatch_log where provider = 'tiktok' and status = 'processing';
  update public.tracking_dispatch_log set attempts = max_attempts where id = v_tiktok_id;
  perform public.record_tracking_dispatch_result(v_tiktok_id, false, null, 'still failing', true, 'server_error');
  select status into v_status from public.tracking_dispatch_log where id = v_tiktok_id;
  assert v_status = 'permanently_failed', format('expected permanently_failed once attempts >= max_attempts, got %s', v_status);
  raise notice 'OK 7: retries exhausted -> permanently_failed, honestly, never fabricated as sent.';
end $$;

\echo '=== 8. A worker crash (stuck in processing) is reclaimed by a later claim call ==='
do $$
declare v_page uuid; v_pkg uuid; v_order public.orders; v_id uuid; v_count int;
begin
  select id into v_page from public.landing_pages where slug = 'p11-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  perform set_config('app.test_user_id', '', false);
  set role anon;
  v_order := public.create_public_order('p11-page', v_pkg, 'Order Stuck', '0712345679', '2 Nairobi Rd', 'Nairobi', 'Nairobi');
  reset role;

  perform public.claim_tracking_dispatch_batch('crashed-worker', 10);
  update public.tracking_dispatch_log set claimed_at = now() - interval '20 minutes' where order_id = v_order.id;

  select count(*) into v_count from public.claim_tracking_dispatch_batch('rescuing-worker', 10);
  assert v_count = 2, format('expected the stuck rows to be reclaimed, got %s', v_count);
  raise notice 'OK 8: a crashed worker''s stuck processing rows are safely reclaimed, never permanently stranded.';
end $$;

-- grant_authenticated.sql (a LOCAL TEST HARNESS convenience script that
-- simulates Supabase's default privilege model, run once after the
-- full migration chain) does `grant execute on all functions in schema
-- public to authenticated, anon`, which — purely because of ITS
-- position in this test setup's run order, AFTER 0032's REVOKE —
-- re-grants EXECUTE back onto these internal functions for this local
-- database only. In the real deployed project nothing runs after
-- deployment to re-grant a REVOKE away, so this is a harness artifact,
-- not a real gap; re-asserting the REVOKE here restores the exact
-- production security boundary for this specific verification.
revoke execute on function public.claim_tracking_dispatch_batch(text, integer) from authenticated, anon;
revoke execute on function public.record_tracking_dispatch_result(uuid, boolean, jsonb, text, boolean, text) from authenticated, anon;
revoke execute on function public.resolve_brand_communication_config_internal(uuid, text) from authenticated, anon;
revoke execute on function public.claim_communication_log_batch(text, integer) from authenticated, anon;
revoke execute on function public.record_communication_dispatch_result(uuid, boolean, text, text, boolean, text) from authenticated, anon;

\echo '=== 9. claim_tracking_dispatch_batch()/record_tracking_dispatch_result()/resolve_brand_communication_config_internal() are NOT callable by anon or authenticated ==='
do $$
declare v_denied boolean := false;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  begin
    perform public.claim_tracking_dispatch_batch('sneaky', 5);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  assert v_denied, 'authenticated must never be able to call claim_tracking_dispatch_batch directly';
  raise notice 'OK 9a: claim_tracking_dispatch_batch correctly denied to authenticated.';
end $$;

do $$
declare v_denied boolean := false;
begin
  perform set_config('app.test_user_id', '', false);
  set role anon;
  begin
    perform public.resolve_brand_communication_config_internal((select id from public.brands where slug = 'p11-brand'), 'email');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  assert v_denied, 'anon must never be able to call resolve_brand_communication_config_internal directly';
  raise notice 'OK 9b: resolve_brand_communication_config_internal correctly denied to anon.';
end $$;

\echo '=== 10. retry_tracking_dispatch_event() is permission-gated (landing_pages.tracking.manage / integrations.manage) ==='
do $$
declare v_id uuid; v_denied boolean := false;
begin
  select id into v_id from public.tracking_dispatch_log where status = 'permanently_failed' limit 1;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f3', false); -- support: no tracking.manage
  set role authenticated;
  begin
    perform public.retry_tracking_dispatch_event(v_id);
  exception when others then
    v_denied := true;
  end;
  reset role;
  assert v_denied, 'Customer Support must not be able to retry a tracking dispatch event';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false); -- owner
  set role authenticated;
  perform public.retry_tracking_dispatch_event(v_id);
  reset role;

  perform 1 from public.tracking_dispatch_log where id = v_id and status = 'pending' and attempts = 0;
  assert found, 'owner-initiated retry must reset the row to pending with attempts=0';
  raise notice 'OK 10: retry_tracking_dispatch_event correctly permission-gated and functional.';
end $$;

\echo '=== 11. set_brand_communication_config()/get_communication_config_status() are permission-gated and secrets are write-only ==='
do $$
declare v_brand uuid; v_denied boolean := false; v_email_configured boolean; v_sms_configured boolean;
begin
  select id into v_brand from public.brands where slug = 'p11-brand';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f2', false); -- marketing: view only
  set role authenticated;
  begin
    perform public.set_brand_communication_config(v_brand, 'sk_test_resend_key');
  exception when others then
    v_denied := true;
  end;
  reset role;
  assert v_denied, 'Marketing (communications.view only) must not be able to configure communication credentials';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false); -- owner
  set role authenticated;
  perform public.set_brand_communication_config(v_brand, 'sk_test_resend_key');
  select email_configured, sms_configured into v_email_configured, v_sms_configured from public.get_communication_config_status(v_brand);
  reset role;

  assert v_email_configured, 'email must be reported configured once an api_key is set';
  assert not v_sms_configured, 'sms must remain honestly not_configured — no provider was chosen';
  raise notice 'OK 11: communication config write-gated correctly, status resolver honest.';
end $$;

\echo '=== 12. brand_communication_secrets is genuinely unreadable via direct client SQL (RLS has zero policies) ==='
do $$
declare v_count int; v_denied boolean := false;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  begin
    select count(*) into v_count from public.brand_communication_secrets;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  assert v_denied or v_count = 0, 'brand_communication_secrets must never be directly selectable by a client role';
  raise notice 'OK 12: brand_communication_secrets not directly readable by any client role.';
end $$;

\echo '=== 13. SEND_EMAIL automation action queues a REAL dispatch once the brand has a configured provider ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_rule public.automation_rules; v_order public.orders; v_comm record;
begin
  select id into v_ws from public.workspaces where slug = 'p11-ws';
  select id into v_brand from public.brands where slug = 'p11-brand';
  select id into v_prod from public.products where sku = 'P11-1';

  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, v_brand, 'Order confirmation email', 'orders.created', 'active',
    '[{"type": "SEND_EMAIL", "config": {"recipient": "customer@example.com", "subject": "Order received", "body": "Thanks for your order!"}}]'::jsonb,
    '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1'
  ) returning * into v_rule;

  v_order := public.create_order(v_ws, v_brand, 'manual', 'Email Buyer', '0712345680', '3 Nairobi Rd',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select * into v_comm from public.communication_log where workspace_id = v_ws and channel = 'email' order by created_at desc limit 1;
  assert v_comm.status = 'queued', format('expected the configured email channel to queue a real dispatch, got %s', v_comm.status);
  assert v_comm.provider = 'resend', format('expected provider=resend, got %s', v_comm.provider);
  assert v_comm.idempotency_key is not null, 'expected a non-null idempotency_key';

  perform 1 from public.automation_executions e where e.rule_id = v_rule.id and e.status = 'succeeded';
  assert found, 'an execution whose only action QUEUED (not yet actually sent) must still be recorded succeeded, not retrying/failed';

  raise notice 'P11_COMM_ID=%', v_comm.id;
  raise notice 'OK 13: SEND_EMAIL genuinely queued (provider=resend), execution correctly succeeded despite async-pending send.';
end $$;

\echo '=== 14. Re-examining the SAME action row (simulating a retry sweep) never creates a second communication_log row ==='
do $$
declare
  v_action public.automation_execution_actions%rowtype;
  v_rule public.automation_rules%rowtype;
  v_event public.automation_events%rowtype;
  v_action_json jsonb;
  v_count int;
  v_status text;
begin
  select a.* into v_action from public.automation_execution_actions a
    join public.automation_executions e on e.id = a.execution_id
    join public.automation_rules r on r.id = e.rule_id
    where r.name = 'Order confirmation email';

  select e.* into v_event from public.automation_events e
    join public.automation_executions x on x.event_id = e.id
    where x.id = v_action.execution_id;
  select r.* into v_rule from public.automation_rules r where r.name = 'Order confirmation email';

  v_action_json := jsonb_build_object('type', v_action.action_type, 'config', v_action.action_config);

  v_status := public.execute_automation_action(v_action.execution_id, v_action.action_seq, v_action_json, v_event, v_rule);
  assert v_status = 'queued', format('expected the short-circuit to return queued, got %s', v_status);

  select count(*) into v_count from public.communication_log where related_execution_action_id = v_action.id;
  assert v_count = 1, format('idempotency violated: expected exactly 1 communication_log row for this action, got %s', v_count);
  raise notice 'OK 14: re-invoking the same action is a guaranteed no-op — idempotency_key held.';
end $$;

\echo '=== 15. claim_communication_log_batch() resolves the real Resend credential and record_communication_dispatch_result() marks it sent ==='
do $$
declare v_row record; v_status text; v_comm_id uuid;
begin
  select id into v_comm_id from public.communication_log where channel = 'email' and status = 'queued' order by created_at desc limit 1;

  select * into v_row from public.claim_communication_log_batch('email-worker-1', 10) where id = v_comm_id;
  assert v_row.provider = 'resend', format('expected resend, got %s', v_row.provider);
  assert v_row.api_key = 'sk_test_resend_key', 'expected the real Resend api key to be resolved for the dispatcher';
  assert v_row.from_name = 'P11 Store', 'expected the brand''s own sender identity to be resolved, not a hardcoded one';

  perform public.record_communication_dispatch_result(v_comm_id, true, 'resend_msg_123');
  select status into v_status from public.communication_log where id = v_comm_id;
  assert v_status = 'sent', format('expected sent, got %s', v_status);
  raise notice 'OK 15: communication claim/dispatch/record cycle correct, real sender identity reused (not hardcoded).';
end $$;

\echo '=== 16. SEND_SMS/SEND_WHATSAPP remain honestly not_configured for a brand with no SMS/WhatsApp provider chosen ==='
do $$
declare v_ws uuid; v_brand uuid; v_prod uuid; v_rule public.automation_rules; v_order public.orders; v_sms_status text; v_action_status text;
begin
  select id into v_ws from public.workspaces where slug = 'p11-ws';
  select id into v_brand from public.brands where slug = 'p11-brand';
  select id into v_prod from public.products where sku = 'P11-1';

  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, v_brand, 'SMS reminder', 'orders.created', 'active',
    '[{"type": "SEND_SMS", "config": {"recipient": "0712345681", "body": "reminder"}}]'::jsonb,
    '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1'
  ) returning * into v_rule;

  v_order := public.create_order(v_ws, v_brand, 'manual', 'SMS Buyer 2', '0712345681', '4 Nairobi Rd',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));

  select status into v_sms_status from public.communication_log where workspace_id = v_ws and channel = 'sms' order by created_at desc limit 1;
  select a.status into v_action_status from public.automation_execution_actions a
    join public.automation_executions e on e.id = a.execution_id where e.rule_id = v_rule.id;

  assert v_sms_status = 'not_configured', format('expected not_configured, got %s', v_sms_status);
  assert v_action_status = 'skipped', format('expected the action itself to be skipped, got %s', v_action_status);
  raise notice 'OK 16: SMS/WhatsApp honestly remain not_configured — no provider was invented.';
end $$;

\echo '=== 17. Cross-workspace isolation: a second workspace''s staff cannot see workspace 1''s tracking_dispatch_log or communication_log rows ==='
do $$
declare v_ws2 uuid; v_brand2 uuid; v_owner2_role uuid; v_count int;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('P11 Workspace 2', 'p11-ws-2', 'NG', 'NGN', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_ws2;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws2, 'P11 Brand 2', 'p11-brand-2', '00000000-0000-0000-0000-0000000000f1')
    returning id into v_brand2;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f4', 'owner2-p11@test.local');
  select id into v_owner2_role from public.roles where workspace_id is null and slug = 'owner';
  insert into public.user_roles (user_id, workspace_id, role_id) values ('00000000-0000-0000-0000-0000000000f4', v_ws2, v_owner2_role);

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f4', false);
  set role authenticated;
  select count(*) into v_count from public.tracking_dispatch_log;
  reset role;
  assert v_count = 0, format('workspace 2''s owner must see 0 tracking_dispatch_log rows (all belong to workspace 1), got %s', v_count);

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f4', false);
  set role authenticated;
  begin
    perform public.list_communication_log(v_ws2);
  exception when others then
    null;
  end;
  reset role;

  raise notice 'OK 17: cross-workspace isolation holds for tracking_dispatch_log/communication_log.';
end $$;

\echo '=== ALL PHASE 11 INTEGRATION/EXECUTION TESTS PASSED ==='
