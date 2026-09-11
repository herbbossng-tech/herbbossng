-- ============================================================
-- GOLDEN COMMERCE OS — COD Operations, Fulfillment & Delivery
-- Control (0025)
--
-- Inspected first, before writing anything: the order lifecycle
-- state machine (order_status_transitions + guard_order_status_
-- transition(), 0013/0016) already exists and already rejects
-- illegal transitions server-side; the operational timeline
-- (order_events) and order notes (order_notes) already exist
-- (0014); confirmed_at/scheduled_at/callback_at/dispatched_at/
-- delivered_at/returned_at/cancelled_at and cash_collection_status/
-- cash_collected_amount/cash_collected_at already exist on orders
-- (0013). None of that is duplicated here — this migration adds
-- only what genuinely doesn't exist yet: Follow-up Tasks, Waybills,
-- Delivery Partners, Delivery Attempts, COD Settlement, a handful of
-- new order columns for state that has nowhere else to live, and the
-- Part A security fix to get_order_stats().
--
-- No new status/lifecycle system is introduced. Waybill status is
-- its own small state machine (a waybill is a physical package, not
-- a second copy of the order's lifecycle) but is coupled to the
-- order's own guarded status transitions at the two points where
-- that coupling is unambiguous (dispatch, delivery) — see
-- update_waybill_status()/record_delivery_attempt() below.
-- ============================================================


-- ---------------------------------------------------------------
-- PART A — SECURITY PRE-FLIGHT: get_order_stats() finance-visibility
-- hardening.
--
-- Inspected: get_order_stats() is `language sql stable` (SECURITY
-- INVOKER — no `security definer`), so it only ever inherited
-- orders.view via orders' own RLS policy. It was never brought under
-- user_has_finance_visibility() the way the seven Finance/Analytics
-- RPCs were in 0023 — meaning Customer Support and Warehouse Staff
-- (who both hold orders.view for their normal work) could call it
-- directly and get real total_sales_value/delivered_revenue/
-- pending_revenue/returned_value/cancelled_value, bypassing the
-- exact boundary 0023 established everywhere else. This was flagged
-- but explicitly left unfixed in the Dashboard refinement (out of
-- that task's stated scope); Phase 6 requires fixing it.
--
-- Verified the current frontend consumer: src/features/orders/
-- components/OrderStats.tsx (the Orders page KPI strip) only reads
-- count fields (total_orders, new_count, pending_count,
-- will_call_back_count, processing_count, scheduled_count,
-- in_transit_count, delivered_count, returned_count,
-- cancelled_count) — it never reads a single money field. So this
-- fix changes zero visible UI behavior for any existing caller; it
-- only closes direct-RPC-call exposure. Every count field and
-- delivery_success_rate (a ratio of counts, not a dollar figure —
-- genuinely operational) stay exactly as they were, for every
-- orders.view holder. Only the seven monetary fields are zeroed for
-- a caller lacking finance visibility. Same signature, same
-- workspace/brand isolation, same return shape — CREATE OR REPLACE
-- is sufficient, no DROP needed.
-- ---------------------------------------------------------------
create or replace function public.get_order_stats(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  total_orders bigint,
  today_orders bigint,
  new_count bigint,
  pending_count bigint,
  will_call_back_count bigint,
  scheduled_count bigint,
  processing_count bigint,
  dispatched_count bigint,
  in_transit_count bigint,
  partially_delivered_count bigint,
  delivered_count bigint,
  returned_count bigint,
  cancelled_count bigint,
  total_sales_value numeric,
  today_sales_value numeric,
  delivered_revenue numeric,
  today_delivered_revenue numeric,
  pending_revenue numeric,
  returned_value numeric,
  cancelled_value numeric,
  delivery_success_rate numeric
)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (where created_at >= date_trunc('day', now())),
    count(*) filter (where status = 'NEW'),
    count(*) filter (where status = 'PENDING'),
    count(*) filter (where status = 'WILL_CALL_BACK'),
    count(*) filter (where status = 'SCHEDULED'),
    count(*) filter (where status = 'PROCESSING_FOR_DISPATCH'),
    count(*) filter (where status = 'DISPATCHED'),
    count(*) filter (where status = 'IN_TRANSIT'),
    count(*) filter (where status = 'PARTIALLY_DELIVERED'),
    count(*) filter (where status = 'DELIVERED'),
    count(*) filter (where status = 'RETURNED'),
    count(*) filter (where status = 'CANCELLED'),
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status <> 'CANCELLED' and created_at >= date_trunc('day', now())), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status = 'DELIVERED' and cash_collection_status = 'collected'), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status = 'DELIVERED' and cash_collection_status = 'collected' and delivered_at >= date_trunc('day', now())), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status = 'RETURNED'), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status = 'CANCELLED'), 0) else 0 end,
    case
      when count(*) filter (where status in ('DELIVERED', 'RETURNED', 'CANCELLED')) > 0
        then round(100.0 * count(*) filter (where status = 'DELIVERED') / count(*) filter (where status in ('DELIVERED', 'RETURNED', 'CANCELLED')), 1)
      else 0
    end
  from public.orders
  where workspace_id = p_workspace_id
    and (p_brand_id is null or brand_id = p_brand_id)
    and deleted_at is null;
$$;

comment on function public.get_order_stats(uuid, uuid) is
  'Authoritative order KPI aggregation for the Orders page. Every count field and delivery_success_rate are genuinely operational and visible to any orders.view holder. The seven monetary fields (total_sales_value, today_sales_value, delivered_revenue, today_delivered_revenue, pending_revenue, returned_value, cancelled_value) are zeroed unless the caller holds finance.view/analytics.view/reports.view via user_has_finance_visibility() — the same boundary the Finance/Analytics RPCs enforce (0023). Fixed in 0025 after this exact gap was found (but left, out of scope) during the Dashboard COD refinement.';


