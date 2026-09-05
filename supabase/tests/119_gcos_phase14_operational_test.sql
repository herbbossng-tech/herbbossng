-- ============================================================
-- GCOS Phase 14 — Operational Intelligence & Worker Hardening
-- smoke test. Run against a freshly migrated 0001-0035 database
-- with grant_authenticated.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws_a uuid; v_ws_b uuid; v_brand_a uuid; v_brand_b uuid;
  v_owner_role uuid; v_manager_role uuid; v_cs_role uuid; v_wh_role uuid;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000e1', 'owner-p14@test.local'),
    ('00000000-0000-0000-0000-0000000000e2', 'manager-p14@test.local'),
    ('00000000-0000-0000-0000-0000000000e3', 'cs-p14@test.local'),
    ('00000000-0000-0000-0000-0000000000e4', 'wh-p14@test.local'),
    ('00000000-0000-0000-0000-0000000000e5', 'ownerb-p14@test.local');

  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('P14 WS A', 'p14-ws-a', 'NG', 'NGN', '00000000-0000-0000-0000-0000000000e1') returning id into v_ws_a;
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('P14 WS B', 'p14-ws-b', 'KE', 'KES', '00000000-0000-0000-0000-0000000000e5') returning id into v_ws_b;

  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_a, 'P14 Brand A', 'p14-brand-a', '00000000-0000-0000-0000-0000000000e1') returning id into v_brand_a;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_b, 'P14 Brand B', 'p14-brand-b', '00000000-0000-0000-0000-0000000000e5') returning id into v_brand_b;

  select id into v_owner_role from public.roles where workspace_id is null and slug = 'owner';
  select id into v_manager_role from public.roles where workspace_id is null and slug = 'manager';
  select id into v_cs_role from public.roles where workspace_id is null and slug = 'customer-support';
  select id into v_wh_role from public.roles where workspace_id is null and slug = 'warehouse-staff';

  insert into public.user_roles (user_id, workspace_id, role_id) values
    ('00000000-0000-0000-0000-0000000000e1', v_ws_a, v_owner_role),
    ('00000000-0000-0000-0000-0000000000e2', v_ws_a, v_manager_role),
    ('00000000-0000-0000-0000-0000000000e3', v_ws_a, v_cs_role),
    ('00000000-0000-0000-0000-0000000000e4', v_ws_a, v_wh_role),
    ('00000000-0000-0000-0000-0000000000e5', v_ws_b, v_owner_role);

  raise notice 'P14_WS_A=%, P14_BRAND_A=%, P14_WS_B=%', v_ws_a, v_brand_a, v_ws_b;
end $$;

\echo '=== 1. Notification workspace isolation ==='
do $$
declare v_ws_a uuid; v_ws_b uuid; v_n_a uuid; v_count int;
begin
  select id into v_ws_a from public.workspaces where slug = 'p14-ws-a';
  select id into v_ws_b from public.workspaces where slug = 'p14-ws-b';

  insert into public.notifications (workspace_id, user_id, type, title, message)
    values (v_ws_a, '00000000-0000-0000-0000-0000000000e1', 'system', 'A-only note', 'Workspace A only')
    returning id into v_n_a;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e5', false);
  set role authenticated;
  select count(*) into v_count from public.notifications where id = v_n_a;
  reset role;
  assert v_count = 0, format('Workspace B owner must not see Workspace A''s notification, saw %s', v_count);
  raise notice 'OK 1: notification workspace isolation holds.';
end $$;

\echo '=== 2. A user cannot mark another user''s personal notification as read ==='
do $$
declare v_ws uuid; v_n_id uuid; v_row public.notifications;
begin
  select id into v_ws from public.workspaces where slug = 'p14-ws-a';
  insert into public.notifications (workspace_id, user_id, type, title, message)
    values (v_ws, '00000000-0000-0000-0000-0000000000e1', 'system', 'Owner-only note', 'For owner only')
    returning id into v_n_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e2', false);
  set role authenticated;
  update public.notifications set is_read = true, read_at = now() where id = v_n_id;
  reset role;

  select * into v_row from public.notifications where id = v_n_id;
  assert v_row.is_read = false, 'Manager must not be able to mark Owner''s personal notification as read (RLS should silently affect 0 rows)';
  raise notice 'OK 2: personal notification correctly protected from another user''s update attempt.';
