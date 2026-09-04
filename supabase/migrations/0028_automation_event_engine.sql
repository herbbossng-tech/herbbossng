-- ============================================================
-- GCOS PHASE 8 — AUTOMATION, EVENT ENGINE & COMMUNICATION
-- ORCHESTRATION.
--
-- Architecture: BUSINESS EVENT -> EVENT RECORD -> MATCH ACTIVE
-- RULES -> EVALUATE CONDITIONS -> CREATE EXECUTION -> EXECUTE
-- ACTIONS -> RECORD RESULT -> RETRY IF REQUIRED -> AUDIT -> NOTIFY.
--
-- Processing model: this sandbox cannot run a persistent worker or
-- reach a live Supabase project to deploy an Edge Function, so per
-- Part 30's own instruction ("implement the durable queue/execution
-- architecture without pretending background processing exists"),
-- events are processed SYNCHRONOUSLY, inside the same transaction
-- as the business write that emitted them, via plain SQL/plpgsql —
-- the database stays the source of truth and nothing is faked.
-- Every rule's action execution is wrapped in its own exception
-- handler so a broken rule can never abort the business transaction
-- that triggered it (Part 19). A separate batch-sweep RPC
-- (retry_pending_automation_executions) is also provided for
-- time-based retries and is the one piece that genuinely needs an
-- external scheduler (e.g. pg_cron or a Supabase cron trigger
-- calling it periodically) to run unattended — documented as a
-- live-Supabase configuration step in the final report, not faked
-- here.
--
-- Reuses rather than duplicates: user_workspace_ids(),
-- user_has_permission(), user_has_finance_visibility(),
-- log_ops_audit_event(), the existing notifications table, the
-- existing order_tasks/orders/waybills/order_settlements/
-- affiliate_commissions/affiliate_withdrawals/ad_costs schema and
-- RPCs (approve_ad_cost/approve_affiliate_withdrawal are extended
-- in place, not duplicated), and Phase 7's assignment_rules/
-- approval_rules tables (extended with the columns needed to
-- actually be consumed, not replaced).
-- ============================================================


-- ================================================================
-- PART A — CORE TABLES
-- ================================================================

-- ---------------------------------------------------------------
-- automation_events — durable, workspace-scoped event log. Every
-- event carries enough payload to evaluate conditions without
-- trusting the frontend (payload is always built server-side by the
-- emitting trigger/RPC from the actual row, never from client input
-- for system-sourced events).
-- ---------------------------------------------------------------
create table public.automation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'system' check (source in ('system', 'user_action', 'webhook', 'integration')),
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed')),
  processing_error text,
  unique (workspace_id, idempotency_key)
);

comment on table public.automation_events is
  'Durable event log. idempotency_key is unique per workspace — a duplicate emit (double-click, retry, duplicate webhook) is a silent no-op via ON CONFLICT, never a second event. Never trust workspace_id/brand_id/entity_id/payload from a client for source=user_action/webhook events without server-side verification (see emit_automation_event()).';

create index automation_events_workspace_type_idx on public.automation_events (workspace_id, event_type, occurred_at desc);
create index automation_events_workspace_status_idx on public.automation_events (workspace_id, processing_status);
create index automation_events_entity_idx on public.automation_events (entity_type, entity_id);
create index automation_events_correlation_idx on public.automation_events (correlation_id);

alter table public.automation_events enable row level security;

create policy "select_automation_events" on public.automation_events
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'automation.view')
  );

-- No client insert/update policy — emit_automation_event() (SECURITY
-- DEFINER) and the processing pipeline are the only writers. A
-- client can never fabricate a system event by inserting directly.


-- ---------------------------------------------------------------
-- automation_rules — user-authored WHEN/IF/THEN configuration.
-- Conditions and actions are structured jsonb (validated shape,
-- interpreted by a fixed evaluator/executor below) — never
-- arbitrary SQL or code, per Part 5/Part 6's explicit prohibition.
-- ---------------------------------------------------------------
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  name text not null,
  description text,
  event_type text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  priority integer not null default 100,
  conditions jsonb not null default '[]'::jsonb,
  conditions_logic text not null default 'AND' check (conditions_logic in ('AND', 'OR')),
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.automation_rules is
  'A rule executes with the LIVE, re-checked authority of updated_by (falling back to created_by) at every execution — never the authority it happened to have when saved. Demoting/suspending that user silently stops the rule''s actions (user_has_permission_for() re-evaluated per action against that specific user, see execute_automation_action()) without needing to touch the rule itself. conditions/actions are structured jsonb only; there is no code-execution path.';

create index automation_rules_workspace_event_idx on public.automation_rules (workspace_id, event_type, status, priority) where deleted_at is null;
create index automation_rules_workspace_idx on public.automation_rules (workspace_id) where deleted_at is null;

alter table public.automation_rules enable row level security;

create policy "select_automation_rules" on public.automation_rules
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'automation.view')
  );

create policy "manage_automation_rules" on public.automation_rules
  for all to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'automation.manage')
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'automation.manage')
  );

create trigger set_automation_rules_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- automation_executions — one row per (event, rule) match. The
-- unique constraint IS the idempotency boundary at the rule level:
-- re-processing the same event for the same rule can never create a
-- second execution, only find/update the existing one.
-- ---------------------------------------------------------------
create table public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.automation_events (id) on delete cascade,
  rule_id uuid not null references public.automation_rules (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'retrying', 'skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  error_message text,
  result jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, rule_id)
);

comment on table public.automation_executions is
  'One row per (event, rule) — the unique constraint is what makes re-processing the same event for the same rule idempotent at the execution level. Per-action idempotency lives one level down, in automation_execution_actions.';

create index automation_executions_workspace_idx on public.automation_executions (workspace_id, created_at desc);
create index automation_executions_status_idx on public.automation_executions (workspace_id, status);
create index automation_executions_retry_idx on public.automation_executions (status, next_retry_at) where status = 'retrying';
create index automation_executions_rule_idx on public.automation_executions (rule_id);

alter table public.automation_executions enable row level security;

create policy "select_automation_executions" on public.automation_executions
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'automation.view')
  );

create trigger set_automation_executions_updated_at
  before update on public.automation_executions
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- automation_execution_actions — per-action ledger. This is the
-- REAL idempotency boundary for side effects: before performing an
-- action's side effect, the executor checks whether this row already
-- has status='succeeded' and, if so, returns its recorded result
-- instead of repeating the side effect. A retry of a failed action
-- reuses the same row (increments nothing here — attempt counting
-- lives on the parent execution); a retry of an already-succeeded
-- execution is therefore guaranteed not to duplicate a create/assign
-- side effect.
-- ---------------------------------------------------------------
create table public.automation_execution_actions (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.automation_executions (id) on delete cascade,
  action_seq integer not null,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'skipped')),
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (execution_id, action_seq)
);

create index automation_execution_actions_execution_idx on public.automation_execution_actions (execution_id);

alter table public.automation_execution_actions enable row level security;

create policy "select_automation_execution_actions" on public.automation_execution_actions
  for select to authenticated
  using (
    exists (
      select 1 from public.automation_executions e
      where e.id = execution_id
        and e.workspace_id in (select public.user_workspace_ids())
        and public.user_has_permission(e.workspace_id, 'automation.view')
    )
  );

create trigger set_automation_execution_actions_updated_at
  before update on public.automation_execution_actions
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- approval_requests — Phase 8's real consumption of Phase 7's
-- approval_rules: an actual pending-approval INSTANCE against one
-- entity, not just policy configuration. At most one PENDING request
-- per entity at a time (partial unique index below).
-- ---------------------------------------------------------------
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  approval_rule_id uuid references public.approval_rules (id) on delete set null,
  module text not null,
  entity_type text not null,
  entity_id uuid not null,
  amount numeric(14, 2),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.approval_requests is
  'One row per actual approval instance against an entity, created automatically when an event matches an active approval_rules threshold (see evaluate_approval_rules_for_event()). approve_ad_cost()/approve_affiliate_withdrawal() are extended (not duplicated) to check for an open request here requiring a specific role before allowing the existing approve action through.';