-- ---------------------------------------------------------------
-- PART B — new orders columns. Every one of these is state that
-- genuinely has nowhere else to live; nothing here duplicates an
-- existing column. confirmed_at/scheduled_at/callback_at/
-- dispatched_at/delivered_at/returned_at/cancelled_at and
-- cash_collection_status/cash_collected_amount/cash_collected_at
-- already exist (0013) and are reused as-is throughout this
-- migration — not touched here.
-- ---------------------------------------------------------------
alter table public.orders add column if not exists packed_at timestamptz;
alter table public.orders add column if not exists packed_by uuid references auth.users (id);
alter table public.orders add column if not exists delivery_attempts_count integer not null default 0;
alter table public.orders add column if not exists failed_delivery_reason text;
alter table public.orders add column if not exists settlement_status text not null default 'PENDING'
  check (settlement_status in ('PENDING', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED'));
alter table public.orders add column if not exists settled_at timestamptz;

comment on column public.orders.packed_at is
  'Sub-event within PROCESSING_FOR_DISPATCH — does not warrant its own lifecycle status (mirrors confirmed_at''s role within PENDING). Stamped by mark_order_packed().';
comment on column public.orders.delivery_attempts_count is
  'Trigger-maintained denormalized count of this order''s delivery_attempts rows — see apply_delivery_attempt_to_order(). Never written directly.';
comment on column public.orders.failed_delivery_reason is
  'Snapshot of the most recent non-DELIVERED delivery attempt''s reason, trigger-maintained from delivery_attempts — the full history lives in that table.';
comment on column public.orders.settlement_status is
  'Trigger-maintained snapshot of this order''s latest order_settlements row (or PENDING if none exists yet) — the full settlement ledger lives in order_settlements.';


-- ---------------------------------------------------------------
-- PART V (partial) — new permission modules. Reusing every existing
-- permission wherever it already covers the need: bulk status
-- transitions, cash collection and delivery-attempt recording all
-- gate on the EXISTING orders.update/orders.manage — they are order
-- mutations, not a new capability class. Only genuinely new
-- capability surfaces get new slugs.
-- ---------------------------------------------------------------
insert into public.permissions (module, action, slug, category, description) values
  ('operations', 'view', 'operations.view', 'Operations', 'View the Operations dashboard and Rescue Board'),
  ('operations', 'manage', 'operations.manage', 'Operations', 'Full operations module access'),

  ('fulfillment', 'view', 'fulfillment.view', 'Fulfillment', 'View fulfillment/packing status'),
  ('fulfillment', 'manage', 'fulfillment.manage', 'Fulfillment', 'Mark orders packed/ready for dispatch'),

  ('waybills', 'view', 'waybills.view', 'Waybills', 'View waybills'),
  ('waybills', 'create', 'waybills.create', 'Waybills', 'Create waybills'),
  ('waybills', 'update', 'waybills.update', 'Waybills', 'Update waybill status'),
  ('waybills', 'manage', 'waybills.manage', 'Waybills', 'Full waybill management'),

  ('delivery_partners', 'view', 'delivery_partners.view', 'Delivery Partners', 'View delivery partners'),
  ('delivery_partners', 'manage', 'delivery_partners.manage', 'Delivery Partners', 'Create/edit delivery partners'),

  ('tasks', 'view', 'tasks.view', 'Follow-up Tasks', 'View follow-up tasks'),
  ('tasks', 'create', 'tasks.create', 'Follow-up Tasks', 'Create follow-up tasks'),
  ('tasks', 'update', 'tasks.update', 'Follow-up Tasks', 'Update/complete follow-up tasks'),
  ('tasks', 'assign', 'tasks.assign', 'Follow-up Tasks', 'Assign follow-up tasks to staff'),
  ('tasks', 'manage', 'tasks.manage', 'Follow-up Tasks', 'Full follow-up task management'),

  ('settlement', 'view', 'settlement.view', 'COD Settlement', 'View COD settlement/remittance records'),
  ('settlement', 'manage', 'settlement.manage', 'COD Settlement', 'Record/manage COD settlement')
on conflict (slug) do nothing;

-- Owner/Admin — explicit grant (their 0008 cross-join predates these rows).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin')
  and p.module in ('operations', 'fulfillment', 'waybills', 'delivery_partners', 'tasks', 'settlement')
on conflict do nothing;

-- Manager: full operational reach (view/create/update/assign), no
-- *.manage catch-all — mirrors 0008's own Manager convention exactly.
-- Deliberately NO settlement grant at all: cash reconciliation is
-- finance-adjacent, not a day-to-day operations concern.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and p.module in ('operations', 'fulfillment', 'waybills', 'delivery_partners', 'tasks')
  and p.action <> 'manage'
on conflict do nothing;

-- Customer Support: owns confirmation/follow-up calls end to end,
-- needs read visibility into where a delivery stands to answer
-- customers — but no fulfillment/waybill/partner/settlement authority.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'customer-support'
  and (
    p.slug in ('operations.view', 'waybills.view')
    or (p.module = 'tasks' and p.action <> 'manage')
  )
on conflict do nothing;

-- Warehouse Staff: owns packing/dispatch, needs to see and log
-- delivery-partner assignment and flag issues as tasks — but no task
-- assignment/management authority and no settlement/finance reach.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'warehouse-staff'
  and (
    p.slug in ('operations.view', 'fulfillment.view', 'fulfillment.manage',
               'waybills.view', 'waybills.create', 'waybills.update',
               'delivery_partners.view', 'tasks.create', 'tasks.view')
  )
on conflict do nothing;

-- Finance: settlement is explicitly theirs; operations.view for
-- cash-collection-relevant context. No fulfillment/waybill/task authority.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'finance'
  and p.slug in ('operations.view', 'settlement.view', 'settlement.manage')
on conflict do nothing;

-- Viewer: read-only, consistent with its existing "every action='view'" grant.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer'
  and p.module in ('operations', 'fulfillment', 'waybills', 'delivery_partners', 'tasks', 'settlement')
  and p.action = 'view'
on conflict do nothing;

-- Deliberately NOT granted to Marketing or Affiliate Manager — neither
-- role has any legitimate reach into fulfillment/delivery/settlement.


-- ---------------------------------------------------------------
-- PART E — Follow-up Tasks.
-- ---------------------------------------------------------------
create table public.order_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,

  task_type text not null check (task_type in (
    'CONFIRM_ORDER', 'CALL_BACK', 'VERIFY_ADDRESS', 'DELIVERY_FOLLOW_UP',
    'FAILED_DELIVERY', 'CUSTOMER_REQUEST', 'OTHER'
  )),
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),

  assigned_to uuid references public.profiles (id),
  due_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table public.order_tasks is
  'Follow-up tasks against an order — the human-intervention layer COD requires (confirmation calls, address verification, delivery follow-up). Every task is order-scoped; there is no freestanding task type in this phase.';

create index order_tasks_workspace_id_idx on public.order_tasks (workspace_id, status);
create index order_tasks_order_id_idx on public.order_tasks (order_id);
create index order_tasks_assigned_to_idx on public.order_tasks (assigned_to) where status in ('OPEN', 'IN_PROGRESS');
create index order_tasks_due_at_idx on public.order_tasks (due_at) where status in ('OPEN', 'IN_PROGRESS') and due_at is not null;

create trigger set_order_tasks_updated_at
  before update on public.order_tasks
  for each row execute function public.set_updated_at();

-- Dedicated audit trigger, NOT the generic log_audit_event(): that
-- function's CASE expression unconditionally references new.deleted_at
-- (a column products/categories/landing_pages happen to have), which
-- raises for any table's record type that lacks it — order_tasks/
-- waybills/delivery_attempts have no soft-delete column, so they
-- share this one small reusable trigger instead (same reasoning as
-- ad_costs getting its own dedicated trigger in 0024).
create or replace function public.log_ops_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  v_action := case when TG_OP = 'INSERT' then 'create' else 'update' end;
  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    new.workspace_id, new.brand_id, auth.uid(), TG_ARGV[0], v_action, TG_ARGV[0], new.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new)
  );
  return new;