end $$;

\echo '=== 3. A broadcast (user_id null) notification CAN be marked read/archived by any workspace member ==='
do $$
declare v_ws uuid; v_n_id uuid; v_row public.notifications;
begin
  select id into v_ws from public.workspaces where slug = 'p14-ws-a';
  insert into public.notifications (workspace_id, user_id, type, title, message)
    values (v_ws, null, 'system', 'Broadcast note', 'For everyone in the workspace')
    returning id into v_n_id;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e3', false);
  set role authenticated;
  update public.notifications set is_read = true, read_at = now() where id = v_n_id;
  update public.notifications set is_archived = true, archived_at = now() where id = v_n_id;
  reset role;

  select * into v_row from public.notifications where id = v_n_id;
  assert v_row.is_read and v_row.is_archived, 'Customer Support must be able to read/archive a workspace-wide broadcast notification';
  raise notice 'OK 3: broadcast notification read/archive works for any workspace member.';
end $$;

\echo '=== 4. Stuck automation_executions (running > 15 minutes) are reclaimed by retry_pending_automation_executions() ==='
do $$
declare v_ws uuid; v_brand uuid; v_rule_id uuid; v_event_id uuid; v_exec_id uuid; v_row public.automation_executions;
begin
  select id into v_ws from public.workspaces where slug = 'p14-ws-a';
  select id into v_brand from public.brands where slug = 'p14-brand-a';

  insert into public.automation_rules (workspace_id, brand_id, name, event_type, status, actions, created_by, updated_by)
  values (v_ws, v_brand, 'P14 stuck rule', 'orders.created', 'active', '[{"type":"LOG_EVENT","config":{}}]'::jsonb,
    '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1')
  returning id into v_rule_id;

  insert into public.automation_events (workspace_id, brand_id, event_type, entity_type, entity_id, payload, processing_status, idempotency_key)
  values (v_ws, v_brand, 'orders.created', 'order', gen_random_uuid(), '{}'::jsonb, 'processed', 'p14-stuck-event')
  returning id into v_event_id;

  -- Simulate a worker that claimed this execution and then crashed:
  -- status='running', started_at far enough in the past to be stale.
  insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status, attempts, max_attempts, started_at)
  values (v_event_id, v_rule_id, v_ws, v_brand, 'running', 1, 3, now() - interval '20 minutes')
  returning id into v_exec_id;

  perform public.retry_pending_automation_executions(50);

  select * into v_row from public.automation_executions where id = v_exec_id;
  assert v_row.status in ('retrying', 'succeeded'), format('expected the stuck execution to be reclaimed into retrying (and then possibly retried to succeeded within the same call), got %s', v_row.status);
  assert v_row.error_message like '%reclaimed%' or v_row.status = 'succeeded', 'expected an honest reclaim note in error_message unless the retry itself already succeeded';
  raise notice 'OK 4: stuck running execution correctly reclaimed, never silently stranded.';
end $$;

\echo '=== 5. A genuinely still-processing execution (started recently) is NOT reclaimed ==='
do $$
declare v_ws uuid; v_brand uuid; v_rule_id uuid; v_event_id uuid; v_exec_id uuid; v_row public.automation_executions;
begin
  select id into v_ws from public.workspaces where slug = 'p14-ws-a';
  select id into v_brand from public.brands where slug = 'p14-brand-a';
  select id into v_rule_id from public.automation_rules where name = 'P14 stuck rule';

  insert into public.automation_events (workspace_id, brand_id, event_type, entity_type, entity_id, payload, processing_status, idempotency_key)
  values (v_ws, v_brand, 'orders.created', 'order', gen_random_uuid(), '{}'::jsonb, 'processed', 'p14-fresh-event')
  returning id into v_event_id;

  insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status, attempts, max_attempts, started_at)
  values (v_event_id, v_rule_id, v_ws, v_brand, 'running', 1, 3, now() - interval '2 minutes')
  returning id into v_exec_id;

  perform public.retry_pending_automation_executions(50);

  select * into v_row from public.automation_executions where id = v_exec_id;
  assert v_row.status = 'running', format('a genuinely recent running execution must not be reclaimed, got %s', v_row.status);
  raise notice 'OK 5: recently-started execution correctly left untouched.';
