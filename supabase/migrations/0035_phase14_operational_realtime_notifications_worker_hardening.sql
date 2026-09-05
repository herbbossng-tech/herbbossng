-- ============================================================
-- GCOS Phase 14 — Operational Intelligence, Realtime UX,
-- Notification Center & Worker Hardening
--
-- Repository audit before writing this migration confirmed the
-- following are ALREADY production-capable and are extended here,
-- never duplicated:
--   * notifications (0005) + its RLS (0007, extended 0023 for
--     workspace-broadcast updates) + src/features/notifications
--     (api.ts/hooks.ts) already have real read/unread/archive/
--     pagination/filtering/realtime — no mock data exists anywhere in
--     that feature. Nothing in this migration touches notifications
--     schema/RLS; Phase 14's notification work is audit-confirmation,
--     not new backend.
--   * tracking_dispatch_log / communication_log (0028, hardened 0032)
--     already have a correct claim/retry/backoff/stuck-reclaim/
--     idempotent lifecycle — claim_tracking_dispatch_batch() and
--     claim_communication_log_batch() both already reclaim rows stuck
--     in 'processing' for >10 minutes.
--   * retry_tracking_dispatch_event() / retry_communication_log_entry()
--     / retry_automation_execution() are already permission-gated,
--     row-locked, idempotency-safe, and audited.
--   * The supabase_realtime publication already includes orders,
--     order_tasks, delivery_attempts, waybills, order_settlements,
--     automation_executions, communication_log, tracking_dispatch_log
--     and notifications (0023, 0032) — no publication change is
--     needed; Phase 14's realtime work is exclusively a frontend
--     wiring gap (pages that never called the existing generic
--     useRealtimeInvalidate() hook), not a database gap.
--
-- What this migration actually fixes (two genuine gaps found):
--
--   1. automation_executions had NO stuck-job recovery. Unlike
--      tracking_dispatch_log/communication_log (which store
--      claimed_at/claimed_by and reclaim on a timeout inside their
--      claim RPCs), a synchronous automation run that crashes
--      mid-execution leaves its row at status='running' forever —
--      retry_pending_automation_executions() only ever selects
--      status='retrying', so a stuck 'running' row was invisible to
--      every existing recovery path. Fixed by extending (CREATE OR
--      REPLACE, no signature change) retry_pending_automation_executions()
--      to reclaim stuck 'running' rows first, using started_at (which
--      already exists) as the staleness clock — the same conceptual
--      timeout pattern as the tracking/communication claim RPCs,
--      applied to the one queue that didn't have it yet.
--
--   2. No efficient, honest queue-health rollup existed. Integration
--      Health (0032) computes only a client-side summarizeByStatus()
--      count over whatever page of rows it already fetched — no
--      "oldest pending", no "last success/failure", and no derived
--      HEALTHY/DEGRADED/FAILING/NO_DATA state. get_queue_health()
--      adds exactly that, as ONE new efficient RPC (not three), gated
--      by the existing integrations.view permission (already the
--      "can see the health rollup" permission per its own 0032
--      description) — reusing user_has_permission(), never a new
--      security model.
--
-- Also: communication_log never had an updated_at column, so
-- get_queue_health() could not honestly report "last failure" for it
-- (created_at only records when a message was QUEUED, not when it
-- later failed). Added updated_at + the existing generic
-- set_updated_at() trigger — the exact same pattern already used on
-- every other queue table — so failure timestamps are truthful.
-- ============================================================


-- ============================================================
-- PART A — communication_log.updated_at (for honest failure timestamps)
-- ============================================================

alter table public.communication_log add column if not exists updated_at timestamptz not null default now();

create trigger set_communication_log_updated_at
  before update on public.communication_log
  for each row execute function public.set_updated_at();

comment on column public.communication_log.updated_at is
  'Added in Phase 14 so get_queue_health() can report an honest "last failure" timestamp for this queue — created_at only records when a message was queued, not when a later dispatch attempt actually failed. Maintained automatically by the generic set_updated_at() trigger already used on every other queue table.';


-- ============================================================
-- PART B — automation_executions stuck-'running' reclaim
-- ============================================================

