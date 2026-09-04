-- ============================================================
-- GCOS PHASE 10 — Customer Support & Rescue Intelligence.
--
-- This phase adds a support/rescue operational layer ON TOP of the
-- existing order lifecycle, customer records, Follow-up Tasks
-- (order_tasks), Rescue Board, Automation engine, notifications and
-- audit log. It does NOT touch the order state machine, does NOT add
-- a second customer-record system, and does NOT introduce a
-- competing "support order status" — orders/Finance alone remain
-- authoritative for order state and revenue.
--
-- What is reused, unmodified:
--   * order_tasks / create_order_task / assign_order_task /
--     update_order_task_status (0025) — the follow-up task system.
--     Phase 10 does not add a second task table or task RPCs.
--   * order_events — the order timeline (support actions append to
--     it exactly like task/settlement/waybill events already do).
--   * order_notes / customer_notes — free-text notes stay as-is;
--     Phase 10 does not replace them.
--   * notifications — no new notification table; support/rescue
--     events insert into the existing table exactly like
--     create_order_task()/create_order_settlement() already do.
--   * audit_logs — reused via the existing log_ops_audit_event()
--     trigger convention (module tag only), no second audit path.
--   * automation_events/automation_rules — 'tasks.created' and
--     'tasks.completed' (0028) already fire for every order_tasks
--     insert/completion, including support-flavored task_types
--     (CONFIRM_ORDER, CALL_BACK, VERIFY_ADDRESS, DELIVERY_FOLLOW_UP,
--     CUSTOMER_REQUEST, ...). Phase 10 deliberately reuses those
--     events for "support_task_created"/"follow_up_completed"
--     rather than emitting duplicate events for the same fact. Only
--     genuinely new facts get new event types: rescue.created,
--     rescue.escalated, rescue.converted, support_task_overdue.
--
-- What is genuinely new (nothing today models typed contact history
-- or a persisted rescue state machine):
--   * support_interactions — one authoritative, append-only,
--     typed contact-history log spanning both orders and customers
--     (calls, verifications, escalations, internal notes).
--   * rescue_cases / rescue_attempts — a real, persisted rescue
--     state machine with append-only attempt history. The existing
--     get_rescue_board() stays as the *computed* "what needs
--     rescuing" view (unmodified); rescue_cases is the new *acted-
--     upon* layer for orders staff have actually started rescuing.
-- ============================================================


-- ---------------------------------------------------------------
-- PART A — permission modules: support.*, rescue.*
--
-- support.view/support.manage ALREADY EXIST (0008) — seeded on day
-- one for a "Support" nav item (src/data/navigation.ts -> /support,
-- permission 'support.view') that was never built out (a Dashboard-
-- era placeholder, only ever granted to Owner/Admin). This phase is
-- exactly that build-out, so these slugs are reused, not duplicated
-- — the insert below is a no-op for them (on conflict do nothing)
-- and their description is refreshed to the real, now-shipped
-- meaning. support.create is the one genuinely new support.* action
-- (logging an interaction is a narrower capability than "manage").
-- rescue.* is entirely new — 0025's operations.view only ever
-- gated the read-only, computed Rescue Board, never a write surface.
-- ---------------------------------------------------------------
insert into public.permissions (module, action, slug, category, description) values
  ('support', 'view', 'support.view', 'Support', 'View the Support workspace, queue and contact history'),
  ('support', 'create', 'support.create', 'Support', 'Log support interactions (calls, verifications, notes)'),
  ('support', 'manage', 'support.manage', 'Support', 'Full support module access'),

  ('rescue', 'view', 'rescue.view', 'Rescue', 'View rescue cases and attempt history'),
  ('rescue', 'create', 'rescue.create', 'Rescue', 'Open a rescue case against an order'),
  ('rescue', 'update', 'rescue.update', 'Rescue', 'Progress a rescue case through its workflow'),
  ('rescue', 'escalate', 'rescue.escalate', 'Rescue', 'Escalate a rescue case'),
  ('rescue', 'manage', 'rescue.manage', 'Rescue', 'Full rescue case management')
on conflict (slug) do nothing;

update public.permissions set description = 'View the Support workspace, queue and contact history' where slug = 'support.view';
update public.permissions set description = 'Full support module access' where slug = 'support.manage';

-- Owner/Admin — full reach, mirrors every prior phase's convention.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin')
  and p.module in ('support', 'rescue')
on conflict do nothing;