end $$;

\echo '=== 6. Automation duplicate execution protection (unique event_id+rule_id) still holds ==='
do $$
declare v_ws uuid; v_brand uuid; v_rule_id uuid; v_event_id uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'p14-ws-a';
  select id into v_brand from public.brands where slug = 'p14-brand-a';
  select id into v_rule_id from public.automation_rules where name = 'P14 stuck rule';
  select id into v_event_id from public.automation_events where idempotency_key = 'p14-stuck-event';

  begin
    insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status) values (v_event_id, v_rule_id, v_ws, v_brand, 'pending');
  exception when unique_violation then
    null;
  end;
  select count(*) into v_count from public.automation_executions where event_id = v_event_id and rule_id = v_rule_id;
  assert v_count = 1, format('expected exactly one execution per (event,rule), got %s', v_count);
  raise notice 'OK 6: automation execution duplicate protection confirmed.';
end $$;

\echo '=== 7. get_queue_health(): no_data, healthy and failing states are derived honestly ==='
do $$
declare v_ws_b uuid; v_ws_a uuid; v_brand_a uuid; v_row record; v_found_tracking boolean := false; v_found_comm boolean := false; v_found_auto boolean := false;
begin
  select id into v_ws_b from public.workspaces where slug = 'p14-ws-b';
  select id into v_ws_a from public.workspaces where slug = 'p14-ws-a';
  select id into v_brand_a from public.brands where slug = 'p14-brand-a';

  -- Workspace B has zero rows in any queue -> every queue must read no_data.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e5', false);
  set role authenticated;
  for v_row in select * from public.get_queue_health(v_ws_b) loop
    assert v_row.health = 'no_data', format('expected no_data for %s in an empty workspace, got %s', v_row.queue, v_row.health);
  end loop;
  reset role;

  -- Workspace A: put tracking into an honest 'failing' state (a
  -- permanently_failed row with zero recent successes).
  insert into public.tracking_dispatch_log (workspace_id, brand_id, provider, event_type, event_id, status, attempts, updated_at)
  values (v_ws_a, v_brand_a, 'meta', 'PURCHASE', 'p14-evt-failed', 'permanently_failed', 6, now());

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e1', false);
  set role authenticated;
  for v_row in select * from public.get_queue_health(v_ws_a) loop
    if v_row.queue = 'tracking' then
      v_found_tracking := true;
      assert v_row.health = 'failing', format('expected tracking queue to read failing (failure with no recent success), got %s', v_row.health);
      assert v_row.failed_recent = 1, format('expected failed_recent=1, got %s', v_row.failed_recent);
    end if;
    if v_row.queue = 'communication' then v_found_comm := true; end if;
    if v_row.queue = 'automation' then v_found_auto := true; end if;
  end loop;
  reset role;
  assert v_found_tracking and v_found_comm and v_found_auto, 'get_queue_health must always return exactly one row per queue (tracking/communication/automation)';
  raise notice 'OK 7: get_queue_health() derives no_data/failing states honestly from real data.';
end $$;

\echo '=== 8. get_queue_health() is permission-gated (integrations.view); Customer Support/Warehouse Staff denied ==='
do $$
declare v_ws uuid; v_denied1 boolean := false; v_denied2 boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'p14-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e3', false);
  set role authenticated;
  begin
    perform public.get_queue_health(v_ws);
  exception when others then v_denied1 := true; end;
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e4', false);
  set role authenticated;
  begin
    perform public.get_queue_health(v_ws);
  exception when others then v_denied2 := true; end;
  reset role;

  assert v_denied1, 'Customer Support (no integrations.view) must not be able to call get_queue_health()';
  assert v_denied2, 'Warehouse Staff (no integrations.view) must not be able to call get_queue_health()';
  raise notice 'OK 8: get_queue_health() correctly denies Customer Support and Warehouse Staff.';
end $$;