end;
$$;

create trigger audit_order_tasks
  after insert or update on public.order_tasks
  for each row execute function public.log_ops_audit_event('tasks');

alter table public.order_tasks enable row level security;

create policy "select_order_tasks" on public.order_tasks
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'tasks.view')
  );

-- Direct client updates are allowed only for the editable descriptive
-- fields — status transitions and assignment go through the RPCs
-- below (side effects: completed_at stamping, notifications, order
-- timeline events), enforced by keeping status/assigned_to constant
-- in the WITH CHECK, exactly the affiliates.approval_status pattern.
create policy "update_order_tasks" on public.order_tasks
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'tasks.update') or public.user_has_permission(workspace_id, 'tasks.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'tasks.update') or public.user_has_permission(workspace_id, 'tasks.manage'))
    and status = (select t.status from public.order_tasks t where t.id = order_tasks.id)
    and assigned_to is not distinct from (select t.assigned_to from public.order_tasks t where t.id = order_tasks.id)
  );

-- No client insert/delete policy — creation goes through
-- create_order_task() (needs the order's workspace/brand resolved
-- server-side and an order_events row written atomically with it).


create or replace function public.create_order_task(
  p_order_id uuid,
  p_task_type text,
  p_title text,
  p_description text default null,
  p_priority text default 'normal',
  p_assigned_to uuid default null,
  p_due_at timestamptz default null
)
returns public.order_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_task public.order_tasks%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'tasks.create') or public.user_has_permission(v_order.workspace_id, 'tasks.manage')) then
    raise exception 'insufficient_permission: tasks.create required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title is required';
  end if;

  insert into public.order_tasks (
    workspace_id, brand_id, order_id, customer_id, task_type, title, description,
    priority, assigned_to, due_at, created_by, updated_by
  ) values (
    v_order.workspace_id, v_order.brand_id, p_order_id, v_order.customer_id, p_task_type, trim(p_title), p_description,
    coalesce(p_priority, 'normal'), p_assigned_to, p_due_at, auth.uid(), auth.uid()
  )
  returning * into v_task;

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    p_order_id, v_order.workspace_id, v_order.brand_id, 'TASK_CREATED',
    'Follow-up task created: ' || trim(p_title), jsonb_build_object('task_id', v_task.id, 'task_type', p_task_type), auth.uid()
  );

  if p_assigned_to is not null and p_assigned_to <> auth.uid() then
    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
    values (
      v_order.workspace_id, v_order.brand_id, p_assigned_to, 'task_assigned', 'New follow-up task assigned',
      v_task.title || ' — order ' || v_order.order_number, case when v_task.priority in ('high', 'urgent') then v_task.priority else 'normal' end,
      '/orders/' || p_order_id, jsonb_build_object('task_id', v_task.id)
    );
  end if;

  return v_task;
end;
$$;

create or replace function public.assign_order_task(p_task_id uuid, p_assigned_to uuid)
returns public.order_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.order_tasks%rowtype;
begin
  select * into v_task from public.order_tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;
  if not (public.user_has_permission(v_task.workspace_id, 'tasks.assign') or public.user_has_permission(v_task.workspace_id, 'tasks.manage')) then
    raise exception 'insufficient_permission: tasks.assign required';
  end if;
  if v_task.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Cannot reassign a % task', v_task.status;
  end if;

  update public.order_tasks set assigned_to = p_assigned_to, updated_by = auth.uid() where id = p_task_id
    returning * into v_task;

  if p_assigned_to is not null and p_assigned_to <> auth.uid() then
    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
    values (
      v_task.workspace_id, v_task.brand_id, p_assigned_to, 'task_assigned', 'Follow-up task assigned to you',
      v_task.title, 'normal', '/orders/' || v_task.order_id, jsonb_build_object('task_id', v_task.id)
    );
  end if;

  return v_task;
end;
$$;

create or replace function public.update_order_task_status(p_task_id uuid, p_status text, p_note text default null)
returns public.order_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.order_tasks%rowtype;
begin
  select * into v_task from public.order_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if not (public.user_has_permission(v_task.workspace_id, 'tasks.update') or public.user_has_permission(v_task.workspace_id, 'tasks.manage')) then
    raise exception 'insufficient_permission: tasks.update required';
  end if;
  if v_task.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Task is already %', v_task.status;
  end if;
  if p_status not in ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') then
    raise exception 'Unknown task status %', p_status;
  end if;

  update public.order_tasks
    set status = p_status,
        completed_at = case when p_status = 'COMPLETED' then now() else completed_at end,
        updated_by = auth.uid()
    where id = p_task_id
    returning * into v_task;

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    v_task.order_id, v_task.workspace_id, v_task.brand_id, 'TASK_' || p_status,
    'Task "' || v_task.title || '" ' || lower(p_status) || coalesce(': ' || p_note, ''),
    jsonb_build_object('task_id', v_task.id, 'note', p_note), auth.uid()
  );

  return v_task;
end;
$$;


-- ---------------------------------------------------------------
-- PART M — Delivery Partners. Simple directory, workspace-scoped
-- (one partner can serve every brand in the workspace) — direct RLS
-- CRUD, no state machine, mirrors the Brands/Affiliates directory
-- pattern.
-- ---------------------------------------------------------------
create table public.delivery_partners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  coverage_areas text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

create index delivery_partners_workspace_id_idx on public.delivery_partners (workspace_id) where deleted_at is null;

create trigger set_delivery_partners_updated_at
  before update on public.delivery_partners
  for each row execute function public.set_updated_at();