-- Manager: full day-to-day reach, no *.manage catch-all (0025's own convention).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and p.module in ('support', 'rescue')
  and p.action <> 'manage'
on conflict do nothing;

-- Customer Support: this IS their job — log interactions, open and
-- work rescue cases end to end, escalate. No *.manage (module
-- reconfiguration stays with Owner/Admin/Manager) and, per the
-- brief, explicitly no finance permission of any kind (unaffected
-- by this migration — Customer Support was never granted any).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'customer-support'
  and p.module in ('support', 'rescue')
  and p.action <> 'manage'
on conflict do nothing;

-- Warehouse Staff: visibility only into rescue cases that affect
-- their delivery queue (e.g. HANDED_BACK_TO_DELIVERY) — never
-- customer-contact authority. No support.* grant at all: they do
-- not log customer interactions.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'warehouse-staff'
  and p.slug = 'rescue.view'
on conflict do nothing;

-- Viewer: read-only, consistent with its existing "every action='view'" grant.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer'
  and p.module in ('support', 'rescue')
  and p.action = 'view'
on conflict do nothing;

-- Deliberately NOT granted to Finance, Marketing or Affiliate
-- Manager — none has a legitimate reach into customer contact or
-- delivery rescue.


-- ---------------------------------------------------------------
-- PART B — rescue_cases: the persisted rescue state machine.
-- ---------------------------------------------------------------
create table public.rescue_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,

  status text not null default 'OPEN' check (status in (
    'OPEN', 'CONTACTING', 'CUSTOMER_REACHED', 'RESCHEDULED', 'ADDRESS_FIXED',
    'PHONE_FIXED', 'HANDED_BACK_TO_DELIVERY', 'CONVERTED', 'LOST', 'CANCELLED'
  )),
  reason text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),

  assigned_to uuid references public.profiles (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_reason text,

  escalated boolean not null default false,
  escalated_at timestamptz,
  escalated_by uuid references auth.users (id),
  escalation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table public.rescue_cases is
  'A persisted, real rescue workflow against an EXISTING order (never a duplicate order record). Orders/Finance alone still determine actual order status and revenue — rescue_cases.status only tracks the recovery effort itself.';

-- Exactly one active (non-terminal) rescue case per order, enforced
-- server-side, not just checked in the RPC — belt-and-suspenders
-- against a genuine concurrent-open race.
create unique index rescue_cases_active_order_idx on public.rescue_cases (order_id)
  where status not in ('CONVERTED', 'LOST', 'CANCELLED');

create index rescue_cases_workspace_status_idx on public.rescue_cases (workspace_id, status);
create index rescue_cases_assigned_to_idx on public.rescue_cases (assigned_to)
  where status not in ('CONVERTED', 'LOST', 'CANCELLED');
create index rescue_cases_escalated_idx on public.rescue_cases (workspace_id)
  where escalated and status not in ('CONVERTED', 'LOST', 'CANCELLED');
create index rescue_cases_order_id_idx on public.rescue_cases (order_id);

create trigger set_rescue_cases_updated_at
  before update on public.rescue_cases
  for each row execute function public.set_updated_at();

create trigger audit_rescue_cases
  after insert or update on public.rescue_cases
  for each row execute function public.log_ops_audit_event('rescue');

alter table public.rescue_cases enable row level security;

create policy "select_rescue_cases" on public.rescue_cases
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'rescue.view')
  );

-- No client insert/update/delete policy: every mutation carries side
-- effects (attempt history, order timeline, notifications,
-- automation events, transition validation) and goes through the
-- RPCs below, exactly the waybills/order_settlements convention.


-- ---------------------------------------------------------------
-- PART C — support_interactions: the one authoritative, append-only
-- typed contact-history log (orders AND customers).
-- ---------------------------------------------------------------
create table public.support_interactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,

  interaction_type text not null check (interaction_type in (
    'CALL', 'CONFIRMATION_CALL', 'FOLLOW_UP_CALL', 'DELIVERY_FOLLOW_UP',
    'ADDRESS_VERIFICATION', 'PHONE_VERIFICATION', 'CUSTOMER_REQUEST',
    'CANCELLATION_REQUEST', 'RESCUE_ATTEMPT', 'ESCALATION', 'INTERNAL_NOTE', 'OTHER'
  )),
  outcome text check (outcome in (
    'CUSTOMER_REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'CONFIRMED',
    'RESCHEDULED', 'CANCELLED', 'ADDRESS_UPDATED', 'PHONE_UPDATED', 'ESCALATED',
    'NOT_INTERESTED', 'UNABLE_TO_DELIVER', 'OTHER'
  )),
  summary text not null,

  related_task_id uuid references public.order_tasks (id) on delete set null,
  related_rescue_case_id uuid references public.rescue_cases (id) on delete set null,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),

  constraint support_interactions_scope_check check (order_id is not null or customer_id is not null)
);

comment on table public.support_interactions is
  'Append-only, typed contact history — surfaced consistently on Customer Detail, Order Detail and the Support workspace. Internal notes (interaction_type=INTERNAL_NOTE) are never customer-visible. Distinct from order_notes/customer_notes (unstructured free text, unchanged by this migration): this table is specifically the typed, outcome-tracked support/contact record.';

create index support_interactions_customer_idx on public.support_interactions (workspace_id, customer_id, created_at desc)
  where customer_id is not null;
create index support_interactions_order_idx on public.support_interactions (workspace_id, order_id, created_at desc)
  where order_id is not null;
create index support_interactions_workspace_idx on public.support_interactions (workspace_id, created_at desc);

create trigger audit_support_interactions
  after insert on public.support_interactions
  for each row execute function public.log_ops_audit_event('support');

alter table public.support_interactions enable row level security;

create policy "select_support_interactions" on public.support_interactions
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'support.view')
  );

-- No update/delete policy anywhere (immutable history) and no client
-- insert policy — creation goes through create_support_interaction()
-- (needs workspace/brand/customer resolved and validated server-side).


-- ---------------------------------------------------------------
-- PART D — rescue_attempts: append-only history of every rescue
-- state transition (the auditable "what happened, when, by whom").
-- ---------------------------------------------------------------
create table public.rescue_attempts (
  id uuid primary key default gen_random_uuid(),
  rescue_case_id uuid not null references public.rescue_cases (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  from_status text,
  to_status text not null,
  action_note text,
  outcome text check (outcome in (
    'CUSTOMER_REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'CONFIRMED',
    'RESCHEDULED', 'CANCELLED', 'ADDRESS_UPDATED', 'PHONE_UPDATED', 'ESCALATED',
    'NOT_INTERESTED', 'UNABLE_TO_DELIVER', 'OTHER'
  )),
  related_interaction_id uuid references public.support_interactions (id) on delete set null,

  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.rescue_attempts is
  'Append-only rescue state-transition history: before/after status, actor, timestamp, reason. Never overwritten — this is the record a rescue case cannot silently lose.';

create index rescue_attempts_case_idx on public.rescue_attempts (rescue_case_id, created_at);

alter table public.rescue_attempts enable row level security;

create policy "select_rescue_attempts" on public.rescue_attempts
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'rescue.view')
  );

-- Append-only, RPC-inserted only — no client insert/update/delete policy.