create unique index approval_requests_one_pending_idx on public.approval_requests (module, entity_id) where status = 'PENDING';
create index approval_requests_workspace_idx on public.approval_requests (workspace_id, status);

alter table public.approval_requests enable row level security;

create policy "select_approval_requests" on public.approval_requests
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'approval_rules.view')
  );

create trigger set_approval_requests_updated_at
  before update on public.approval_requests
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- communication_log — the "communication abstraction" Part 16
-- requires. No SMS/WhatsApp/email provider exists in this
-- environment, so every row this phase ever writes has
-- status='not_configured' — never a fabricated 'sent'. The channel/
-- provider columns exist so a real provider can be wired in later
-- without a schema change.
-- ---------------------------------------------------------------
create table public.communication_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp', 'email', 'push')),
  recipient text,
  subject text,
  body text,
  status text not null check (status in ('not_configured', 'unsupported', 'sent', 'failed')),
  provider text,
  provider_message_id text,
  related_execution_action_id uuid references public.automation_execution_actions (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.communication_log is
  'Every row currently has status=not_configured — no SMS/WhatsApp/email provider is integrated in Phase 8. Never write status=sent unless a real provider call genuinely succeeded.';

create index communication_log_workspace_idx on public.communication_log (workspace_id, created_at desc);

alter table public.communication_log enable row level security;

create policy "select_communication_log" on public.communication_log
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'automation.view')
  );


-- ================================================================
-- PART B — extend Phase 7's assignment_rules with what actual
-- execution needs: a rotation cursor for round_robin/fixed. Nothing
-- about the table's existing meaning changes; this is purely
-- additive state for the strategy resolver below.
-- ================================================================
alter table public.assignment_rules add column if not exists last_assigned_staff_id uuid references auth.users (id);

comment on column public.assignment_rules.last_assigned_staff_id is
  'Rotation cursor for round_robin/fixed strategies, maintained by resolve_assignment() (0028). Null until the rule has assigned at least once.';


-- ================================================================
-- PART C — CONDITION ENGINE. Structured data only — no stored code.
-- ================================================================
create or replace function public.evaluate_automation_condition(p_condition jsonb, p_payload jsonb)
returns boolean
language plpgsql
stable
as $$
declare
  v_field text := p_condition ->> 'field';
  v_op text := p_condition ->> 'operator';
  v_expected jsonb := p_condition -> 'value';
  v_path text[];
  v_actual jsonb;