create trigger audit_delivery_partners
  after insert or update on public.delivery_partners
  for each row execute function public.log_audit_event('delivery_partners');

alter table public.delivery_partners enable row level security;

create policy "select_delivery_partners" on public.delivery_partners
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'delivery_partners.view')
  );

create policy "write_delivery_partners" on public.delivery_partners
  for all to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'delivery_partners.manage')
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'delivery_partners.manage')
  );


-- ---------------------------------------------------------------
-- PART J — Waybills. Its own small state machine (a waybill is a
-- physical package/movement record, not a second order-lifecycle) —
-- writes go through RPCs so status transitions and the order-status
-- coupling stay validated and atomic. The partial unique index
-- allows the real "returned then redispatched" scenario (a fresh
-- waybill after a terminal one) while still preventing two live
-- waybills on the same order at once.
-- ---------------------------------------------------------------
create table public.waybills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  waybill_number text not null,
  delivery_partner_id uuid references public.delivery_partners (id) on delete set null,
  destination_address text,
  destination_state text,
  cod_amount numeric(14, 2) not null default 0,
  status text not null default 'CREATED'
    check (status in ('CREATED', 'READY', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED')),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  unique (workspace_id, waybill_number)
);

comment on table public.waybills is
  'One row per physical dispatch attempt of an order. At most one non-terminal (not DELIVERED/FAILED/RETURNED/CANCELLED) waybill may exist per order at a time (see waybills_one_active_per_order_idx) — a returned order gets a fresh waybill on redispatch rather than reusing the old one.';

create unique index waybills_one_active_per_order_idx on public.waybills (order_id)
  where status not in ('DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');
create index waybills_workspace_id_idx on public.waybills (workspace_id, status);
create index waybills_order_id_idx on public.waybills (order_id);
create index waybills_delivery_partner_id_idx on public.waybills (delivery_partner_id) where delivery_partner_id is not null;

create trigger set_waybills_updated_at
  before update on public.waybills
  for each row execute function public.set_updated_at();

create trigger audit_waybills
  after insert or update on public.waybills
  for each row execute function public.log_ops_audit_event('waybills');

alter table public.waybills enable row level security;

create policy "select_waybills" on public.waybills
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'waybills.view')
  );

-- No client insert/update policy — create_waybill()/update_waybill_status() only.


create or replace function public.generate_waybill_number(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text;
  v_next bigint;
begin
  select coalesce(country_code, 'XX') into v_country from public.workspaces where id = p_workspace_id;

  insert into public.order_number_counters (workspace_id, prefix, next_value)
    values (p_workspace_id, 'WB-' || v_country, 2)
    on conflict (workspace_id, prefix) do update set next_value = order_number_counters.next_value + 1
    returning next_value - 1 into v_next;

  return 'WB-' || v_country || '-' || lpad(v_next::text, 6, '0');
end;
$$;

comment on function public.generate_waybill_number(uuid) is
  'Reuses order_number_counters (a generic workspace+prefix sequence, not orders-specific) with a "WB-<country>" prefix — no duplicate counter table.';

create or replace function public.create_waybill(
  p_order_id uuid,
  p_delivery_partner_id uuid default null,
  p_destination_address text default null,
  p_destination_state text default null,
  p_cod_amount numeric default null,
  p_notes text default null
)
returns public.waybills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_waybill public.waybills%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'waybills.create') or public.user_has_permission(v_order.workspace_id, 'waybills.manage')) then
    raise exception 'insufficient_permission: waybills.create required';
  end if;
  if exists (
    select 1 from public.waybills
    where order_id = p_order_id and status not in ('DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED')
  ) then
    raise exception 'Order % already has an active waybill', v_order.order_number;
  end if;

  insert into public.waybills (
    workspace_id, brand_id, order_id, waybill_number, delivery_partner_id,
    destination_address, destination_state, cod_amount, notes, created_by, updated_by
  ) values (
    v_order.workspace_id, v_order.brand_id, p_order_id, public.generate_waybill_number(v_order.workspace_id), p_delivery_partner_id,
    coalesce(p_destination_address, v_order.customer_address), coalesce(p_destination_state, v_order.customer_state),
    coalesce(p_cod_amount, v_order.total_amount), p_notes, auth.uid(), auth.uid()
  )
  returning * into v_waybill;

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    p_order_id, v_order.workspace_id, v_order.brand_id, 'WAYBILL_CREATED',
    'Waybill ' || v_waybill.waybill_number || ' created', jsonb_build_object('waybill_id', v_waybill.id), auth.uid()
  );

  return v_waybill;
end;
$$;

create or replace function public.update_waybill_status(p_waybill_id uuid, p_status text, p_note text default null)
returns public.waybills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waybill public.waybills%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_waybill from public.waybills where id = p_waybill_id for update;
  if not found then
    raise exception 'Waybill not found';
  end if;
  if not (public.user_has_permission(v_waybill.workspace_id, 'waybills.update') or public.user_has_permission(v_waybill.workspace_id, 'waybills.manage')) then
    raise exception 'insufficient_permission: waybills.update required';
  end if;
  if v_waybill.status in ('DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED') then
    raise exception 'Waybill is already in a terminal state (%)', v_waybill.status;
  end if;
  if not (
    (v_waybill.status = 'CREATED' and p_status in ('READY', 'CANCELLED'))
    or (v_waybill.status = 'READY' and p_status in ('DISPATCHED', 'CANCELLED'))
    or (v_waybill.status = 'DISPATCHED' and p_status in ('IN_TRANSIT', 'FAILED', 'RETURNED'))
    or (v_waybill.status = 'IN_TRANSIT' and p_status in ('OUT_FOR_DELIVERY', 'FAILED', 'RETURNED'))
    or (v_waybill.status = 'OUT_FOR_DELIVERY' and p_status in ('DELIVERED', 'FAILED', 'RETURNED'))
  ) then
    raise exception 'Invalid waybill status transition: % -> %', v_waybill.status, p_status;
  end if;

  update public.waybills
    set status = p_status,
        dispatched_at = case when p_status = 'DISPATCHED' then now() else dispatched_at end,
        delivered_at = case when p_status = 'DELIVERED' then now() else delivered_at end,
        returned_at = case when p_status = 'RETURNED' then now() else returned_at end,
        notes = coalesce(p_note, notes),
        updated_by = auth.uid()
    where id = p_waybill_id
    returning * into v_waybill;

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    v_waybill.order_id, v_waybill.workspace_id, v_waybill.brand_id, 'WAYBILL_STATUS_CHANGED',
    'Waybill ' || v_waybill.waybill_number || ' -> ' || p_status || coalesce(': ' || p_note, ''),
    jsonb_build_object('waybill_id', v_waybill.id, 'status', p_status), auth.uid()
  );

  -- Couple to the order's own guarded status transition only at the
  -- two unambiguous points — dispatch and return. This goes through
  -- the SAME UPDATE path guard_order_status_transition() already
  -- guards, never bypassing it: if the order is already past the
  -- matching state (e.g. a manual status change got there first),
  -- the transition is simply not legal and this is a silent no-op,
  -- not a hard failure of the waybill update itself.
  select * into v_order from public.orders where id = v_waybill.order_id;
  if p_status = 'DISPATCHED' and v_order.status in ('PROCESSING_FOR_DISPATCH', 'SCHEDULED') then
    update public.orders set status = 'DISPATCHED', updated_by = auth.uid() where id = v_order.id;
  elsif p_status = 'RETURNED' and v_order.status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED') then
    update public.orders set status = 'RETURNED', return_reason = coalesce(p_note, 'Waybill returned'), updated_by = auth.uid() where id = v_order.id;
  end if;

  return v_waybill;