-- ---------------------------------------------------------------
-- PART E — rescue_case_transition_allowed(): the explicit,
-- inspectable state graph (mirrors order_status_transitions' role,
-- kept as a function rather than a seeded table since this graph is
-- small, internal-only and has no per-transition metadata to store).
-- ---------------------------------------------------------------
create or replace function public.rescue_case_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('OPEN', 'CONTACTING'), ('OPEN', 'CANCELLED'),
    ('CONTACTING', 'CUSTOMER_REACHED'), ('CONTACTING', 'CANCELLED'), ('CONTACTING', 'LOST'),
    ('CUSTOMER_REACHED', 'RESCHEDULED'), ('CUSTOMER_REACHED', 'ADDRESS_FIXED'), ('CUSTOMER_REACHED', 'PHONE_FIXED'),
    ('CUSTOMER_REACHED', 'LOST'), ('CUSTOMER_REACHED', 'CANCELLED'),
    ('RESCHEDULED', 'HANDED_BACK_TO_DELIVERY'), ('RESCHEDULED', 'LOST'), ('RESCHEDULED', 'CANCELLED'),
    ('ADDRESS_FIXED', 'HANDED_BACK_TO_DELIVERY'), ('ADDRESS_FIXED', 'LOST'), ('ADDRESS_FIXED', 'CANCELLED'),
    ('PHONE_FIXED', 'HANDED_BACK_TO_DELIVERY'), ('PHONE_FIXED', 'CONTACTING'), ('PHONE_FIXED', 'LOST'), ('PHONE_FIXED', 'CANCELLED'),
    ('HANDED_BACK_TO_DELIVERY', 'CONVERTED'), ('HANDED_BACK_TO_DELIVERY', 'LOST'), ('HANDED_BACK_TO_DELIVERY', 'CANCELLED')
  );
$$;

comment on function public.rescue_case_transition_allowed(text, text) is
  'The only legal manual rescue_cases.status transitions. CONVERTED is additionally gated in update_rescue_case_status() on the order actually being DELIVERED — rescue status can never claim a delivery orders/Finance have not recorded. The automatic order-driven sync (sync_rescue_case_with_order trigger) bypasses this graph deliberately: it is a system correction, not a manual workflow step.';


-- ---------------------------------------------------------------
-- PART F — create_support_interaction()
-- ---------------------------------------------------------------
create or replace function public.create_support_interaction(
  p_interaction_type text,
  p_summary text,
  p_order_id uuid default null,
  p_customer_id uuid default null,
  p_outcome text default null,
  p_related_task_id uuid default null
)
returns public.support_interactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_workspace_id uuid;
  v_brand_id uuid;
  v_customer_id uuid;
  v_task public.order_tasks%rowtype;
  v_interaction public.support_interactions%rowtype;
begin
  if p_order_id is null and p_customer_id is null then
    raise exception 'order_id or customer_id is required';
  end if;

  if p_order_id is not null then
    select * into v_order from public.orders where id = p_order_id and deleted_at is null;
    if not found then
      raise exception 'Order not found';
    end if;
    v_workspace_id := v_order.workspace_id;
    v_brand_id := v_order.brand_id;
    v_customer_id := coalesce(p_customer_id, v_order.customer_id);
    if p_customer_id is not null and v_order.customer_id is not null and v_order.customer_id <> p_customer_id then
      raise exception 'customer_id does not match this order''s customer';
    end if;
  else
    select * into v_customer from public.customers where id = p_customer_id and deleted_at is null;
    if not found then
      raise exception 'Customer not found';
    end if;
    v_workspace_id := v_customer.workspace_id;
    v_brand_id := v_customer.brand_id;
    v_customer_id := p_customer_id;
  end if;

  if not (public.user_has_permission(v_workspace_id, 'support.create') or public.user_has_permission(v_workspace_id, 'support.manage')) then
    raise exception 'insufficient_permission: support.create required';
  end if;

  if p_interaction_type not in (
    'CALL', 'CONFIRMATION_CALL', 'FOLLOW_UP_CALL', 'DELIVERY_FOLLOW_UP',
    'ADDRESS_VERIFICATION', 'PHONE_VERIFICATION', 'CUSTOMER_REQUEST',
    'CANCELLATION_REQUEST', 'RESCUE_ATTEMPT', 'ESCALATION', 'INTERNAL_NOTE', 'OTHER'
  ) then
    raise exception 'Unknown interaction_type %', p_interaction_type;
  end if;

  if p_outcome is not null and p_outcome not in (
    'CUSTOMER_REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'CONFIRMED',
    'RESCHEDULED', 'CANCELLED', 'ADDRESS_UPDATED', 'PHONE_UPDATED', 'ESCALATED',
    'NOT_INTERESTED', 'UNABLE_TO_DELIVER', 'OTHER'
  ) then
    raise exception 'Unknown outcome %', p_outcome;
  end if;

  if coalesce(trim(p_summary), '') = '' then
    raise exception 'summary is required';
  end if;

  if p_related_task_id is not null then
    select * into v_task from public.order_tasks where id = p_related_task_id;
    if not found or v_task.workspace_id <> v_workspace_id then
      raise exception 'related task not found in this workspace';
    end if;
    if p_order_id is not null and v_task.order_id <> p_order_id then
      raise exception 'related task does not belong to this order';
    end if;
  end if;

  insert into public.support_interactions (
    workspace_id, brand_id, order_id, customer_id, interaction_type, outcome, summary, related_task_id, created_by
  ) values (
    v_workspace_id, v_brand_id, p_order_id, v_customer_id, p_interaction_type, p_outcome, trim(p_summary), p_related_task_id, auth.uid()
  )
  returning * into v_interaction;

  if p_order_id is not null then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
    values (
      p_order_id, v_workspace_id, v_brand_id, 'SUPPORT_INTERACTION_LOGGED',
      p_interaction_type || ': ' || trim(p_summary),
      jsonb_build_object('interaction_id', v_interaction.id, 'interaction_type', p_interaction_type, 'outcome', p_outcome),
      auth.uid()
    );
  end if;

  return v_interaction;
end;
$$;

comment on function public.create_support_interaction(text, text, uuid, uuid, text, uuid) is
  'The single write path for the typed contact-history log. Requires order_id and/or customer_id; resolves workspace/brand/customer server-side, never trusts client-supplied scoping. Appends to the order timeline (order_events) when order-scoped — the SAME timeline Order Detail already renders, not a second one.';