\echo '=== 9. get_queue_health() denies anonymous and cross-workspace callers ==='
do $$
declare v_ws_a uuid; v_denied1 boolean := false; v_denied2 boolean := false;
begin
  select id into v_ws_a from public.workspaces where slug = 'p14-ws-a';
  perform set_config('app.test_user_id', '', false);
  set role anon;
  begin
    perform public.get_queue_health(v_ws_a);
  exception when others then v_denied1 := true; end;
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000e5', false);
  set role authenticated;
  begin
    perform public.get_queue_health(v_ws_a);
  exception when others then v_denied2 := true; end;
  reset role;

  assert v_denied1, 'anonymous caller must not be able to call get_queue_health()';
  assert v_denied2, 'a Workspace B owner must not be able to read Workspace A''s queue health';
  raise notice 'OK 9: get_queue_health() correctly denies anonymous and cross-workspace callers.';
end $$;

\echo '=== 10. communication_log.updated_at is maintained on every status transition ==='
-- now() is frozen for the whole duration of a single transaction, so the
-- insert and update must run as two separate top-level statements (each
-- its own implicit transaction in psql) for updated_at to actually differ,
-- mirroring how a real insert and a later real update are two distinct
-- requests, not one multi-statement DO block.
insert into public.communication_log (workspace_id, brand_id, channel, recipient, body, status)
  select id, (select id from public.brands where slug = 'p14-brand-a'), 'email', 'x@p14.test', 'hi', 'queued'
  from public.workspaces where slug = 'p14-ws-a'
  returning id as p14_comm_id, updated_at as p14_comm_before \gset

select pg_sleep(0.02);

update public.communication_log set status = 'permanently_failed', failure_category = 'client_error'
  where id = :'p14_comm_id'
  returning updated_at as p14_comm_after \gset

-- psql does not interpolate :'var' inside a dollar-quoted DO body, so the
-- comparison is done as a plain top-level query and checked via \if instead
-- of inside plpgsql.
select case when :'p14_comm_after'::timestamptz > :'p14_comm_before'::timestamptz then 'true' else 'false' end as p14_comm_ok \gset

\if :p14_comm_ok
\echo OK 10: communication_log.updated_at correctly maintained by the generic trigger.
\else
\echo FAILED 10: communication_log.updated_at must advance on a status transition
\quit
\endif

\echo '=== 11. Concurrent retry_pending_automation_executions() calls never double-process the same retrying row ==='
-- Exercised via two genuinely concurrent psql processes in
-- run_gcos_p14_concurrency.sh (separate file) — this single-session
-- assertion instead confirms the reclaim UPDATE and the FOR UPDATE
-- SKIP LOCKED retry-claim compose correctly in one call, which the
-- concurrency script then repeats across two real backends.
do $$
declare v_ws uuid; v_brand uuid; v_rule_id uuid; v_event_id uuid; v_exec_id uuid; v_attempts_before int; v_row public.automation_executions;
begin
  select id into v_ws from public.workspaces where slug = 'p14-ws-a';
  select id into v_brand from public.brands where slug = 'p14-brand-a';
  select id into v_rule_id from public.automation_rules where name = 'P14 stuck rule';

  insert into public.automation_events (workspace_id, brand_id, event_type, entity_type, entity_id, payload, processing_status, idempotency_key)
  values (v_ws, v_brand, 'orders.created', 'order', gen_random_uuid(), '{}'::jsonb, 'processed', 'p14-retry-event')
  returning id into v_event_id;

  insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status, attempts, max_attempts, next_retry_at)
  values (v_event_id, v_rule_id, v_ws, v_brand, 'retrying', 1, 3, now() - interval '1 minute')
  returning id, attempts into v_exec_id, v_attempts_before;

  perform public.retry_pending_automation_executions(50);
  perform public.retry_pending_automation_executions(50);

  select * into v_row from public.automation_executions where id = v_exec_id;
  assert v_row.attempts = v_attempts_before + 1, format('expected exactly one retry attempt to have run (attempts=%s), got %s', v_attempts_before + 1, v_row.attempts);
  raise notice 'OK 11: a settled execution is never re-processed by a subsequent retry sweep.';
end $$;

\echo '=== ALL PHASE 14 OPERATIONAL TESTS PASSED ==='