end;
$$;

comment on function public.update_waybill_status(uuid, text, text) is
  'The only legal way to change a waybill''s status — validates the transition graph server-side and, at the dispatch/return points only, attempts the matching order status transition through orders'' own guarded UPDATE path (never a bypass) so the two stay coupled without a second conflicting lifecycle system.';


-- ---------------------------------------------------------------
-- PART N — Delivery Attempts. attempt_number is always server-
-- computed, never client-supplied. The order-level denormalized
-- delivery_attempts_count/failed_delivery_reason are maintained by
-- the trigger below, mirroring the trigger-maintained-aggregate
-- pattern already used for customers.total_orders/products.
-- stock_quantity/affiliate_wallets.balance.
-- ---------------------------------------------------------------
create table public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  waybill_id uuid references public.waybills (id) on delete set null,
  delivery_partner_id uuid references public.delivery_partners (id) on delete set null,
  attempt_number integer not null,
  result text not null check (result in ('DELIVERED', 'CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS', 'RESCHEDULED', 'OTHER')),
  failure_reason text,
  notes text,
  attempted_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index delivery_attempts_order_id_idx on public.delivery_attempts (order_id, attempt_number);
create index delivery_attempts_workspace_id_idx on public.delivery_attempts (workspace_id);

alter table public.delivery_attempts enable row level security;

create policy "select_delivery_attempts" on public.delivery_attempts
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'orders.view')
  );

-- No client insert policy — record_delivery_attempt() only (attempt_number must be server-computed).

create or replace function public.apply_delivery_attempt_to_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
    set delivery_attempts_count = delivery_attempts_count + 1,
        failed_delivery_reason = case when new.result <> 'DELIVERED' then coalesce(new.failure_reason, new.result) else failed_delivery_reason end
    where id = new.order_id;
  return new;
end;
$$;

create trigger apply_delivery_attempt
  after insert on public.delivery_attempts
  for each row execute function public.apply_delivery_attempt_to_order();

create trigger audit_delivery_attempts
  after insert on public.delivery_attempts
  for each row execute function public.log_ops_audit_event('waybills');

create or replace function public.record_delivery_attempt(
  p_order_id uuid,
  p_result text,
  p_waybill_id uuid default null,
  p_delivery_partner_id uuid default null,
  p_failure_reason text default null,
  p_notes text default null
)
returns public.delivery_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.delivery_attempts%rowtype;
  v_next_attempt integer;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'orders.update') or public.user_has_permission(v_order.workspace_id, 'orders.manage')) then
    raise exception 'insufficient_permission: orders.update required';
  end if;
  if p_result not in ('DELIVERED', 'CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS', 'RESCHEDULED', 'OTHER') then
    raise exception 'Unknown delivery attempt result %', p_result;
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_next_attempt from public.delivery_attempts where order_id = p_order_id;

  insert into public.delivery_attempts (
    workspace_id, brand_id, order_id, waybill_id, delivery_partner_id, attempt_number, result, failure_reason, notes, created_by
  ) values (
    v_order.workspace_id, v_order.brand_id, p_order_id, p_waybill_id, p_delivery_partner_id, v_next_attempt, p_result, p_failure_reason, p_notes, auth.uid()
  )
  returning * into v_attempt;

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    p_order_id, v_order.workspace_id, v_order.brand_id, 'DELIVERY_ATTEMPT',
    'Delivery attempt #' || v_next_attempt || ': ' || p_result || coalesce(' — ' || p_failure_reason, ''),
    jsonb_build_object('attempt_id', v_attempt.id, 'attempt_number', v_next_attempt, 'result', p_result), auth.uid()
  );

  -- Only the unambiguous DELIVERED outcome drives the order's own
  -- status, through the same guarded path. Every other outcome is
  -- pure record-keeping — staff decide the next status explicitly
  -- (reschedule, cancel, escalate) rather than the system guessing.
  --
  -- guard_order_status_transition() (0016, untouched) defaults a
  -- DELIVERED order with no explicit cash_collected_amount to fully
  -- "collected" — a deliberate Phase 1 convenience for the classic
  -- direct-status-change path, preserved here exactly as-is. Part Y's
  -- invariant ("delivered does not automatically mean collected")
  -- is a Phase 6 rule for Phase 6's own new path: explicitly setting
  -- cash_collected_amount = 0 / cash_collection_status = 'pending' in
  -- this UPDATE stops that guard-trigger default from firing (its
  -- condition is "cash_collected_amount is null"), so an order
  -- delivered via a recorded delivery attempt starts pending and
  -- requires the explicit record_cash_collection() call — the old
  -- path's behavior for everyone else is untouched.
  if p_result = 'DELIVERED' and v_order.status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED') then
    update public.orders
      set status = 'DELIVERED', cash_collected_amount = 0, cash_collection_status = 'pending', updated_by = auth.uid()
      where id = p_order_id;
  elsif p_result <> 'DELIVERED' then
    if v_order.assigned_to is not null and v_order.assigned_to <> auth.uid() then
      insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
      values (
        v_order.workspace_id, v_order.brand_id, v_order.assigned_to, 'delivery_failed', 'Delivery attempt failed',
        'Order ' || v_order.order_number || ': ' || p_result, 'high', '/orders/' || p_order_id,
        jsonb_build_object('attempt_id', v_attempt.id)
      );
    end if;
  end if;

  return v_attempt;