-- ---------------------------------------------------------------
-- PART G — create_rescue_case()
-- ---------------------------------------------------------------
create or replace function public.create_rescue_case(
  p_order_id uuid,
  p_reason text,
  p_priority text default 'normal',
  p_assigned_to uuid default null
)
returns public.rescue_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_case public.rescue_cases%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'Order not found';
  end if;

  if not (public.user_has_permission(v_order.workspace_id, 'rescue.create') or public.user_has_permission(v_order.workspace_id, 'rescue.manage')) then
    raise exception 'insufficient_permission: rescue.create required';
  end if;

  if v_order.status in ('DELIVERED', 'CANCELLED') then
    raise exception 'Cannot open a rescue case for a % order', v_order.status;
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason is required';
  end if;

  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Unknown priority %', p_priority;
  end if;

  if exists (
    select 1 from public.rescue_cases
    where order_id = p_order_id and status not in ('CONVERTED', 'LOST', 'CANCELLED')
  ) then
    raise exception 'active_rescue_case_exists: an active rescue case already exists for this order';
  end if;

  begin
    insert into public.rescue_cases (
      workspace_id, brand_id, order_id, customer_id, reason, priority, assigned_to, created_by, updated_by
    ) values (
      v_order.workspace_id, v_order.brand_id, p_order_id, v_order.customer_id, trim(p_reason),
      coalesce(p_priority, 'normal'), p_assigned_to, auth.uid(), auth.uid()
    )
    returning * into v_case;
  exception when unique_violation then
    raise exception 'active_rescue_case_exists: an active rescue case already exists for this order';
  end;

  insert into public.rescue_attempts (rescue_case_id, workspace_id, brand_id, from_status, to_status, action_note, created_by)
  values (v_case.id, v_case.workspace_id, v_case.brand_id, null, 'OPEN', 'Rescue case opened: ' || trim(p_reason), auth.uid());

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    p_order_id, v_order.workspace_id, v_order.brand_id, 'RESCUE_CASE_OPENED',
    'Rescue case opened: ' || trim(p_reason), jsonb_build_object('rescue_case_id', v_case.id), auth.uid()
  );

  if p_assigned_to is not null and p_assigned_to <> auth.uid() then
    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
    values (
      v_order.workspace_id, v_order.brand_id, p_assigned_to, 'rescue_created', 'New rescue case assigned',
      trim(p_reason) || ' — order ' || v_order.order_number,
      case when v_case.priority in ('high', 'urgent') then v_case.priority else 'normal' end,
      '/operations/rescue-board', jsonb_build_object('rescue_case_id', v_case.id, 'order_id', p_order_id)
    );
  end if;

  perform public.emit_automation_event(
    v_order.workspace_id, v_order.brand_id, 'rescue.created', 'rescue_case', v_case.id,
    jsonb_build_object('rescue_case', jsonb_build_object('id', v_case.id, 'order_id', p_order_id, 'order_number', v_order.order_number, 'reason', trim(p_reason), 'priority', v_case.priority)),
    'rescue.created:' || v_case.id
  );

  return v_case;
end;
$$;

comment on function public.create_rescue_case(uuid, text, text, uuid) is
  'Opens a rescue case against an EXISTING order — never creates a duplicate order. Idempotency is enforced twice: an explicit pre-check for a friendly error, and the partial unique index (rescue_cases_active_order_idx) as the real guarantee under a genuine concurrent race.';


-- ---------------------------------------------------------------
-- PART H — update_rescue_case_status()
-- ---------------------------------------------------------------
create or replace function public.update_rescue_case_status(
  p_rescue_case_id uuid,
  p_status text,
  p_note text default null,
  p_outcome text default null
)
returns public.rescue_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.rescue_cases%rowtype;
  v_order public.orders%rowtype;
  v_old_status text;
begin
  select * into v_case from public.rescue_cases where id = p_rescue_case_id for update;
  if not found then
    raise exception 'Rescue case not found';
  end if;

  if not (public.user_has_permission(v_case.workspace_id, 'rescue.update') or public.user_has_permission(v_case.workspace_id, 'rescue.manage')) then
    raise exception 'insufficient_permission: rescue.update required';
  end if;

  if v_case.status in ('CONVERTED', 'LOST', 'CANCELLED') then
    raise exception 'Rescue case is already %', v_case.status;
  end if;

  if p_status not in (
    'OPEN', 'CONTACTING', 'CUSTOMER_REACHED', 'RESCHEDULED', 'ADDRESS_FIXED',
    'PHONE_FIXED', 'HANDED_BACK_TO_DELIVERY', 'CONVERTED', 'LOST', 'CANCELLED'
  ) then
    raise exception 'Unknown rescue case status %', p_status;
  end if;

  if p_outcome is not null and p_outcome not in (
    'CUSTOMER_REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'CONFIRMED',
    'RESCHEDULED', 'CANCELLED', 'ADDRESS_UPDATED', 'PHONE_UPDATED', 'ESCALATED',
    'NOT_INTERESTED', 'UNABLE_TO_DELIVER', 'OTHER'
  ) then
    raise exception 'Unknown outcome %', p_outcome;
  end if;

  if not public.rescue_case_transition_allowed(v_case.status, p_status) then
    raise exception 'Invalid rescue case transition: % -> %', v_case.status, p_status;
  end if;

  if p_status = 'CONVERTED' then
    select * into v_order from public.orders where id = v_case.order_id;
    if v_order.status <> 'DELIVERED' then
      raise exception 'A rescue case can only be marked CONVERTED once the order is actually DELIVERED';
    end if;
  end if;

  v_old_status := v_case.status;

  update public.rescue_cases
    set status = p_status,
        closed_at = case when p_status in ('CONVERTED', 'LOST', 'CANCELLED') then now() else closed_at end,
        closed_reason = case when p_status in ('LOST', 'CANCELLED') then p_note else closed_reason end,
        updated_by = auth.uid()
    where id = p_rescue_case_id
    returning * into v_case;

  insert into public.rescue_attempts (rescue_case_id, workspace_id, brand_id, from_status, to_status, action_note, outcome, created_by)
  values (v_case.id, v_case.workspace_id, v_case.brand_id, v_old_status, p_status, p_note, p_outcome, auth.uid());

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    v_case.order_id, v_case.workspace_id, v_case.brand_id, 'RESCUE_' || p_status,
    'Rescue case ' || lower(replace(p_status, '_', ' ')) || coalesce(': ' || p_note, ''),
    jsonb_build_object('rescue_case_id', v_case.id, 'from_status', v_old_status, 'to_status', p_status), auth.uid()
  );

  if p_status = 'CONVERTED' then
    perform public.emit_automation_event(
      v_case.workspace_id, v_case.brand_id, 'rescue.converted', 'rescue_case', v_case.id,
      jsonb_build_object('rescue_case_id', v_case.id, 'order_id', v_case.order_id), 'rescue.converted:' || v_case.id
    );
  end if;

  return v_case;