create or replace function public.retry_pending_automation_executions(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_execution record;
  v_event public.automation_events%rowtype;
  v_rule public.automation_rules%rowtype;
  v_action jsonb;
  v_seq integer;
  v_any_failed boolean;
  v_count integer := 0;
  v_action_status text;
begin
  -- Stuck-job recovery (new in Phase 14): a worker that crashed mid-run
  -- leaves its execution at status='running' forever, since nothing
  -- else ever transitions it. 15 minutes is deliberately generous —
  -- longer than any real execution (a handful of actions, each a
  -- single-row insert/update) should ever take — so this only ever
  -- fires on a genuinely abandoned row, never one still legitimately
  -- processing. Reclaimed into 'retrying' (if attempts remain) or a
  -- terminal 'failed' (if not), exactly the same two outcomes a
  -- normal failed run already produces — never a fabricated success.
  update public.automation_executions
    set status = case when attempts < max_attempts then 'retrying' else 'failed' end,
        next_retry_at = case when attempts < max_attempts then now() else null end,
        error_message = coalesce(error_message, '') || case when error_message is null or error_message = '' then '' else ' | ' end
          || 'reclaimed: execution was stuck in running for over 15 minutes (worker likely crashed)',
        completed_at = case when attempts >= max_attempts then now() else completed_at end,
        updated_at = now()
    where status = 'running' and started_at < now() - interval '15 minutes';

  for v_execution in
    select * from public.automation_executions
    where status = 'retrying' and next_retry_at is not null and next_retry_at <= now()
    order by next_retry_at
    limit p_limit
    for update skip locked
  loop
    select * into v_event from public.automation_events where id = v_execution.event_id;
    select * into v_rule from public.automation_rules where id = v_execution.rule_id;
    if v_rule.status <> 'active' then
      update public.automation_executions set status = 'skipped', next_retry_at = null, updated_at = now() where id = v_execution.id;
      continue;
    end if;

    update public.automation_executions set status = 'running', attempts = attempts + 1, started_at = now(), updated_at = now() where id = v_execution.id;
    v_any_failed := false;
    v_seq := 0;
    for v_action in select jsonb_array_elements(coalesce(v_rule.actions, '[]'::jsonb))
    loop
      begin
        v_action_status := public.execute_automation_action(v_execution.id, v_seq, v_action, v_event, v_rule);
      exception when others then
        v_action_status := 'failed';
      end;
      if v_action_status not in ('succeeded', 'skipped', 'queued') then
        v_any_failed := true;
      end if;
      v_seq := v_seq + 1;
    end loop;

    if v_any_failed then
      update public.automation_executions
        set status = case when attempts >= max_attempts then 'failed' else 'retrying' end,
            next_retry_at = case when attempts < max_attempts then now() + (attempts || ' minutes')::interval else null end,
            updated_at = now()
        where id = v_execution.id;
    else
      update public.automation_executions set status = 'succeeded', completed_at = now(), next_retry_at = null, updated_at = now() where id = v_execution.id;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.retry_pending_automation_executions(integer) is
  'Unchanged retry-batch logic from 0032, with one addition: reclaims automation_executions stuck at status=running for over 15 minutes (a crashed worker''s abandoned row) into retrying/failed before processing the normal retry queue — automation_executions previously had no stuck-job recovery at all, unlike tracking_dispatch_log/communication_log which have always reclaimed stale "processing" rows inside their own claim RPCs. Safe under concurrent invocation: the reclaim UPDATE and the retry-claim SELECT...FOR UPDATE SKIP LOCKED are both set-based/row-locked, so two concurrent callers can never both reclaim or retry the same row.';


-- ============================================================
-- PART C — get_queue_health(): one efficient, honest rollup RPC
-- covering tracking/communication/automation, replacing the
-- client-side summarizeByStatus() computed over a partial page of
-- rows. SECURITY DEFINER + explicit permission check (existing
-- integrations.view), matching the established pattern for every
-- other cross-cutting health RPC in this codebase.
-- ============================================================

create or replace function public.get_queue_health(p_workspace_id uuid)
returns table (
  queue text,
  pending bigint,
  processing bigint,
  retrying bigint,
  failed_recent bigint,
  succeeded_recent bigint,
  oldest_pending_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  health text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.user_has_permission(p_workspace_id, 'integrations.view') then
    raise exception 'insufficient_permission: integrations.view required';
  end if;

  return query
  with tracking as (
    select
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'processing') as processing,
      count(*) filter (where status = 'retryable') as retrying,
      count(*) filter (where status = 'permanently_failed' and updated_at > now() - interval '24 hours') as failed_recent,
      count(*) filter (where status = 'sent' and updated_at > now() - interval '24 hours') as succeeded_recent,
      min(created_at) filter (where status = 'pending') as oldest_pending_at,
      max(dispatched_at) filter (where status = 'sent') as last_success_at,
      max(updated_at) filter (where status = 'permanently_failed') as last_failure_at,
      count(*) as total_rows
    from public.tracking_dispatch_log
    where workspace_id = p_workspace_id
  ),
  communication as (
    select
      count(*) filter (where status = 'queued') as pending,
      count(*) filter (where status = 'processing') as processing,
      count(*) filter (where status = 'retryable') as retrying,
      count(*) filter (where status = 'permanently_failed' and updated_at > now() - interval '24 hours') as failed_recent,
      count(*) filter (where status in ('sent', 'delivered') and updated_at > now() - interval '24 hours') as succeeded_recent,
      min(created_at) filter (where status = 'queued') as oldest_pending_at,
      max(dispatched_at) filter (where status in ('sent', 'delivered')) as last_success_at,
      max(updated_at) filter (where status = 'permanently_failed') as last_failure_at,
      count(*) as total_rows
    from public.communication_log
    where workspace_id = p_workspace_id
  ),
  automation as (
    select
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'running') as processing,
      count(*) filter (where status = 'retrying') as retrying,
      count(*) filter (where status = 'failed' and updated_at > now() - interval '24 hours') as failed_recent,
      count(*) filter (where status = 'succeeded' and updated_at > now() - interval '24 hours') as succeeded_recent,
      min(created_at) filter (where status = 'pending') as oldest_pending_at,
      max(completed_at) filter (where status = 'succeeded') as last_success_at,
      max(updated_at) filter (where status = 'failed') as last_failure_at,
      count(*) as total_rows
    from public.automation_executions
    where workspace_id = p_workspace_id
  )
  select 'tracking'::text, t.pending, t.processing, t.retrying, t.failed_recent, t.succeeded_recent,
    t.oldest_pending_at, t.last_success_at, t.last_failure_at,
    case
      when t.total_rows = 0 then 'no_data'
      when t.failed_recent > 0 and t.succeeded_recent = 0 then 'failing'
      when t.oldest_pending_at is not null and t.oldest_pending_at < now() - interval '1 hour' then 'failing'
      when t.failed_recent > 0 or t.retrying > 0 then 'degraded'
      else 'healthy'
    end
  from tracking t
  union all
  select 'communication'::text, c.pending, c.processing, c.retrying, c.failed_recent, c.succeeded_recent,
    c.oldest_pending_at, c.last_success_at, c.last_failure_at,
    case
      when c.total_rows = 0 then 'no_data'
      when c.failed_recent > 0 and c.succeeded_recent = 0 then 'failing'
      when c.oldest_pending_at is not null and c.oldest_pending_at < now() - interval '1 hour' then 'failing'
      when c.failed_recent > 0 or c.retrying > 0 then 'degraded'
      else 'healthy'
    end
  from communication c
  union all
  select 'automation'::text, a.pending, a.processing, a.retrying, a.failed_recent, a.succeeded_recent,
    a.oldest_pending_at, a.last_success_at, a.last_failure_at,
    case
      when a.total_rows = 0 then 'no_data'
      when a.failed_recent > 0 and a.succeeded_recent = 0 then 'failing'
      when a.oldest_pending_at is not null and a.oldest_pending_at < now() - interval '1 hour' then 'failing'
      when a.failed_recent > 0 or a.retrying > 0 then 'degraded'
      else 'healthy'
    end
  from automation a;
end;
$$;

comment on function public.get_queue_health(uuid) is
  'One efficient rollup per queue (tracking/communication/automation) instead of three, and instead of the client computing counts from whatever page of rows it already fetched. Health is derived from actual data, documented here rather than left implicit: no_data = the queue has never had a row in this workspace; failing = recent failures with zero recent successes, OR the oldest still-pending item has waited over an hour (nothing is claiming it); degraded = some recent failures or a nonzero retrying backlog, but not the failing conditions above; healthy = none of the above. "Recent" = the last 24 hours, so a queue that failed once last month and has been clean since reads healthy, not permanently degraded. Per-channel (email/sms/whatsapp) NOT_CONFIGURED state is intentionally NOT part of this rollup — that is a configuration fact already surfaced per-brand by get_communication_config_status(), not a dispatch-reliability fact about the shared workspace-level queue this function reports on. Gated by integrations.view, the same permission that already governs the rest of the Integration Health Center.';