end;
$$;


-- ---------------------------------------------------------------
-- PART K — Fulfillment: a thin packed_at/packed_by stamp within the
-- EXISTING PROCESSING_FOR_DISPATCH status, not a second status
-- system. Inventory is untouched here — adjust_inventory() already
-- fires RESERVED at order creation and SOLD/RELEASED on status
-- change (0016); packing is purely an operational timestamp on top
-- of that, never a stock movement of its own.
-- ---------------------------------------------------------------
create or replace function public.mark_order_packed(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'fulfillment.manage') or public.user_has_permission(v_order.workspace_id, 'orders.manage')) then
    raise exception 'insufficient_permission: fulfillment.manage required';
  end if;
  if v_order.status not in ('SCHEDULED', 'PROCESSING_FOR_DISPATCH') then
    raise exception 'Order must be Scheduled or Processing for Dispatch to be packed (currently %)', v_order.status;
  end if;

  update public.orders set packed_at = now(), packed_by = auth.uid(), updated_by = auth.uid() where id = p_order_id
    returning * into v_order;

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, created_by)
  values (p_order_id, v_order.workspace_id, v_order.brand_id, 'ORDER_PACKED', 'Order packed and ready for dispatch', auth.uid());

  return v_order;
end;
$$;


-- ---------------------------------------------------------------
-- PART O — Cash collection. cash_collection_status/
-- cash_collected_amount/cash_collected_at already exist (0013) and
-- are reused exactly. This is the ONE controlled write path — the
-- existing RLS "update_orders" policy already lets any orders.update
-- holder UPDATE the orders row directly, which would let the
-- frontend write an arbitrary collected amount with no validation;
-- record_cash_collection() is the sanctioned path the frontend must
-- use instead, but the RLS policy itself is intentionally left as-is
-- (narrowing it would break the existing status-transition UI's
-- direct order UPDATE) — the RPC adds the validation the direct path
-- lacks, not a new access boundary.
-- ---------------------------------------------------------------
create or replace function public.record_cash_collection(p_order_id uuid, p_amount numeric, p_note text default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_status text;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'orders.update') or public.user_has_permission(v_order.workspace_id, 'orders.manage')) then
    raise exception 'insufficient_permission: orders.update required';
  end if;
  if v_order.status <> 'DELIVERED' then
    raise exception 'Cash can only be recorded against a DELIVERED order (currently %)', v_order.status;
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be zero or positive';
  end if;
  if p_amount > v_order.total_amount then
    raise exception 'Collected amount (%) cannot exceed the order total (%)', p_amount, v_order.total_amount;
  end if;

  v_status := case when p_amount = 0 then 'failed' when p_amount < v_order.total_amount then 'partial' else 'collected' end;

  update public.orders
    set cash_collection_status = v_status,
        cash_collected_amount = p_amount,
        cash_collected_at = now(),
        internal_notes = case when p_note is not null then coalesce(internal_notes || E'\n', '') || p_note else internal_notes end,
        updated_by = auth.uid()
    where id = p_order_id
    returning * into v_order;

  return v_order;
end;
$$;

-- Extend log_order_event() (0016) so a 'partial' collection also
-- writes a CASH_COLLECTED timeline event — it previously only fired
-- for the 'collected' outcome, a real gap now that record_cash_
-- collection() makes 'partial' a first-class, reachable outcome.
-- Every other branch of the function is byte-for-byte unchanged.
create or replace function public.log_order_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added text[];
  v_removed text[];
  v_tag_description text;
begin
  if TG_OP = 'INSERT' then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, to_status, description, created_by)
    values (new.id, new.workspace_id, new.brand_id, 'ORDER_CREATED', new.status, 'Order created', new.created_by);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, from_status, to_status, description, created_by)
    values (
      new.id, new.workspace_id, new.brand_id, 'STATUS_CHANGED', old.status, new.status,
      'Status changed from ' || old.status || ' to ' || new.status, new.updated_by
    );
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
    values (
      new.id, new.workspace_id, new.brand_id, 'ASSIGNED',
      case when new.assigned_to is null then 'Order unassigned' else 'Order assigned' end,
      jsonb_build_object('assigned_to', new.assigned_to), new.updated_by
    );
  end if;

  if new.tags is distinct from old.tags then
    v_added := array(select unnest(new.tags) except select unnest(old.tags));
    v_removed := array(select unnest(old.tags) except select unnest(new.tags));
    if coalesce(array_length(v_added, 1), 0) > 0 or coalesce(array_length(v_removed, 1), 0) > 0 then
      v_tag_description := trim(both ', ' from
        (case when coalesce(array_length(v_added, 1), 0) > 0 then 'Added: ' || array_to_string(v_added, ', ') || '. ' else '' end) ||
        (case when coalesce(array_length(v_removed, 1), 0) > 0 then 'Removed: ' || array_to_string(v_removed, ', ') else '' end)
      );
      insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
      values (
        new.id, new.workspace_id, new.brand_id, 'TAGS_UPDATED', v_tag_description,
        jsonb_build_object('added', v_added, 'removed', v_removed), new.updated_by
      );
    end if;
  end if;

  if new.cash_collection_status is distinct from old.cash_collection_status and new.cash_collection_status in ('collected', 'partial') then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
    values (
      new.id, new.workspace_id, new.brand_id, 'CASH_COLLECTED',
      initcap(new.cash_collection_status) || ' cash collected: ' || new.cash_collected_amount,
      jsonb_build_object('amount', new.cash_collected_amount, 'status', new.cash_collection_status), new.updated_by
    );
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------
-- PART P — COD Settlement foundation. A pure operational
-- cash-reconciliation ledger — never redefines delivered_revenue or
-- any other Finance figure. expected_amount/collected_amount are
-- snapshotted from the order at settlement-record time (never
-- silently rewritten later); discrepancy is generated, not
-- editable. orders.settlement_status/settled_at (0025, above) are a
-- trigger-maintained snapshot of the latest row here, mirroring the
-- affiliate_wallets balance / customers.total_orders pattern.
-- ---------------------------------------------------------------
create table public.order_settlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  expected_amount numeric(14, 2) not null,
  collected_amount numeric(14, 2) not null,
  delivery_fee numeric(14, 2) not null default 0,
  remitted_amount numeric(14, 2) not null default 0,
  discrepancy numeric(14, 2) generated always as (collected_amount - delivery_fee - remitted_amount) stored,
  status text not null default 'PENDING' check (status in ('PENDING', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED')),
  settled_at timestamptz,
  settled_by uuid references auth.users (id),
  dispute_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table public.order_settlements is
  'Operational cash-reconciliation ledger — Delivered -> Cash Collected -> Amount Expected -> Amount Remitted -> Outstanding. Never redefines Finance''s delivered_revenue; expected_amount/collected_amount are snapshots taken at record time, not live joins, so a later order edit cannot silently rewrite settlement history.';

create index order_settlements_order_id_idx on public.order_settlements (order_id, created_at desc);
create index order_settlements_workspace_id_idx on public.order_settlements (workspace_id, status);

create trigger set_order_settlements_updated_at
  before update on public.order_settlements
  for each row execute function public.set_updated_at();

alter table public.order_settlements enable row level security;

create policy "select_order_settlements" on public.order_settlements
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'settlement.view')
  );