end;
$$;

comment on function public.update_rescue_case_status(uuid, text, text, text) is
  'Progresses a rescue case through the explicit state graph in rescue_case_transition_allowed(). CONVERTED additionally requires the underlying order to actually be DELIVERED — rescue status can never assert a delivery/revenue fact orders has not itself recorded. Every transition is appended to rescue_attempts (before/after/actor/timestamp/reason), never overwritten.';


-- ---------------------------------------------------------------
-- PART I — escalate_rescue_case()
-- ---------------------------------------------------------------
create or replace function public.escalate_rescue_case(
  p_rescue_case_id uuid,
  p_reason text,
  p_reassign_to uuid default null
)
returns public.rescue_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.rescue_cases%rowtype;
begin
  select * into v_case from public.rescue_cases where id = p_rescue_case_id for update;
  if not found then
    raise exception 'Rescue case not found';
  end if;

  if not (public.user_has_permission(v_case.workspace_id, 'rescue.escalate') or public.user_has_permission(v_case.workspace_id, 'rescue.manage')) then
    raise exception 'insufficient_permission: rescue.escalate required';
  end if;

  if v_case.status in ('CONVERTED', 'LOST', 'CANCELLED') then
    raise exception 'Cannot escalate a % rescue case', v_case.status;
  end if;

  if v_case.escalated then
    raise exception 'already_escalated: this rescue case is already escalated';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'escalation reason is required';
  end if;

  update public.rescue_cases
    set escalated = true, escalated_at = now(), escalated_by = auth.uid(), escalation_reason = trim(p_reason),
        assigned_to = coalesce(p_reassign_to, assigned_to), updated_by = auth.uid()
    where id = p_rescue_case_id
    returning * into v_case;

  insert into public.rescue_attempts (rescue_case_id, workspace_id, brand_id, from_status, to_status, action_note, outcome, created_by)
  values (v_case.id, v_case.workspace_id, v_case.brand_id, v_case.status, v_case.status, 'Escalated: ' || trim(p_reason), 'ESCALATED', auth.uid());

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    v_case.order_id, v_case.workspace_id, v_case.brand_id, 'RESCUE_ESCALATED',
    'Rescue case escalated: ' || trim(p_reason), jsonb_build_object('rescue_case_id', v_case.id), auth.uid()
  );

  insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
  values (
    v_case.workspace_id, v_case.brand_id, coalesce(p_reassign_to, v_case.assigned_to), 'rescue_escalated', 'Rescue case escalated',
    trim(p_reason), 'urgent', '/operations/rescue-board', jsonb_build_object('rescue_case_id', v_case.id, 'order_id', v_case.order_id)
  );

  perform public.emit_automation_event(
    v_case.workspace_id, v_case.brand_id, 'rescue.escalated', 'rescue_case', v_case.id,
    jsonb_build_object('rescue_case_id', v_case.id, 'order_id', v_case.order_id, 'reason', trim(p_reason)),
    'rescue.escalated:' || v_case.id
  );

  return v_case;
end;
$$;

comment on function public.escalate_rescue_case(uuid, text, uuid) is
  'Escalation is server-enforced idempotent: a case can be escalated at most once (the escalated boolean guards it), never relying on the frontend. reassign, if given, is a real staff reassignment, never a fabricated auto-pick.';


-- ---------------------------------------------------------------
-- PART J — sync_rescue_case_with_order(): the order lifecycle stays
-- the ONE authoritative source of truth. When an order the staff are
-- actively rescuing resolves itself through the normal order/delivery
-- flow, the rescue case is auto-closed to match — never left stale,
-- and never asserting CONVERTED/LOST ahead of the order itself.
-- ---------------------------------------------------------------
create or replace function public.sync_rescue_case_with_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.rescue_cases%rowtype;
  v_new_status text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_case from public.rescue_cases
    where order_id = new.id and status not in ('CONVERTED', 'LOST', 'CANCELLED')
    for update;
  if not found then
    return new;
  end if;

  if new.status = 'DELIVERED' then
    v_new_status := 'CONVERTED';
  elsif new.status = 'CANCELLED' then
    v_new_status := 'CANCELLED';
  else
    return new;
  end if;

  update public.rescue_cases
    set status = v_new_status, closed_at = now(),
        closed_reason = 'Auto-closed: order status changed to ' || new.status,
        updated_by = auth.uid()
    where id = v_case.id;

  insert into public.rescue_attempts (rescue_case_id, workspace_id, brand_id, from_status, to_status, action_note, created_by)
  values (v_case.id, v_case.workspace_id, v_case.brand_id, v_case.status, v_new_status, 'Automatically closed — order status changed to ' || new.status, auth.uid());

  if v_new_status = 'CONVERTED' then
    perform public.emit_automation_event(
      v_case.workspace_id, v_case.brand_id, 'rescue.converted', 'rescue_case', v_case.id,
      jsonb_build_object('rescue_case_id', v_case.id, 'order_id', new.id, 'order_number', new.order_number, 'auto', true),
      'rescue.converted:' || v_case.id
    );
  end if;

  return new;