begin
  if v_field is null or v_op is null then
    return false;
  end if;
  v_path := string_to_array(v_field, '.');
  v_actual := p_payload #> v_path;

  case v_op
    when 'equals' then
      return v_actual = v_expected or (v_actual #>> '{}') = (v_expected #>> '{}');
    when 'not_equals' then
      return not (v_actual = v_expected or (v_actual #>> '{}') = (v_expected #>> '{}'));
    when 'greater_than' then
      return (v_actual #>> '{}')::numeric > (v_expected #>> '{}')::numeric;
    when 'less_than' then
      return (v_actual #>> '{}')::numeric < (v_expected #>> '{}')::numeric;
    when 'greater_or_equal' then
      return (v_actual #>> '{}')::numeric >= (v_expected #>> '{}')::numeric;
    when 'less_or_equal' then
      return (v_actual #>> '{}')::numeric <= (v_expected #>> '{}')::numeric;
    when 'contains' then
      return (v_actual #>> '{}') ilike '%' || (v_expected #>> '{}') || '%';
    when 'not_contains' then
      return coalesce((v_actual #>> '{}') not ilike '%' || (v_expected #>> '{}') || '%', true);
    when 'in' then
      return exists (select 1 from jsonb_array_elements_text(v_expected) e where e = (v_actual #>> '{}'));
    when 'not_in' then
      return not exists (select 1 from jsonb_array_elements_text(v_expected) e where e = (v_actual #>> '{}'));
    when 'is_empty' then
      return v_actual is null or v_actual = 'null'::jsonb or (v_actual #>> '{}') = '';
    when 'is_not_empty' then
      return not (v_actual is null or v_actual = 'null'::jsonb or (v_actual #>> '{}') = '');
    else
      return false;
  end case;
exception when others then
  -- A malformed condition (wrong type comparison, bad path, etc.)
  -- never matches and never breaks rule evaluation for other rules.
  return false;
end;
$$;

comment on function public.evaluate_automation_condition(jsonb, jsonb) is
  'Evaluates ONE structured {field, operator, value} condition against an event payload. field is a dot-path (e.g. "order.total_value"). Never executes stored code — operator is a fixed enum switched in plpgsql.';

create or replace function public.evaluate_automation_conditions(p_conditions jsonb, p_logic text, p_payload jsonb)
returns boolean
language plpgsql
stable
as $$
begin
  if p_conditions is null or jsonb_typeof(p_conditions) <> 'array' or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;
  if upper(coalesce(p_logic, 'AND')) = 'OR' then
    return exists (
      select 1 from jsonb_array_elements(p_conditions) c
      where public.evaluate_automation_condition(c, p_payload)
    );
  else
    return not exists (
      select 1 from jsonb_array_elements(p_conditions) c
      where not public.evaluate_automation_condition(c, p_payload)
    );
  end if;
end;
$$;


-- ================================================================
-- PART D — EVENT EMISSION. The single entry point every trigger/RPC
-- below calls into — a coherent architecture, not unrelated
-- triggers each doing their own thing.
-- ================================================================
create or replace function public.emit_automation_event(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_source text default 'system'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.automation_events (
    workspace_id, brand_id, event_type, entity_type, entity_id, payload, source, idempotency_key
  ) values (
    p_workspace_id, p_brand_id, p_event_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb), p_source, p_idempotency_key
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    -- Duplicate emit (double-click, retry, duplicate webhook) — the
    -- existing event already exists and, if it already ran, its
    -- executions already exist too (idempotent no-op by design).
    return (select id from public.automation_events where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key);
  end if;

  -- Process synchronously, in this same transaction, but never let a
  -- broken rule/action abort the business write that emitted this
  -- event (Part 19). process_automation_event() itself isolates each
  -- rule; this is a second layer of defense around the whole thing.
  begin
    perform public.process_automation_event(v_event_id);
  exception when others then
    update public.automation_events
      set processing_status = 'failed', processing_error = left(SQLERRM, 2000), processed_at = now()
      where id = v_event_id;
  end;

  return v_event_id;
end;
$$;

comment on function public.emit_automation_event(uuid, uuid, text, text, uuid, jsonb, text, text) is
  'The only writer of automation_events. idempotency_key must be a caller-constructed natural key (e.g. orders.created:<order_id>, or orders.status_changed:<order_id>:<old>-><new> for transitions) — a duplicate key is a silent, safe no-op. Processes the event synchronously in the caller''s transaction; a failure anywhere in the automation pipeline is caught here and recorded, never propagated to abort the caller''s own write.';


-- ================================================================
-- PART E — ASSIGNMENT RULE EXECUTION (consumes Phase 7's
-- assignment_rules). Never trusts stale staff data: eligibility is
-- re-checked live against user_roles/profiles at resolution time,
-- every time.
-- ================================================================
create or replace function public.resolve_assignment(p_workspace_id uuid, p_brand_id uuid, p_module text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.assignment_rules%rowtype;
  v_required_permission text;
  v_candidate uuid;
begin
  -- Prefer a brand-specific active rule over a workspace-wide one.
  select * into v_rule from public.assignment_rules
  where workspace_id = p_workspace_id
    and module = p_module
    and is_active and deleted_at is null
    and (brand_id = p_brand_id or brand_id is null)
  order by brand_id nulls last
  limit 1;

  if not found or v_rule.strategy = 'manual' then
    return null;
  end if;

  v_required_permission := case p_module
    when 'orders' then 'orders.assign'
    when 'tasks' then 'tasks.assign'
    else null
  end;
  if v_required_permission is null then
    return null;
  end if;

  if v_rule.strategy = 'fixed' then
    -- Re-verify EVERY fixed staff member's live eligibility — a
    -- name in fixed_staff_ids from rule-creation time is never
    -- trusted blindly (Part 7).
    select ur.user_id into v_candidate
    from unnest(v_rule.fixed_staff_ids) as fixed(user_id)
    join public.user_roles ur on ur.user_id = fixed.user_id and ur.workspace_id = p_workspace_id
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
    where (v_rule.last_assigned_staff_id is null or fixed.user_id > v_rule.last_assigned_staff_id)
    group by ur.user_id
    order by ur.user_id
    limit 1;

    if v_candidate is null then
      -- Wrap around to the first eligible fixed staff member.
      select ur.user_id into v_candidate
      from unnest(v_rule.fixed_staff_ids) as fixed(user_id)
      join public.user_roles ur on ur.user_id = fixed.user_id and ur.workspace_id = p_workspace_id
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      group by ur.user_id
      order by ur.user_id
      limit 1;
    end if;

  elsif v_rule.strategy = 'round_robin' then
    select ur.user_id into v_candidate
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
    where ur.workspace_id = p_workspace_id
      and (v_rule.last_assigned_staff_id is null or ur.user_id > v_rule.last_assigned_staff_id)
    group by ur.user_id
    order by ur.user_id
    limit 1;

    if v_candidate is null then
      select ur.user_id into v_candidate
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      where ur.workspace_id = p_workspace_id
      group by ur.user_id
      order by ur.user_id
      limit 1;
    end if;

  elsif v_rule.strategy = 'least_workload' then
    if p_module = 'orders' then
      select ur.user_id into v_candidate
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      left join public.orders o on o.assigned_to = ur.user_id and o.workspace_id = p_workspace_id
        and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and o.deleted_at is null
      where ur.workspace_id = p_workspace_id
      group by ur.user_id
      order by count(o.id), ur.user_id
      limit 1;
    else
      select ur.user_id into v_candidate
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      left join public.order_tasks t on t.assigned_to = ur.user_id and t.workspace_id = p_workspace_id
        and t.status not in ('COMPLETED', 'CANCELLED')
      where ur.workspace_id = p_workspace_id
      group by ur.user_id
      order by count(t.id), ur.user_id
      limit 1;
    end if;
  end if;

  if v_candidate is not null and v_rule.strategy in ('round_robin', 'fixed') then
    update public.assignment_rules set last_assigned_staff_id = v_candidate where id = v_rule.id;
  end if;

  return v_candidate;
end;
$$;

comment on function public.resolve_assignment(uuid, uuid, text) is
  'Consumes Phase 7''s assignment_rules. Returns null (meaning: leave unassigned / manual) when no active rule exists, strategy=manual, or no eligible staff can be found. Eligibility (workspace membership, active profile status, relevant permission) is re-verified live, never from stale rule-creation-time data.';


-- user_has_permission() is hardcoded to auth.uid() (it is the building
-- block for RLS policies and self-service RPCs, where that is exactly
-- right). The action engine below needs to re-check a DIFFERENT
-- specific user's live authority — the rule owner, who is not
-- necessarily the session executing the triggering statement — so it
-- needs an explicit-subject variant rather than reusing that function
-- under a borrowed identity.
create or replace function public.user_has_permission_for(p_user_id uuid, p_workspace_id uuid, p_permission_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = p_user_id
      and ur.workspace_id = p_workspace_id
      and p.slug = p_permission_slug
      and pr.status = 'active'
      and pr.deleted_at is null
  );
$$;

comment on function public.user_has_permission_for(uuid, uuid, text) is
  'Same logic as user_has_permission() but for an explicitly-named user rather than auth.uid() — used by the automation action engine to re-check the RULE OWNER''s live authority (a rule can execute from a trigger fired by any session, not just its owner''s).';

-- ================================================================
-- PART F — ACTION ENGINE. A fixed, whitelisted catalogue — no
-- arbitrary SQL, no stored/executed code. Every action re-validates
-- authorization live against the rule's own owner (created_by /
-- updated_by) — a rule''s mere existence never implies permission.
-- ================================================================
create or replace function public.execute_automation_action(
  p_execution_id uuid,
  p_action_seq integer,
  p_action jsonb,
  p_event public.automation_events,
  p_rule public.automation_rules
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_row public.automation_execution_actions%rowtype;
  v_action_type text := p_action ->> 'type';
  v_config jsonb := coalesce(p_action -> 'config', '{}'::jsonb);
  v_actor uuid := coalesce(p_rule.updated_by, p_rule.created_by);
  v_order public.orders%rowtype;
  v_task public.order_tasks%rowtype;
  v_assignee uuid;
  v_title text;
  v_notify_user uuid;
  v_result jsonb := '{}'::jsonb;
  v_status text := 'succeeded';
  v_error text;
begin
  insert into public.automation_execution_actions (execution_id, action_seq, action_type, action_config)
  values (p_execution_id, p_action_seq, coalesce(v_action_type, 'UNKNOWN'), v_config)
  on conflict (execution_id, action_seq) do update set action_type = excluded.action_type
  returning * into v_action_row;

  -- Idempotency: an already-succeeded action is never repeated.
  if v_action_row.status = 'succeeded' then
    return v_action_row.status;
  end if;

  if v_actor is null then
    update public.automation_execution_actions
      set status = 'skipped', error_message = 'rule has no owning user to act as', updated_at = now()
      where id = v_action_row.id;
    return 'skipped';
  end if;

  begin
    case v_action_type

      when 'CREATE_TASK' then
        if p_event.entity_type <> 'order' or p_event.entity_id is null then
          raise exception 'CREATE_TASK requires an order entity';
        end if;
        if not (public.user_has_permission_for(v_actor, p_rule.workspace_id, 'tasks.create') or public.user_has_permission_for(v_actor, p_rule.workspace_id, 'tasks.manage')) then
          raise exception 'insufficient_permission: rule owner no longer holds tasks.create';
        end if;
        select * into v_order from public.orders where id = p_event.entity_id and deleted_at is null;
        if not found then
          raise exception 'Order not found';
        end if;
        v_title := coalesce(v_config ->> 'title', 'Automated follow-up: ' || p_rule.name);

        insert into public.order_tasks (
          workspace_id, brand_id, order_id, customer_id, task_type, title, description, priority, assigned_to, created_by, updated_by
        ) values (
          v_order.workspace_id, v_order.brand_id, v_order.id, v_order.customer_id,
          coalesce(v_config ->> 'task_type', 'OTHER'), v_title, v_config ->> 'description',
          coalesce(v_config ->> 'priority', 'normal'), null, v_actor, v_actor
        )
        returning * into v_task;

        insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
        values (v_order.id, v_order.workspace_id, v_order.brand_id, 'TASK_CREATED',
          'Follow-up task created by automation rule "' || p_rule.name || '": ' || v_title,
          jsonb_build_object('task_id', v_task.id, 'automation_rule_id', p_rule.id), v_actor);

        v_result := jsonb_build_object('task_id', v_task.id);

      when 'ASSIGN_TASK' then
        v_task.id := coalesce((v_config ->> 'task_id')::uuid, (p_event.payload ->> 'task_id')::uuid);
        if v_task.id is null and p_event.entity_type = 'task' then
          v_task.id := p_event.entity_id;
        end if;
        if v_task.id is null then
          raise exception 'ASSIGN_TASK requires a task_id (from config or the triggering task event)';
        end if;
        select * into v_task from public.order_tasks where id = v_task.id;
        if not found then
          raise exception 'Task not found';
        end if;
        if not (public.user_has_permission_for(v_actor, v_task.workspace_id, 'tasks.assign') or public.user_has_permission_for(v_actor, v_task.workspace_id, 'tasks.manage')) then
          raise exception 'insufficient_permission: rule owner no longer holds tasks.assign';
        end if;
        v_assignee := public.resolve_assignment(v_task.workspace_id, v_task.brand_id, 'tasks');
        if v_assignee is null then
          v_status := 'skipped';
          v_error := 'no eligible staff / manual strategy';
        else
          update public.order_tasks set assigned_to = v_assignee, updated_by = v_actor where id = v_task.id;
          if v_assignee <> v_actor then
            insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
            values (v_task.workspace_id, v_task.brand_id, v_assignee, 'task_assigned', 'Follow-up task assigned to you',
              v_task.title, 'normal', '/orders/' || v_task.order_id, jsonb_build_object('task_id', v_task.id, 'automation_rule_id', p_rule.id));
          end if;
          v_result := jsonb_build_object('assigned_to', v_assignee);
        end if;

      when 'ASSIGN_ORDER' then
        if p_event.entity_type <> 'order' or p_event.entity_id is null then
          raise exception 'ASSIGN_ORDER requires an order entity';
        end if;
        select * into v_order from public.orders where id = p_event.entity_id and deleted_at is null;
        if not found then
          raise exception 'Order not found';
        end if;
        if not public.user_has_permission_for(v_actor, v_order.workspace_id, 'orders.assign') then
          raise exception 'insufficient_permission: rule owner no longer holds orders.assign';
        end if;
        v_assignee := public.resolve_assignment(v_order.workspace_id, v_order.brand_id, 'orders');
        if v_assignee is null then
          v_status := 'skipped';
          v_error := 'no eligible staff / manual strategy';
        else
          update public.orders set assigned_to = v_assignee, updated_by = v_actor where id = v_order.id;
          if v_assignee <> v_actor then
            insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
            values (v_order.workspace_id, v_order.brand_id, v_assignee, 'task_assigned', 'Order assigned to you',
              'Order ' || v_order.order_number, 'normal', '/orders/' || v_order.id, jsonb_build_object('automation_rule_id', p_rule.id));
          end if;
          v_result := jsonb_build_object('assigned_to', v_assignee);
        end if;

      when 'CREATE_NOTIFICATION' then
        v_notify_user := nullif(v_config ->> 'user_id', '')::uuid;
        insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
        values (
          p_rule.workspace_id, coalesce(p_rule.brand_id, p_event.brand_id), v_notify_user,
          coalesce(v_config ->> 'notification_type', 'automation'),
          coalesce(v_config ->> 'title', p_rule.name),
          coalesce(v_config ->> 'message', 'Triggered by automation rule "' || p_rule.name || '".'),
          coalesce(v_config ->> 'priority', 'normal'),
          v_config ->> 'link',
          jsonb_build_object('automation_rule_id', p_rule.id, 'event_id', p_event.id)
        )
        returning jsonb_build_object('notification_user_id', user_id) into v_result;

      when 'TRIGGER_APPROVAL' then
        if p_event.entity_id is null then
          raise exception 'TRIGGER_APPROVAL requires an entity_id';
        end if;
        v_result := public.create_approval_request(
          p_rule.workspace_id, coalesce(p_rule.brand_id, p_event.brand_id), null,
          coalesce(v_config ->> 'module', p_event.entity_type), p_event.entity_type, p_event.entity_id,
          nullif(v_config ->> 'amount', '')::numeric, v_actor
        );

      when 'UPDATE_SUPPORTED_RECORD' then
        -- Deliberately narrow: the ONLY supported mutation is
        -- appending a tag to an order. Anything else is rejected
        -- rather than pretending to support arbitrary field writes.
        if coalesce(v_config ->> 'field', '') <> 'tags' or coalesce(v_config ->> 'operation', '') <> 'add_tag' or p_event.entity_type <> 'order' then
          v_status := 'skipped';
          v_error := 'unsupported_record_update';
        else
          if not (public.user_has_permission_for(v_actor, p_rule.workspace_id, 'orders.update') or public.user_has_permission_for(v_actor, p_rule.workspace_id, 'orders.manage')) then
            raise exception 'insufficient_permission: rule owner no longer holds orders.update';
          end if;
          update public.orders
            set tags = case when v_config ->> 'value' = any(tags) then tags else array_append(tags, v_config ->> 'value') end,
                updated_by = v_actor
            where id = p_event.entity_id and deleted_at is null;
          v_result := jsonb_build_object('tag_added', v_config ->> 'value');
        end if;

      when 'SEND_SMS', 'SEND_WHATSAPP', 'SEND_EMAIL' then
        insert into public.communication_log (workspace_id, brand_id, channel, recipient, subject, body, status, related_execution_action_id)
        values (
          p_rule.workspace_id, coalesce(p_rule.brand_id, p_event.brand_id),
          case v_action_type when 'SEND_SMS' then 'sms' when 'SEND_WHATSAPP' then 'whatsapp' else 'email' end,
          v_config ->> 'recipient', v_config ->> 'subject', v_config ->> 'body',
          'not_configured', v_action_row.id
        );
        v_status := 'skipped';
        v_error := 'not_configured: no communication provider is integrated yet';

      when 'LOG_EVENT' then
        v_result := jsonb_build_object('logged', true, 'note', v_config ->> 'note');

      else
        v_status := 'skipped';
        v_error := 'unsupported_action_type: ' || coalesce(v_action_type, '(missing)');
    end case;

  exception when others then
    v_status := 'failed';
    v_error := left(SQLERRM, 2000);
  end;

  update public.automation_execution_actions
    set status = v_status, result = v_result, error_message = v_error, updated_at = now()
    where id = v_action_row.id;

  -- Deliberately does NOT re-raise on failure: the failure is already
  -- durably recorded on the row above, and the caller wraps this call
  -- in its own exception-catching block for isolation between
  -- actions/rules — re-raising here would roll that catch block back
  -- to its savepoint and silently undo the very row this just wrote.
  -- Callers must read the returned status, not catch an exception, to
  -- learn whether the action failed.
  return v_status;
end;
$$;

comment on function public.execute_automation_action(uuid, integer, jsonb, public.automation_events, public.automation_rules) is
  'Fixed action catalogue: CREATE_TASK, ASSIGN_TASK, ASSIGN_ORDER, CREATE_NOTIFICATION, TRIGGER_APPROVAL, UPDATE_SUPPORTED_RECORD (order tags only), SEND_SMS/WHATSAPP/EMAIL (always not_configured — no provider exists), LOG_EVENT. No arbitrary SQL/code execution path exists. Re-checks user_has_permission_for() against the rule owner (not the session that happened to fire the triggering event) at execution time for every mutating action — a rule''s existence never implies the action is still authorized.';


-- ================================================================
-- PART G — APPROVAL RULE EXECUTION (consumes Phase 7's
-- approval_rules directly — no redundant automation_rule authoring
-- required for the standard ad_costs/withdrawals/affiliates/orders
-- approval-threshold use case).
-- ================================================================
create or replace function public.create_approval_request(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_approval_rule_id uuid,
  p_module text,
  p_entity_type text,
  p_entity_id uuid,
  p_amount numeric,
  p_requested_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests%rowtype;
  v_role_name text;
begin
  insert into public.approval_requests (workspace_id, brand_id, approval_rule_id, module, entity_type, entity_id, amount, requested_by)
  values (p_workspace_id, p_brand_id, p_approval_rule_id, p_module, p_entity_type, p_entity_id, p_amount, p_requested_by)
  on conflict (module, entity_id) where status = 'PENDING' do nothing
  returning * into v_request;

  if v_request.id is null then
    -- Already has an open request — idempotent no-op.
    select * into v_request from public.approval_requests where module = p_module and entity_id = p_entity_id and status = 'PENDING';
    return jsonb_build_object('approval_request_id', v_request.id, 'already_pending', true);
  end if;

  if p_approval_rule_id is not null then
    select r.name into v_role_name from public.approval_rules ar join public.roles r on r.id = ar.required_approver_role_id where ar.id = p_approval_rule_id;
  end if;

  insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
  values (
    p_workspace_id, p_brand_id, null, 'approval_requested',
    initcap(p_module) || ' approval required',
    coalesce('Requires approval' || (case when v_role_name is not null then ' from ' || v_role_name else '' end) || (case when p_amount is not null then ' — amount ' || p_amount else '' end)),
    'high', null, jsonb_build_object('approval_request_id', v_request.id, 'module', p_module, 'entity_id', p_entity_id)
  );

  return jsonb_build_object('approval_request_id', v_request.id, 'already_pending', false);
end;
$$;

create or replace function public.decide_approval_request(p_approval_request_id uuid, p_decision text, p_note text default null)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests%rowtype;
  v_rule public.approval_rules%rowtype;
  v_module_approve_slug text;
  v_has_role boolean := true;
  v_has_module_permission boolean := false;
begin
  select * into v_request from public.approval_requests where id = p_approval_request_id for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if v_request.status <> 'PENDING' then
    raise exception 'Approval request is already %', v_request.status;
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'decision must be APPROVED or REJECTED';
  end if;

  v_module_approve_slug := v_request.module || '.approve';
  v_has_module_permission := public.user_has_permission(v_request.workspace_id, v_module_approve_slug)
    or public.user_has_permission(v_request.workspace_id, v_request.module || '.manage')
    or public.user_has_permission(v_request.workspace_id, 'approval_rules.manage');

  if v_request.approval_rule_id is not null then
    select * into v_rule from public.approval_rules where id = v_request.approval_rule_id;
    if v_rule.required_approver_role_id is not null then
      v_has_role := exists (
        select 1 from public.user_roles where user_id = auth.uid() and workspace_id = v_request.workspace_id and role_id = v_rule.required_approver_role_id
      );
    end if;
  end if;

  if not (v_has_module_permission and v_has_role) then
    raise exception 'insufficient_permission: cannot decide this approval request';
  end if;

  update public.approval_requests
    set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = p_note
    where id = p_approval_request_id
    returning * into v_request;

  return v_request;
end;
$$;

comment on function public.decide_approval_request(uuid, text, text) is
  'Approve/reject one approval_requests row. Requires the deciding user to currently hold the target module''s own *.approve/*.manage permission (or approval_rules.manage) AND, if the rule specifies required_approver_role_id, to actually hold that role — re-checked live, not assumed from rule configuration.';

create or replace function public.evaluate_approval_rules_for_event(p_event public.automation_events)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text;
  v_amount numeric;
  v_rule public.approval_rules%rowtype;
begin
  v_module := case p_event.event_type
    when 'ad_cost.created' then 'ad_costs'
    when 'affiliate.withdrawal_requested' then 'withdrawals'
    else null
  end;
  if v_module is null then
    return;
  end if;
  v_amount := nullif(p_event.payload ->> 'amount', '')::numeric;

  select * into v_rule from public.approval_rules
  where workspace_id = p_event.workspace_id
    and module = v_module
    and is_active and deleted_at is null
    and (brand_id = p_event.brand_id or brand_id is null)
    and (threshold_amount is null or v_amount is null or v_amount > threshold_amount)
  order by brand_id nulls last
  limit 1;

  if found then
    perform public.create_approval_request(
      p_event.workspace_id, p_event.brand_id, v_rule.id, v_module, p_event.entity_type, p_event.entity_id, v_amount, null
    );
  end if;
end;
$$;

comment on function public.evaluate_approval_rules_for_event(public.automation_events) is
  'Consumes Phase 7''s approval_rules directly (module + threshold), independent of any user-authored automation_rules — a workspace that only configures Settings > Approval Rules gets working approval requests with zero additional automation-rule authoring required.';


-- ---------------------------------------------------------------
-- Integrate (not duplicate) with the EXISTING approve RPCs: add one
-- early guard, preserve every other line byte-for-byte.
-- ---------------------------------------------------------------
create or replace function public.approve_ad_cost(p_ad_cost_id uuid)
returns public.ad_costs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_cost public.ad_costs%rowtype;
  v_open_request public.approval_requests%rowtype;
begin
  select * into v_ad_cost from public.ad_costs where id = p_ad_cost_id and status = 'PENDING' for update;
  if not found then
    raise exception 'Ad cost entry not found or not pending';
  end if;
  if not public.user_has_permission(v_ad_cost.workspace_id, 'ad_costs.approve') then
    raise exception 'insufficient_permission: ad_costs.approve required';
  end if;

  select * into v_open_request from public.approval_requests
    where module = 'ad_costs' and entity_id = p_ad_cost_id and status = 'PENDING';
  if found then
    perform public.decide_approval_request(v_open_request.id, 'APPROVED', 'Approved via approve_ad_cost()');
  end if;

  update public.ad_costs
    set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_ad_cost_id
    returning * into v_ad_cost;

  return v_ad_cost;
end;
$$;

comment on function public.approve_ad_cost(uuid) is
  'Byte-identical to the 0024 original except: if an open (PENDING) approval_requests row exists for this ad cost, decide_approval_request() is invoked first — which itself re-checks the deciding user holds the required role, so a workspace with no approval_rules configured for ad_costs sees zero behavior change.';

create or replace function public.approve_affiliate_withdrawal(p_withdrawal_id uuid)
returns public.affiliate_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal public.affiliate_withdrawals%rowtype;
  v_open_request public.approval_requests%rowtype;
begin
  select * into v_withdrawal from public.affiliate_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Withdrawal not found';
  end if;
  if not public.user_has_permission(v_withdrawal.workspace_id, 'withdrawals.approve') then
    raise exception 'insufficient_permission: withdrawals.approve required';
  end if;
  if v_withdrawal.status <> 'PENDING' then
    raise exception 'Only a pending withdrawal can be approved';
  end if;

  select * into v_open_request from public.approval_requests
    where module = 'withdrawals' and entity_id = p_withdrawal_id and status = 'PENDING';
  if found then
    perform public.decide_approval_request(v_open_request.id, 'APPROVED', 'Approved via approve_affiliate_withdrawal()');
  end if;

  update public.affiliate_withdrawals
    set status = 'APPROVED', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_withdrawal_id
    returning * into v_withdrawal;

  return v_withdrawal;
end;
$$;

comment on function public.approve_affiliate_withdrawal(uuid) is
  'Byte-identical to the 0024 original except the same open-approval-request integration as approve_ad_cost() above.';


-- ================================================================
-- PART H — RULE MATCHING + EXECUTION PIPELINE
-- ================================================================
create or replace function public.process_automation_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.automation_events%rowtype;
  v_rule public.automation_rules%rowtype;
  v_execution public.automation_executions%rowtype;
  v_action jsonb;
  v_seq integer;
  v_any_failed boolean;
  v_action_status text;
begin
  select * into v_event from public.automation_events where id = p_event_id;
  if not found then
    return;
  end if;

  -- Approval-rule policy is evaluated independently of user-authored
  -- automation_rules (Part G above) — isolated so a broken approval
  -- evaluation can never block rule matching below, or vice versa.
  begin
    perform public.evaluate_approval_rules_for_event(v_event);
  exception when others then
    null; -- best-effort; the event itself is still marked processed below
  end;

  for v_rule in
    select * from public.automation_rules
    where workspace_id = v_event.workspace_id
      and event_type = v_event.event_type
      and status = 'active'
      and deleted_at is null
      and (brand_id = v_event.brand_id or brand_id is null)
    order by priority asc, created_at asc
  loop
    -- Each rule is fully isolated: an exception anywhere inside this
    -- block is caught here and recorded on the execution row, never
    -- allowed to stop subsequent rules or abort the caller's own
    -- transaction (Part 19).
    begin
      if not public.evaluate_automation_conditions(v_rule.conditions, v_rule.conditions_logic, v_event.payload) then
        continue;
      end if;

      insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status, correlation_id, started_at)
      values (v_event.id, v_rule.id, v_event.workspace_id, v_event.brand_id, 'running', v_event.correlation_id, now())
      on conflict (event_id, rule_id) do update set status = 'running', started_at = now(), attempts = automation_executions.attempts + 1
      returning * into v_execution;

      if v_execution.status = 'succeeded' then
        -- Already fully processed for this event+rule — idempotent no-op.
        continue;
      end if;

      v_any_failed := false;
      v_seq := 0;
      for v_action in select jsonb_array_elements(coalesce(v_rule.actions, '[]'::jsonb))
      loop
        begin
          v_action_status := public.execute_automation_action(v_execution.id, v_seq, v_action, v_event, v_rule);
        exception when others then
          v_action_status := 'failed';
        end;
        if v_action_status is distinct from 'succeeded' and v_action_status is distinct from 'skipped' then
          v_any_failed := true;
        end if;
        v_seq := v_seq + 1;
      end loop;

      if v_any_failed then
        update public.automation_executions
          set status = case when attempts >= max_attempts then 'failed' else 'retrying' end,
              error_message = 'one or more actions failed — see automation_execution_actions',
              next_retry_at = case when attempts < max_attempts then now() + (attempts || ' minutes')::interval else null end,
              completed_at = case when attempts >= max_attempts then now() else null end,
              updated_at = now()
          where id = v_execution.id;

        if v_execution.attempts >= v_execution.max_attempts then
          insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
          values (v_event.workspace_id, v_event.brand_id, coalesce(v_rule.updated_by, v_rule.created_by), 'automation', 'execution_failed',
            'automation_execution', v_execution.id, jsonb_build_object('rule_id', v_rule.id, 'event_id', v_event.id));

          insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
          values (v_event.workspace_id, v_event.brand_id, coalesce(v_rule.updated_by, v_rule.created_by), 'automation_execution_failed',
            'Automation rule failed', 'Rule "' || v_rule.name || '" failed after ' || v_execution.attempts || ' attempt(s).',
            'high', '/automation/executions', jsonb_build_object('execution_id', v_execution.id));
        end if;
      else
        update public.automation_executions
          set status = 'succeeded', completed_at = now(), error_message = null, next_retry_at = null, updated_at = now()
          where id = v_execution.id;
      end if;

    exception when others then
      -- The rule/condition evaluation itself blew up (e.g. malformed
      -- actions jsonb) — record what we can and move to the next rule.
      insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status, error_message, completed_at, correlation_id)
      values (v_event.id, v_rule.id, v_event.workspace_id, v_event.brand_id, 'failed', left(SQLERRM, 2000), now(), v_event.correlation_id)
      on conflict (event_id, rule_id) do update set status = 'failed', error_message = left(SQLERRM, 2000), completed_at = now();
    end;
  end loop;

  update public.automation_events set processing_status = 'processed', processed_at = now() where id = p_event_id;
end;
$$;

comment on function public.process_automation_event(uuid) is
  'The MATCH -> EVALUATE -> EXECUTE -> RECORD pipeline for one event. Filters rules by indexed workspace_id/event_type/status/priority BEFORE evaluating conditions (Part 29 — never scans every rule for every event). Every rule is independently exception-isolated.';


-- ================================================================
-- PART I — RETRIES. Bounded, safe, idempotent (a retry of an
-- already-succeeded execution/action is a guaranteed no-op — see
-- Part F/H above).
-- ================================================================
create or replace function public.retry_automation_execution(p_execution_id uuid)
returns public.automation_executions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_execution public.automation_executions%rowtype;
  v_event public.automation_events%rowtype;
  v_rule public.automation_rules%rowtype;
  v_action jsonb;
  v_seq integer := 0;
  v_any_failed boolean := false;
  v_action_status text;
begin
  select * into v_execution from public.automation_executions where id = p_execution_id for update;
  if not found then
    raise exception 'Execution not found';
  end if;
  if not public.user_has_permission(v_execution.workspace_id, 'automation.manage') then
    raise exception 'insufficient_permission: automation.manage required to retry an execution';
  end if;
  if v_execution.status not in ('failed', 'retrying') then
    raise exception 'Only a failed/retrying execution can be retried (currently %)', v_execution.status;
  end if;

  select * into v_event from public.automation_events where id = v_execution.event_id;
  select * into v_rule from public.automation_rules where id = v_execution.rule_id;
  if v_rule.status <> 'active' then
    raise exception 'Cannot retry — rule is now % (must be active)', v_rule.status;
  end if;

  update public.automation_executions set status = 'running', attempts = attempts + 1, started_at = now(), updated_at = now() where id = p_execution_id;

  for v_action in select jsonb_array_elements(coalesce(v_rule.actions, '[]'::jsonb))
  loop
    begin
      v_action_status := public.execute_automation_action(p_execution_id, v_seq, v_action, v_event, v_rule);
    exception when others then
      v_action_status := 'failed';
    end;
    if v_action_status is distinct from 'succeeded' and v_action_status is distinct from 'skipped' then
      v_any_failed := true;
    end if;
    v_seq := v_seq + 1;
  end loop;

  if v_any_failed then
    update public.automation_executions
      set status = case when attempts >= max_attempts then 'failed' else 'retrying' end,
          error_message = 'one or more actions failed on manual retry', updated_at = now()
      where id = p_execution_id
      returning * into v_execution;
  else
    update public.automation_executions
      set status = 'succeeded', completed_at = now(), error_message = null, next_retry_at = null, updated_at = now()
      where id = p_execution_id
      returning * into v_execution;
  end if;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (v_execution.workspace_id, v_execution.brand_id, auth.uid(), 'automation', 'manual_retry', 'automation_execution', p_execution_id,
    jsonb_build_object('resulting_status', v_execution.status));

  return v_execution;
end;
$$;

comment on function public.retry_automation_execution(uuid) is
  'Manual retry — gated on automation.manage, re-checks the rule is still active (an archived/paused rule cannot be retried into running), and is safe against duplicating already-succeeded actions because execute_automation_action() itself no-ops on a succeeded action row.';

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
  -- Batch sweep for time-based retries. Intended to be called
  -- periodically by an external scheduler (pg_cron / a Supabase
  -- scheduled trigger) — see the final report; nothing in this
  -- sandbox invokes this automatically. FOR UPDATE SKIP LOCKED makes
  -- concurrent sweeps (or a sweep racing a manual retry) safe.
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
      if v_action_status is distinct from 'succeeded' and v_action_status is distinct from 'skipped' then
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
  'Batch retry sweep for executions past their next_retry_at. SECURITY DEFINER, no client-facing permission check (it only acts on rows already scoped by their own workspace_id/rule state) — intended to be invoked by a trusted scheduler, not exposed as a UI action. Uses FOR UPDATE SKIP LOCKED so concurrent invocations never double-process the same execution.';


-- ================================================================
-- PART J — PERMISSION CATALOGUE
-- ================================================================
insert into public.permissions (module, action, slug, category, description) values
  ('automation', 'view', 'automation.view', 'Automation', 'View automation rules, events and execution history'),
  ('automation', 'manage', 'automation.manage', 'Automation', 'Create/edit/archive automation rules and manually retry executions')
on conflict (slug) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug in ('owner', 'admin') and p.module = 'automation'
on conflict do nothing;

-- Manager: visibility only — mirrors the exact same posture Phase 7
-- gave Manager for assignment_rules/approval_rules (configuring
-- workspace-wide automation is an Owner/Admin decision).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager' and p.slug = 'automation.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer' and p.slug = 'automation.view'
on conflict do nothing;

-- Customer Support, Warehouse Staff, Finance, Marketing, Affiliate
-- Manager get nothing from the automation module — deliberate,
-- matching the same boundary those roles already have for
-- assignment_rules/approval_rules/roles_permissions/workspace.


-- ================================================================
-- PART K — EVENT-EMITTING TRIGGERS. Each is a small, additive
-- AFTER trigger that builds a payload from the ACTUAL row (never
-- client input) and calls emit_automation_event(). None of these
-- modify any existing trigger's behavior.
-- ================================================================

-- Orders -----------------------------------------------------------
create or replace function public.emit_order_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_automation_event(
    new.workspace_id, new.brand_id, 'orders.created', 'order', new.id,
    jsonb_build_object('order', jsonb_build_object(
      'id', new.id, 'order_number', new.order_number, 'status', new.status, 'priority', new.priority,
      'total_value', new.total_amount, 'source', new.source, 'customer_id', new.customer_id,
      'is_repeat_customer', new.is_repeat_customer
    )),
    'orders.created:' || new.id
  );
  return new;
end;
$$;

create trigger emit_orders_created after insert on public.orders for each row execute function public.emit_order_created_event();

create or replace function public.emit_order_status_changed_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_specific_type text;
begin
  if new.status is distinct from old.status then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'orders.status_changed', 'order', new.id,
      jsonb_build_object('order', jsonb_build_object('id', new.id, 'order_number', new.order_number, 'total_value', new.total_amount),
        'old_status', old.status, 'new_status', new.status),
      'orders.status_changed:' || new.id || ':' || old.status || '->' || new.status
    );

    v_specific_type := case new.status
      when 'DELIVERED' then 'orders.delivered'
      when 'CANCELLED' then 'orders.cancelled'
      when 'RETURNED' then 'orders.returned'
      else null
    end;
    if v_specific_type is not null then
      perform public.emit_automation_event(
        new.workspace_id, new.brand_id, v_specific_type, 'order', new.id,
        jsonb_build_object('order', jsonb_build_object('id', new.id, 'order_number', new.order_number, 'total_value', new.total_amount)),
        v_specific_type || ':' || new.id || ':' || old.status || '->' || new.status
      );
    end if;
  end if;

  if new.cash_collection_status is distinct from old.cash_collection_status
     and new.cash_collection_status in ('collected', 'partial')
     and old.cash_collection_status not in ('collected', 'partial') then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'orders.payment_collected', 'order', new.id,
      jsonb_build_object('order', jsonb_build_object('id', new.id, 'order_number', new.order_number,
        'collected_amount', new.cash_collected_amount, 'total_value', new.total_amount)),
      'orders.payment_collected:' || new.id || ':' || new.cash_collection_status
    );
  end if;

  return new;
end;
$$;

create trigger emit_orders_status_changed after update of status, cash_collection_status on public.orders
  for each row execute function public.emit_order_status_changed_event();

-- Customers ----------------------------------------------------------
create or replace function public.emit_customer_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_automation_event(
    new.workspace_id, new.brand_id, 'customers.created', 'customer', new.id,
    jsonb_build_object('customer', jsonb_build_object('id', new.id, 'full_name', new.full_name, 'phone', new.phone)),
    'customers.created:' || new.id
  );
  return new;
end;
$$;

create trigger emit_customers_created after insert on public.customers for each row execute function public.emit_customer_created_event();

create or replace function public.emit_customer_repeat_detected_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_repeat_customer and not coalesce(old.is_repeat_customer, false) then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'customers.repeat_detected', 'customer', new.id,
      jsonb_build_object('customer', jsonb_build_object('id', new.id, 'full_name', new.full_name, 'total_orders', new.total_orders)),
      'customers.repeat_detected:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger emit_customers_repeat_detected after update of is_repeat_customer on public.customers
  for each row execute function public.emit_customer_repeat_detected_event();

-- Inventory ------------------------------------------------------------
create or replace function public.emit_inventory_stock_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.track_inventory or new.stock_quantity is not distinct from old.stock_quantity then
    return new;
  end if;

  if new.stock_quantity <= 0 and old.stock_quantity > 0 then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'inventory.out_of_stock', 'product', new.id,
      jsonb_build_object('product', jsonb_build_object('id', new.id, 'name', new.name, 'stock_quantity', new.stock_quantity)),
      'inventory.out_of_stock:' || new.id || ':' || date_trunc('minute', now())::text
    );
  elsif new.stock_quantity <= new.low_stock_threshold and old.stock_quantity > new.low_stock_threshold then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'inventory.low_stock', 'product', new.id,
      jsonb_build_object('product', jsonb_build_object('id', new.id, 'name', new.name, 'stock_quantity', new.stock_quantity, 'low_stock_threshold', new.low_stock_threshold)),
      'inventory.low_stock:' || new.id || ':' || date_trunc('minute', now())::text
    );
  end if;

  return new;
end;
$$;

create trigger emit_inventory_stock_events after update of stock_quantity on public.products
  for each row execute function public.emit_inventory_stock_events();

comment on function public.emit_inventory_stock_events() is
  'Read-only observer of stock_quantity — never writes to stock_quantity/reserved_quantity itself. Fires only on genuine threshold-crossing edges (a repeated adjust_inventory() call that keeps stock below threshold does not re-emit). Idempotency key is minute-bucketed by design (a real crossing more than a minute apart is treated as a fresh, genuinely re-noteworthy event, not deduped away like a pure creation event would be).';

-- Follow-up tasks --------------------------------------------------------
create or replace function public.emit_task_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_automation_event(
    new.workspace_id, new.brand_id, 'tasks.created', 'task', new.id,
    jsonb_build_object('task', jsonb_build_object('id', new.id, 'order_id', new.order_id, 'task_type', new.task_type, 'priority', new.priority)),
    'tasks.created:' || new.id
  );
  return new;
end;
$$;

create trigger emit_tasks_created after insert on public.order_tasks for each row execute function public.emit_task_created_event();

create or replace function public.emit_task_completed_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'tasks.completed', 'task', new.id,
      jsonb_build_object('task', jsonb_build_object('id', new.id, 'order_id', new.order_id, 'task_type', new.task_type)),
      'tasks.completed:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger emit_tasks_completed after update of status on public.order_tasks for each row execute function public.emit_task_completed_event();

-- Waybills + delivery attempts --------------------------------------------
create or replace function public.emit_waybill_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'waybills.created', 'waybill', new.id,
      jsonb_build_object('waybill', jsonb_build_object('id', new.id, 'order_id', new.order_id, 'waybill_number', new.waybill_number)),
      'waybills.created:' || new.id
    );
  elsif new.status = 'DISPATCHED' and old.status is distinct from 'DISPATCHED' then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'waybills.dispatched', 'waybill', new.id,
      jsonb_build_object('waybill', jsonb_build_object('id', new.id, 'order_id', new.order_id, 'waybill_number', new.waybill_number)),
      'waybills.dispatched:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger emit_waybills_created after insert on public.waybills for each row execute function public.emit_waybill_events();
create trigger emit_waybills_dispatched after update of status on public.waybills for each row execute function public.emit_waybill_events();

create or replace function public.emit_delivery_attempt_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_automation_event(
    new.workspace_id, new.brand_id, 'waybills.delivery_attempted', 'delivery_attempt', new.id,
    jsonb_build_object('order_id', new.order_id, 'waybill_id', new.waybill_id, 'attempt_number', new.attempt_number, 'result', new.result),
    'waybills.delivery_attempted:' || new.id
  );
  return new;
end;
$$;

create trigger emit_delivery_attempts after insert on public.delivery_attempts for each row execute function public.emit_delivery_attempt_event();

-- Settlements -------------------------------------------------------------
create or replace function public.emit_settlement_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'settlements.created', 'order_settlement', new.id,
      jsonb_build_object('order_id', new.order_id, 'collected_amount', new.collected_amount, 'remitted_amount', new.remitted_amount, 'discrepancy', new.discrepancy),
      'settlements.created:' || new.id
    );
  elsif new.status = 'SETTLED' and old.status is distinct from 'SETTLED' then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'settlements.completed', 'order_settlement', new.id,
      jsonb_build_object('order_id', new.order_id, 'remitted_amount', new.remitted_amount),
      'settlements.completed:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger emit_settlements_created after insert on public.order_settlements for each row execute function public.emit_settlement_events();
create trigger emit_settlements_completed after update of status on public.order_settlements for each row execute function public.emit_settlement_events();

-- Affiliate ------------------------------------------------------------
create or replace function public.emit_commission_earned_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_automation_event(
    new.workspace_id, null, 'affiliate.commission_earned', 'affiliate_commission', new.id,
    jsonb_build_object('affiliate_id', new.affiliate_id, 'order_id', new.order_id, 'commission_amount', new.commission_amount),
    'affiliate.commission_earned:' || new.id
  );
  return new;
end;
$$;

create trigger emit_commission_earned after insert on public.affiliate_commissions for each row execute function public.emit_commission_earned_event();

create or replace function public.emit_withdrawal_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.emit_automation_event(
      new.workspace_id, null, 'affiliate.withdrawal_requested', 'affiliate_withdrawal', new.id,
      jsonb_build_object('affiliate_id', new.affiliate_id, 'amount', new.amount),
      'affiliate.withdrawal_requested:' || new.id
    );
  elsif new.status = 'APPROVED' and old.status is distinct from 'APPROVED' then
    perform public.emit_automation_event(
      new.workspace_id, null, 'affiliate.withdrawal_approved', 'affiliate_withdrawal', new.id,
      jsonb_build_object('affiliate_id', new.affiliate_id, 'amount', new.amount),
      'affiliate.withdrawal_approved:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger emit_withdrawals_requested after insert on public.affiliate_withdrawals for each row execute function public.emit_withdrawal_events();
create trigger emit_withdrawals_approved after update of status on public.affiliate_withdrawals for each row execute function public.emit_withdrawal_events();

-- Ad costs ---------------------------------------------------------------
create or replace function public.emit_ad_cost_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'ad_cost.created', 'ad_cost', new.id,
      jsonb_build_object('amount', new.initial_cost_amount, 'campaign_id', new.campaign_id),
      'ad_cost.created:' || new.id
    );
  elsif new.status = 'APPROVED' and old.status is distinct from 'APPROVED' then
    perform public.emit_automation_event(
      new.workspace_id, new.brand_id, 'ad_cost.approved', 'ad_cost', new.id,
      jsonb_build_object('amount', new.initial_cost_amount),
      'ad_cost.approved:' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger emit_ad_costs_created after insert on public.ad_costs for each row execute function public.emit_ad_cost_events();
create trigger emit_ad_costs_approved after update of status on public.ad_costs for each row execute function public.emit_ad_cost_events();

-- Staff --------------------------------------------------------------------
create or replace function public.emit_staff_invited_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_automation_event(
    new.workspace_id, new.brand_id, 'staff.invited', 'staff_invitation', new.id,
    jsonb_build_object('email', new.email, 'role_id', new.role_id),
    'staff.invited:' || new.id
  );
  return new;
end;
$$;

create trigger emit_staff_invited after insert on public.staff_invitations for each row execute function public.emit_staff_invited_event();

-- staff.suspended is emitted from inside set_staff_status() itself
-- (below) rather than a trigger on profiles, because profiles has no
-- workspace_id — exactly the same reason Phase 7 wrote audit/
-- notification logic directly into that RPC instead of a generic
-- trigger.
create or replace function public.set_staff_status(p_workspace_id uuid, p_user_id uuid, p_status text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_old_status text;
begin
  if not public.user_has_permission(p_workspace_id, 'staff.manage') then
    raise exception 'insufficient_permission: staff.manage required';
  end if;
  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'Invalid status %, expected active/inactive/suspended', p_status;
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Cannot change your own status through this action.';
  end if;
  if not exists (select 1 from public.user_roles where workspace_id = p_workspace_id and user_id = p_user_id) then
    raise exception 'That person is not a member of this workspace.';
  end if;

  select status into v_old_status from public.profiles where id = p_user_id and deleted_at is null;
  if v_old_status is null then
    raise exception 'Staff member not found';
  end if;

  update public.profiles set status = p_status, updated_by = auth.uid() where id = p_user_id
    returning * into v_profile;

  if v_old_status is distinct from p_status then
    insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
    values (
      p_workspace_id, null, auth.uid(), 'staff', 'status_change', 'staff', p_user_id,
      jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_status)
    );

    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata, created_by)
    values (
      p_workspace_id, null, p_user_id, 'staff_status_changed',
      case p_status
        when 'active' then 'Your account was reactivated'
        when 'suspended' then 'Your account was suspended'
        else 'Your account was deactivated'
      end,
      'A workspace administrator changed your account status to ' || p_status || '.',
      case when p_status in ('suspended', 'inactive') then 'high' else 'normal' end,
      '/staff/' || p_user_id, jsonb_build_object('old_status', v_old_status, 'new_status', p_status), auth.uid()
    );

    if p_status = 'suspended' then
      perform public.emit_automation_event(
        p_workspace_id, null, 'staff.suspended', 'staff', p_user_id,
        jsonb_build_object('user_id', p_user_id, 'old_status', v_old_status),
        'staff.suspended:' || p_user_id || ':' || now()::date
      );
    end if;
  end if;

  return v_profile;
end;
$$;


-- ================================================================
-- PART L — AUDIT for rule lifecycle mutations (create/update/
-- activate/pause/archive). Reuses log_ops_audit_event() exactly as
-- Phase 6/7 did for tables without deleted_at... automation_rules
-- DOES have deleted_at (soft-archive), so it gets its own tiny
-- action-labeling wrapper mirroring log_audit_event()'s archive-
-- inference pattern rather than the generic function (which only
-- infers 'archive' for products/categories by table name).
-- ================================================================
create or replace function public.log_automation_rule_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create';
  elsif new.deleted_at is not null and old.deleted_at is null then
    v_action := 'archive';
  elsif new.status is distinct from old.status and new.status = 'active' then
    v_action := 'activate';
  elsif new.status is distinct from old.status and new.status = 'paused' then
    v_action := 'pause';
  else
    v_action := 'update';
  end if;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    new.workspace_id, new.brand_id, auth.uid(), 'automation', v_action, 'automation_rule', new.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new)
  );
  return new;
end;
$$;

create trigger audit_automation_rules
  after insert or update on public.automation_rules
  for each row execute function public.log_automation_rule_audit_event();