-- No client insert/update policy — create_order_settlement()/mark_settlement_disputed() only.

create or replace function public.log_settlement_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  v_action := case when TG_OP = 'INSERT' then 'create' else 'status_change' end;
  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    new.workspace_id, new.brand_id, auth.uid(), 'settlement', v_action, 'order_settlement', new.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new)
  );
  return new;
end;
$$;

create trigger audit_order_settlements
  after insert or update on public.order_settlements
  for each row execute function public.log_settlement_audit_event();

create or replace function public.apply_settlement_to_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
    set settlement_status = new.status,
        settled_at = case when new.status = 'SETTLED' then new.settled_at else settled_at end
    where id = new.order_id;
  return new;
end;
$$;

create trigger apply_settlement_after_write
  after insert or update on public.order_settlements
  for each row execute function public.apply_settlement_to_order();

create or replace function public.create_order_settlement(
  p_order_id uuid,
  p_remitted_amount numeric,
  p_delivery_fee numeric default 0,
  p_note text default null
)
returns public.order_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_settlement public.order_settlements%rowtype;
  v_status text;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'settlement.manage')) then
    raise exception 'insufficient_permission: settlement.manage required';
  end if;
  if v_order.cash_collection_status not in ('collected', 'partial') then
    raise exception 'Cannot settle an order with no cash collected (cash_collection_status = %)', v_order.cash_collection_status;
  end if;
  if p_remitted_amount is null or p_remitted_amount < 0 then
    raise exception 'remitted amount must be zero or positive';
  end if;

  v_status := case
    when p_remitted_amount >= (v_order.cash_collected_amount - coalesce(p_delivery_fee, 0)) then 'SETTLED'
    when p_remitted_amount > 0 then 'PARTIALLY_SETTLED'
    else 'PENDING'
  end;

  insert into public.order_settlements (
    workspace_id, brand_id, order_id, expected_amount, collected_amount, delivery_fee, remitted_amount,
    status, settled_at, settled_by, notes, created_by
  ) values (
    v_order.workspace_id, v_order.brand_id, p_order_id, v_order.total_amount, v_order.cash_collected_amount, coalesce(p_delivery_fee, 0), p_remitted_amount,
    v_status, case when v_status = 'SETTLED' then now() else null end, case when v_status = 'SETTLED' then auth.uid() else null end, p_note, auth.uid()
  )
  returning * into v_settlement;

  if v_settlement.discrepancy <> 0 then
    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
    values (
      v_order.workspace_id, v_order.brand_id, null, 'settlement_discrepancy', 'Settlement discrepancy',
      'Order ' || v_order.order_number || ' has a settlement discrepancy of ' || v_settlement.discrepancy,
      'high', '/orders/' || p_order_id, jsonb_build_object('settlement_id', v_settlement.id)
    );
  end if;

  return v_settlement;
end;
$$;

create or replace function public.mark_settlement_disputed(p_settlement_id uuid, p_reason text)
returns public.order_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement public.order_settlements%rowtype;
begin
  select * into v_settlement from public.order_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'Settlement not found';
  end if;
  if not public.user_has_permission(v_settlement.workspace_id, 'settlement.manage') then
    raise exception 'insufficient_permission: settlement.manage required';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'dispute_reason is required';
  end if;

  update public.order_settlements set status = 'DISPUTED', dispute_reason = p_reason where id = p_settlement_id
    returning * into v_settlement;

  return v_settlement;
end;
$$;


-- ---------------------------------------------------------------
-- PART S — Safe bulk status transitions. Every order is attempted
-- independently under its own SAVEPOINT so one illegal/unauthorized
-- row cannot roll back the rest of the batch, and the caller gets an
-- explicit per-row result — never a silent partial success or a
-- corrupted mixed state.
-- ---------------------------------------------------------------
create or replace function public.bulk_update_order_status(p_order_ids uuid[], p_new_status text, p_reason text default null)
returns table (order_id uuid, success boolean, error_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  foreach v_order_id in array p_order_ids
  loop
    begin
      update public.orders
        set status = p_new_status,
            cancellation_reason = case when p_new_status = 'CANCELLED' then coalesce(p_reason, cancellation_reason) else cancellation_reason end,
            return_reason = case when p_new_status = 'RETURNED' then coalesce(p_reason, return_reason) else return_reason end,
            updated_by = auth.uid()
        where id = v_order_id
          and workspace_id in (select public.user_workspace_ids())
          and (public.user_has_permission(workspace_id, 'orders.update') or public.user_has_permission(workspace_id, 'orders.manage'));

      if not found then
        order_id := v_order_id;
        success := false;
        error_message := 'Order not found or insufficient permission';
      else
        order_id := v_order_id;
        success := true;
        error_message := null;
      end if;
    exception when others then
      order_id := v_order_id;
      success := false;
      error_message := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

comment on function public.bulk_update_order_status(uuid[], text, text) is
  'Attempts p_new_status on every order independently (each caught in its own exception block, equivalent to a per-row SAVEPOINT) — an illegal transition or permission failure on one order never rolls back or blocks the others. Reuses the SAME guard_order_status_transition() trigger every single-order UPDATE already goes through; this is not a second validation path.';


-- ---------------------------------------------------------------
-- PART Q — Operations Dashboard summary RPC. Count fields gate on
-- operations.view (zeroed entirely without it, mirroring get_
-- finance_summary's own row-level gate); the two money fields are
-- additionally gated on user_has_finance_visibility(), the exact
-- same two-layer protection Part A just applied to get_order_stats().
-- ---------------------------------------------------------------
create or replace function public.get_operations_summary(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  awaiting_confirmation_count bigint,
  scheduled_count bigint,
  processing_count bigint,
  dispatched_count bigint,
  in_transit_count bigint,
  partially_delivered_count bigint,
  returned_count bigint,
  failed_deliveries_count bigint,
  pending_cash_collection_count bigint,
  pending_cash_collection_amount numeric,
  settlement_exceptions_count bigint,
  settlement_outstanding_amount numeric
)
language sql
stable
as $$
  with scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_permission(p_workspace_id, 'operations.view')
  )
  select
    count(*) filter (where status in ('NEW', 'PENDING', 'WILL_CALL_BACK')),
    count(*) filter (where status = 'SCHEDULED'),
    count(*) filter (where status = 'PROCESSING_FOR_DISPATCH'),
    count(*) filter (where status = 'DISPATCHED'),
    count(*) filter (where status = 'IN_TRANSIT'),
    count(*) filter (where status = 'PARTIALLY_DELIVERED'),
    count(*) filter (where status = 'RETURNED'),
    count(*) filter (where status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and delivery_attempts_count > 0),
    count(*) filter (where status = 'DELIVERED' and cash_collection_status in ('pending', 'partial')),
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount - coalesce(cash_collected_amount, 0)) filter (where status = 'DELIVERED' and cash_collection_status in ('pending', 'partial')), 0)
      else 0 end,
    count(*) filter (where settlement_status = 'DISPUTED'),
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce((
        select sum(s.discrepancy) from public.order_settlements s
        where s.order_id in (select id from scope) and s.status = 'DISPUTED'
      ), 0)
      else 0 end
  from scope;