end;
$$;

comment on function public.sync_rescue_case_with_order() is
  'A RETURNED order deliberately does NOT auto-close its rescue case (a return often still needs a follow-up rescue attempt — redelivery negotiation or refund handling), unlike DELIVERED (auto-CONVERTED) and CANCELLED (auto-CANCELLED).';

create trigger sync_rescue_case_with_order_trg
  after update on public.orders
  for each row execute function public.sync_rescue_case_with_order();


-- ---------------------------------------------------------------
-- PART K — get_support_queue(): the explainable priority engine.
-- Every reason in priority_reasons is a real, already-existing fact
-- (task/rescue-case/order field) — no synthesized "AI" score, same
-- discipline as get_rescue_board().
-- ---------------------------------------------------------------
create or replace function public.get_support_queue(p_workspace_id uuid, p_brand_id uuid default null, p_limit integer default 200)
returns table (
  order_id uuid,
  order_number text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  order_status text,
  priority text,
  priority_reasons text[],
  rescue_case_id uuid,
  rescue_status text,
  rescue_escalated boolean,
  open_task_id uuid,
  open_task_type text,
  open_task_due_at timestamptz,
  last_interaction_at timestamptz,
  last_interaction_summary text,
  assigned_to uuid,
  next_action text
)
language sql
stable
as $$
  with base as (
    select o.*
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_permission(p_workspace_id, 'support.view')
      and (
        exists (select 1 from public.order_tasks t where t.order_id = o.id and t.status in ('OPEN', 'IN_PROGRESS'))
        or exists (select 1 from public.rescue_cases rc where rc.order_id = o.id and rc.status not in ('CONVERTED', 'LOST', 'CANCELLED'))
        or (o.status in ('NEW', 'PENDING') and o.created_at < now() - interval '24 hours')
        or o.status = 'WILL_CALL_BACK'
        or (o.status = 'SCHEDULED' and o.scheduled_at is not null and o.scheduled_at < now() + interval '2 hours')
        or (o.delivery_attempts_count >= 2 and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED'))
        or (o.failed_delivery_reason is not null and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED'))
        or o.status = 'RETURNED'
      )
  ),
  task as (
    select distinct on (t.order_id) t.order_id, t.id, t.task_type, t.due_at, t.priority, t.assigned_to
    from public.order_tasks t
    where t.order_id in (select id from base) and t.status in ('OPEN', 'IN_PROGRESS')
    order by t.order_id, (t.priority = 'urgent') desc, (t.due_at is null), t.due_at asc, t.created_at asc
  ),
  rescue as (
    select distinct on (rc.order_id) rc.order_id, rc.id, rc.status, rc.escalated, rc.assigned_to, rc.priority
    from public.rescue_cases rc
    where rc.order_id in (select id from base) and rc.status not in ('CONVERTED', 'LOST', 'CANCELLED')
    order by rc.order_id, rc.escalated desc, rc.created_at desc
  ),
  last_contact as (
    select distinct on (si.order_id) si.order_id, si.created_at, si.summary
    from public.support_interactions si
    where si.order_id in (select id from base)
    order by si.order_id, si.created_at desc
  )
  select
    b.id, b.order_number, b.customer_id, b.customer_name, b.customer_phone, b.status,
    case
      when r.escalated then 'urgent'
      when r.priority = 'urgent' or t.priority = 'urgent' then 'urgent'
      when b.status = 'WILL_CALL_BACK' or b.delivery_attempts_count >= 2 then 'urgent'
      when r.id is not null or t.priority = 'high' then 'high'
      when b.status in ('NEW', 'PENDING') and b.created_at < now() - interval '24 hours' then 'high'
      when b.status = 'RETURNED' then 'high'
      else 'normal'
    end,
    array_remove(array[
      case when r.escalated then 'Rescue case escalated' else null end,
      case when r.id is not null then 'Active rescue case: ' || r.status else null end,
      case when t.id is not null and t.due_at is not null and t.due_at < now() then 'Follow-up task overdue' else null end,
      case when t.id is not null then 'Open task: ' || t.task_type else null end,
      case when b.delivery_attempts_count >= 2 then b.delivery_attempts_count || ' failed delivery attempts' else null end,
      case when b.status = 'WILL_CALL_BACK' then 'Customer requested callback' else null end,
      case when b.status in ('NEW', 'PENDING') and b.created_at < now() - interval '24 hours' then 'Unconfirmed for over 24 hours' else null end,
      case when b.status = 'RETURNED' then 'Returned order needs follow-up' else null end,
      case when b.failed_delivery_reason is not null then 'Delivery exception: ' || b.failed_delivery_reason else null end
    ], null),
    r.id, r.status, coalesce(r.escalated, false),
    t.id, t.task_type, t.due_at,
    lc.created_at, lc.summary,
    coalesce(t.assigned_to, r.assigned_to, b.assigned_to),
    case
      when r.id is not null then 'Continue rescue: ' || r.status
      when t.id is not null then 'Complete task: ' || t.task_type
      else 'Review order'
    end
  from base b
  left join task t on t.order_id = b.id
  left join rescue r on r.order_id = b.id
  left join last_contact lc on lc.order_id = b.id
  order by
    case
      when r.escalated or r.priority = 'urgent' or t.priority = 'urgent' or b.status = 'WILL_CALL_BACK' or b.delivery_attempts_count >= 2 then 1
      when r.id is not null or t.priority = 'high' or (b.status in ('NEW', 'PENDING') and b.created_at < now() - interval '24 hours') or b.status = 'RETURNED' then 2
      else 3
    end,
    b.created_at asc
  limit p_limit;
$$;

comment on function public.get_support_queue(uuid, uuid, integer) is
  'The Support workspace queue. priority_reasons is the explainable-priority engine requirement: every entry is a real field, never a bare score.';


-- ---------------------------------------------------------------
-- PART L — get_support_summary(): the KPI strip, all real counts.
-- ---------------------------------------------------------------
create or replace function public.get_support_summary(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  needs_attention_count bigint,
  due_today_count bigint,
  overdue_count bigint,
  awaiting_customer_count bigint,
  rescue_opportunities_count bigint,
  escalated_count bigint,
  completed_today_count bigint
)
language sql
stable
as $$
  select
    (select count(distinct order_id) from (
      select t.order_id from public.order_tasks t
        where t.workspace_id = p_workspace_id and (p_brand_id is null or t.brand_id = p_brand_id)
        and t.status in ('OPEN', 'IN_PROGRESS') and t.priority in ('high', 'urgent')
      union
      select rc.order_id from public.rescue_cases rc
        where rc.workspace_id = p_workspace_id and (p_brand_id is null or rc.brand_id = p_brand_id)
        and rc.status not in ('CONVERTED', 'LOST', 'CANCELLED')
    ) x),
    (select count(*) from public.order_tasks
      where workspace_id = p_workspace_id and (p_brand_id is null or brand_id = p_brand_id)
      and status in ('OPEN', 'IN_PROGRESS') and due_at is not null
      and due_at >= date_trunc('day', now()) and due_at < date_trunc('day', now()) + interval '1 day'),
    (select count(*) from public.order_tasks
      where workspace_id = p_workspace_id and (p_brand_id is null or brand_id = p_brand_id)
      and status in ('OPEN', 'IN_PROGRESS') and due_at is not null and due_at < now()),
    (select count(*) from public.rescue_cases
      where workspace_id = p_workspace_id and (p_brand_id is null or brand_id = p_brand_id)
      and status = 'CONTACTING'),
    (select count(*) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id) and o.deleted_at is null
      and not exists (select 1 from public.rescue_cases rc where rc.order_id = o.id and rc.status not in ('CONVERTED', 'LOST', 'CANCELLED'))
      and (
        (o.status in ('NEW', 'PENDING') and o.created_at < now() - interval '24 hours')
        or o.status = 'WILL_CALL_BACK'
        or (o.delivery_attempts_count >= 2 and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED'))
        or o.status = 'RETURNED'
      )),
    (select count(*) from public.rescue_cases
      where workspace_id = p_workspace_id and (p_brand_id is null or brand_id = p_brand_id)
      and escalated and status not in ('CONVERTED', 'LOST', 'CANCELLED')),
    (select count(*) from public.order_tasks
      where workspace_id = p_workspace_id and (p_brand_id is null or brand_id = p_brand_id)
      and status = 'COMPLETED' and completed_at >= date_trunc('day', now()))
    +
    (select count(*) from public.rescue_cases
      where workspace_id = p_workspace_id and (p_brand_id is null or brand_id = p_brand_id)
      and status = 'CONVERTED' and closed_at >= date_trunc('day', now()))
  where public.user_has_permission(p_workspace_id, 'support.view');
$$;

comment on function public.get_support_summary(uuid, uuid) is
  'Support workspace KPI strip. Zeroed entirely (no rows) without support.view, the same gating discipline as get_operations_summary. completed_today_count sums task completions and successful (CONVERTED) rescues today — both real, terminal outcomes.';


-- ---------------------------------------------------------------
-- PART M — get_rescue_funnel(): stage counts, no double counting —
-- each rescue case is counted once per stage it has EVER reached
-- (from rescue_attempts.to_status, the authoritative append-only
-- record), so the funnel is monotonically non-increasing.
-- ---------------------------------------------------------------
create or replace function public.get_rescue_funnel(p_workspace_id uuid, p_brand_id uuid default null, p_days integer default 30)
returns table (
  opportunities bigint,
  contacted bigint,
  customer_reached bigint,
  rescheduled_or_fixed bigint,
  returned_to_delivery bigint,
  delivered bigint,
  lost bigint
)
language sql
stable
as $$
  with cases as (
    select rc.id, rc.status
    from public.rescue_cases rc
    where rc.workspace_id = p_workspace_id and (p_brand_id is null or rc.brand_id = p_brand_id)
      and rc.opened_at >= now() - (p_days || ' days')::interval
      and public.user_has_permission(p_workspace_id, 'support.view')
  )
  select
    count(*),
    count(*) filter (where exists (select 1 from public.rescue_attempts ra where ra.rescue_case_id = c.id and ra.to_status = 'CONTACTING')),
    count(*) filter (where exists (select 1 from public.rescue_attempts ra where ra.rescue_case_id = c.id and ra.to_status = 'CUSTOMER_REACHED')),
    count(*) filter (where exists (select 1 from public.rescue_attempts ra where ra.rescue_case_id = c.id and ra.to_status in ('RESCHEDULED', 'ADDRESS_FIXED', 'PHONE_FIXED'))),
    count(*) filter (where exists (select 1 from public.rescue_attempts ra where ra.rescue_case_id = c.id and ra.to_status = 'HANDED_BACK_TO_DELIVERY')),
    count(*) filter (where c.status = 'CONVERTED'),
    count(*) filter (where c.status = 'LOST')
  from cases c;
$$;

comment on function public.get_rescue_funnel(uuid, uuid, integer) is
  'Opportunities -> Contacted -> Customer Reached -> Rescheduled/Fixed -> Returned to Delivery -> Delivered -> Lost. Every stage read from rescue_attempts (append-only, authoritative); a case that skipped a stage or moved back and forth is still counted once per stage it reached, never double-counted.';


-- ---------------------------------------------------------------
-- PART N — get_support_analytics(): numerator/denominator always
-- exposed, never a bare percentage (the frontend computes any ratio
-- for display; this RPC never pre-divides).
-- ---------------------------------------------------------------
create or replace function public.get_support_analytics(p_workspace_id uuid, p_brand_id uuid default null, p_days integer default 30)
returns table (
  period_days integer,
  support_interactions_total bigint,
  orders_in_scope bigint,
  orders_contacted bigint,
  confirmation_calls_total bigint,
  confirmation_calls_confirmed bigint,
  rescue_opportunities_opened bigint,
  rescue_successful bigint,
  rescue_lost bigint,
  rescue_avg_resolution_hours numeric,
  overdue_tasks_current bigint,
  open_tasks_current bigint
)
language sql
stable
as $$
  select
    p_days,
    (select count(*) from public.support_interactions si
      where si.workspace_id = p_workspace_id and (p_brand_id is null or si.brand_id = p_brand_id)
      and si.created_at >= now() - (p_days || ' days')::interval),
    (select count(*) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id) and o.deleted_at is null
      and o.created_at >= now() - (p_days || ' days')::interval),
    (select count(distinct si.order_id) from public.support_interactions si
      where si.workspace_id = p_workspace_id and (p_brand_id is null or si.brand_id = p_brand_id)
      and si.created_at >= now() - (p_days || ' days')::interval and si.order_id is not null),
    (select count(*) from public.support_interactions si
      where si.workspace_id = p_workspace_id and (p_brand_id is null or si.brand_id = p_brand_id)
      and si.interaction_type = 'CONFIRMATION_CALL' and si.created_at >= now() - (p_days || ' days')::interval),
    (select count(*) from public.support_interactions si
      where si.workspace_id = p_workspace_id and (p_brand_id is null or si.brand_id = p_brand_id)
      and si.interaction_type = 'CONFIRMATION_CALL' and si.outcome = 'CONFIRMED' and si.created_at >= now() - (p_days || ' days')::interval),
    (select count(*) from public.rescue_cases rc
      where rc.workspace_id = p_workspace_id and (p_brand_id is null or rc.brand_id = p_brand_id)
      and rc.opened_at >= now() - (p_days || ' days')::interval),
    (select count(*) from public.rescue_cases rc
      where rc.workspace_id = p_workspace_id and (p_brand_id is null or rc.brand_id = p_brand_id)
      and rc.status = 'CONVERTED' and rc.closed_at >= now() - (p_days || ' days')::interval),
    (select count(*) from public.rescue_cases rc
      where rc.workspace_id = p_workspace_id and (p_brand_id is null or rc.brand_id = p_brand_id)
      and rc.status = 'LOST' and rc.closed_at >= now() - (p_days || ' days')::interval),
    (select avg(extract(epoch from (rc.closed_at - rc.opened_at)) / 3600.0) from public.rescue_cases rc
      where rc.workspace_id = p_workspace_id and (p_brand_id is null or rc.brand_id = p_brand_id)
      and rc.status in ('CONVERTED', 'LOST') and rc.closed_at >= now() - (p_days || ' days')::interval),
    (select count(*) from public.order_tasks t
      where t.workspace_id = p_workspace_id and (p_brand_id is null or t.brand_id = p_brand_id)
      and t.status in ('OPEN', 'IN_PROGRESS') and t.due_at is not null and t.due_at < now()),
    (select count(*) from public.order_tasks t
      where t.workspace_id = p_workspace_id and (p_brand_id is null or t.brand_id = p_brand_id)
      and t.status in ('OPEN', 'IN_PROGRESS'))
  where public.user_has_permission(p_workspace_id, 'support.view');
$$;

comment on function public.get_support_analytics(uuid, uuid, integer) is
  'Every rate the frontend needs (contact rate, confirmation recovery, rescue rate, overdue rate) is orders_contacted/orders_in_scope, confirmation_calls_confirmed/confirmation_calls_total, rescue_successful/rescue_opportunities_opened, overdue_tasks_current/open_tasks_current respectively — this RPC returns both sides of every ratio, never a pre-divided percentage.';


-- ---------------------------------------------------------------
-- PART O — check_overdue_support_tasks(): emits support_task_overdue
-- automation events, idempotently, for staff-triggered or scheduled
-- (pg_cron / Supabase scheduled Edge Function) invocation. Skips the
-- permission check only when called from a system context (no
-- auth.uid(), e.g. a cron job running as a service role) — a real
-- user still needs tasks.view/support.view exactly like every other
-- support/task read.
-- ---------------------------------------------------------------
create or replace function public.check_overdue_support_tasks(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_key text;
  v_count integer := 0;
begin
  if auth.uid() is not null and not (public.user_has_permission(p_workspace_id, 'tasks.view') or public.user_has_permission(p_workspace_id, 'support.view')) then
    raise exception 'insufficient_permission: tasks.view or support.view required';
  end if;

  for v_task in
    select t.id, t.workspace_id, t.brand_id, t.order_id, t.task_type, t.due_at
    from public.order_tasks t
    where t.workspace_id = p_workspace_id
      and t.status in ('OPEN', 'IN_PROGRESS')
      and t.due_at is not null
      and t.due_at < now()
  loop
    v_key := 'support_task_overdue:' || v_task.id || ':' || v_task.due_at::text;
    -- emit_automation_event() itself is ON CONFLICT DO NOTHING against
    -- (workspace_id, idempotency_key), so a duplicate call never raises
    -- and never double-fires the automation — this pre-check exists
    -- only so the returned count reflects genuinely NEW emissions.
    if not exists (
      select 1 from public.automation_events
      where workspace_id = v_task.workspace_id and idempotency_key = v_key
    ) then
      perform public.emit_automation_event(
        v_task.workspace_id, v_task.brand_id, 'support_task_overdue', 'task', v_task.id,
        jsonb_build_object('task_id', v_task.id, 'order_id', v_task.order_id, 'task_type', v_task.task_type, 'due_at', v_task.due_at),
        v_key
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.check_overdue_support_tasks(uuid) is
  'Idempotency key includes due_at, so rescheduling a task (a new due_at) allows exactly one fresh overdue event, never a duplicate for the same deadline. Production requires this to be invoked periodically (pg_cron or a scheduled Supabase Edge Function) — see the migration notes in the Phase 10 report; it is not self-scheduling.';