$$;

comment on function public.get_operations_summary(uuid, uuid) is
  'Operations Dashboard aggregate. All count fields require operations.view (zeroed entirely otherwise, via the scope CTE). pending_cash_collection_amount/settlement_outstanding_amount additionally require finance visibility — an operations.view holder without finance.view/analytics.view/reports.view sees the counts but never the dollar amounts.';


-- ---------------------------------------------------------------
-- Rescue Board — orders genuinely needing human intervention right
-- now. Reuses order_tasks/delivery_attempts, never invents a count.
-- ---------------------------------------------------------------
create or replace function public.get_rescue_board(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  order_id uuid,
  order_number text,
  customer_name text,
  customer_phone text,
  total_amount numeric,
  currency_code text,
  status text,
  issue text,
  priority text,
  assigned_to uuid,
  scheduled_at timestamptz,
  delivery_attempts_count integer,
  open_task_count bigint,
  last_event_at timestamptz
)
language sql
stable
as $$
  select
    o.id, o.order_number, o.customer_name, o.customer_phone, o.total_amount, o.currency_code, o.status,
    case
      when o.status in ('NEW', 'PENDING') and o.created_at < now() - interval '24 hours' then 'Unanswered confirmation'
      when o.status = 'WILL_CALL_BACK' then 'Customer requested callback'
      when o.status = 'SCHEDULED' and o.scheduled_at is not null and o.scheduled_at < now() + interval '2 hours' then 'Scheduled delivery approaching'
      when o.delivery_attempts_count >= 2 and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') then 'Repeated failed delivery attempts'
      when o.failed_delivery_reason is not null and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') then 'Delivery exception: ' || o.failed_delivery_reason
      when o.status = 'RETURNED' then 'Returned order needs follow-up'
      else 'Needs review'
    end,
    case
      when o.status = 'WILL_CALL_BACK' or o.delivery_attempts_count >= 2 then 'urgent'
      when o.status in ('NEW', 'PENDING') and o.created_at < now() - interval '24 hours' then 'high'
      when o.status = 'RETURNED' then 'high'
      else 'normal'
    end,
    o.assigned_to, o.scheduled_at, o.delivery_attempts_count,
    (select count(*) from public.order_tasks t where t.order_id = o.id and t.status in ('OPEN', 'IN_PROGRESS')),
    (select max(e.created_at) from public.order_events e where e.order_id = o.id)
  from public.orders o
  where o.workspace_id = p_workspace_id
    and (p_brand_id is null or o.brand_id = p_brand_id)
    and o.deleted_at is null
    and public.user_has_permission(p_workspace_id, 'operations.view')
    and (
      (o.status in ('NEW', 'PENDING') and o.created_at < now() - interval '24 hours')
      or o.status = 'WILL_CALL_BACK'
      or (o.status = 'SCHEDULED' and o.scheduled_at is not null and o.scheduled_at < now() + interval '2 hours')
      or (o.delivery_attempts_count >= 2 and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED'))
      or (o.failed_delivery_reason is not null and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED'))
      or o.status = 'RETURNED'
    )
  order by
    case
      when o.status = 'WILL_CALL_BACK' or o.delivery_attempts_count >= 2 or o.status = 'RETURNED' then 1
      when o.status in ('NEW', 'PENDING') and o.created_at < now() - interval '24 hours' then 2
      else 3
    end,
    o.created_at asc;
$$;

comment on function public.get_rescue_board(uuid, uuid) is
  'Orders genuinely needing human intervention right now — every criterion is a real, already-existing field (status, created_at, scheduled_at, delivery_attempts_count, failed_delivery_reason). No invented "AI rescue" scoring; the issue/priority text is a deterministic label over real data, not a synthesized score.';


-- ---------------------------------------------------------------
-- Task Manager summary — overdue/due-today counts, computed live
-- (no cron/scheduled job exists in this codebase, so "overdue" is
-- read at query time, never a stored/notified state).
-- ---------------------------------------------------------------
create or replace function public.get_task_stats(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  open_count bigint,
  in_progress_count bigint,
  overdue_count bigint,
  due_today_count bigint,
  completed_today_count bigint
)
language sql
stable
as $$
  select
    count(*) filter (where status = 'OPEN'),
    count(*) filter (where status = 'IN_PROGRESS'),
    count(*) filter (where status in ('OPEN', 'IN_PROGRESS') and due_at is not null and due_at < now()),
    count(*) filter (where status in ('OPEN', 'IN_PROGRESS') and due_at is not null and due_at >= date_trunc('day', now()) and due_at < date_trunc('day', now()) + interval '1 day'),
    count(*) filter (where status = 'COMPLETED' and completed_at >= date_trunc('day', now()))
  from public.order_tasks
  where workspace_id = p_workspace_id
    and (p_brand_id is null or brand_id = p_brand_id)
    and public.user_has_permission(p_workspace_id, 'tasks.view');
$$;
