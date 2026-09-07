-- ============================================================
-- WORKFORCE OPERATIONS: INTELLIGENT AUTO-ASSIGNMENT, STAFF
-- CAPACITY/AVAILABILITY, ROLE-BASED COMMAND CENTERS & ACTIVITY (0038)
--
-- AUDIT-FIRST FINDINGS (inspected before writing anything below):
--
--   * assignment_rules (0027) already exists as "configuration
--     foundation... NOT consumed by create_order()" per its own
--     comment — and resolve_assignment() (0028) already DOES consume
--     it, fully implementing fixed/round_robin/least_workload
--     candidate selection with live re-verification of workspace
--     membership, profile status and the relevant permission. It is
--     already wired into the automation engine's ASSIGN_ORDER/
--     ASSIGN_TASK actions. This is the real assignment algorithm the
--     brief asks for — extending it, not writing a second one, is
--     the correct move.
--   * The genuine gaps in resolve_assignment(): no brand scoping (all
--     three strategy branches ignore p_brand_id entirely), and no
--     concept of staff capacity/availability (doesn't exist anywhere
--     in the schema yet).
--   * The automation engine is purely event-driven (WHEN/IF/THEN on
--     automation_events, processed synchronously at emit time) — there
--     is no time-based/scheduled trigger anywhere in the codebase, so
--     "wait 20 minutes, then assign the aged backlog" cannot be
--     expressed as an automation rule today. This is the one truly
--     missing piece: a sweep function a scheduler calls periodically.
--   * orders (0016), order_tasks (0025) and assignment_rules (0027)
--     all already carry the generic log_audit_event() trigger — every
--     assignment mutation and every rule-configuration change is
--     already captured in audit_logs automatically (before/after full
--     row, actor, timestamp). Re-verified directly against the
--     migration chain rather than assumed; no new audit trigger is
--     needed anywhere in this migration.
--   * notifications' workspace-broadcast row (user_id null) is NOT
--     permission-filtered on read (any workspace member sees it) —
--     confirmed via 0007's select_notifications policy. A "new order
--     available" alert must therefore be inserted per eligible
--     recipient, never as a broadcast, or Finance/Marketing/etc. would
--     see operational alerts meant for order-handling staff only.
--   * user_roles has no unique (user_id, workspace_id) constraint — a
--     person can hold multiple role grants in one workspace — so
--     capacity/availability cannot live there without ambiguity. A
--     small dedicated table keyed on (workspace_id, user_id) is the
--     correct extensible model, not a column bolted onto profiles
--     (global across workspaces) or user_roles (per-role-grant, not
--     per-person).
--   * assignOrder() in src/features/orders/api.ts is today a raw
--     client `.update()` relying solely on RLS — no recorded reason,
--     no distinction between manual and automatic assignment. Replaced
--     below with a proper assign_order() RPC.
--
-- Nothing here duplicates resolve_assignment()'s candidate-selection
-- logic, the automation engine, assignment_rules, notifications, or
-- audit_logs — every new function reuses them.
-- ============================================================

-- ============================================================
-- PART A — staff_assignment_settings: capacity/availability model.
-- Deliberately separate from profiles.status (account-level
-- active/inactive/suspended, unrelated) and from user_roles (a role
-- GRANT, of which a person can hold several per workspace). One row
-- per (workspace, person); absent row = every setting at its
-- documented default (available, unlimited capacity, auto-assignment
-- on) so this is zero-config for every existing workspace.
-- ============================================================
create table public.staff_assignment_settings (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  is_available_for_assignment boolean not null default true,
  max_active_orders integer check (max_active_orders is null or max_active_orders > 0),
  auto_assignment_enabled boolean not null default true,
  last_assigned_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  primary key (workspace_id, user_id)
);

comment on table public.staff_assignment_settings is
  'Per-(workspace, person) assignment capacity/availability. Absent row = fully available, unlimited capacity, auto-assignment enabled (every existing workspace needs zero migration/config). Written only via set_staff_assignment_settings() (staff.manage, for anyone) and set_my_assignment_availability() (self-service, availability only) — no direct client insert/update policy, matching the support_interactions convention.';

create trigger set_staff_assignment_settings_updated_at
  before update on public.staff_assignment_settings
  for each row execute function public.set_updated_at();

alter table public.staff_assignment_settings enable row level security;

create policy "select_staff_assignment_settings" on public.staff_assignment_settings
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      workspace_id in (select public.user_workspace_ids())
      and (public.user_has_permission(workspace_id, 'staff.view') or public.user_has_permission(workspace_id, 'staff.manage'))
    )
  );

-- Not wired to the generic log_audit_event() trigger (0021): that
-- function unconditionally reads new.brand_id, and this table is
-- deliberately workspace-scoped only (capacity/availability is not a
-- per-brand concept) — attaching it would error on every write.
-- updated_at/updated_by already record who changed a setting and
-- when; that is this table's audit trail.


-- ============================================================
-- PART B — assignment metadata on orders (who/why/when an assignment
-- happened, and — for automatic assignment specifically — the last
-- attempt's outcome even when it did NOT result in an assignment, so
-- "orders without eligible staff" is a real, queryable fact rather
-- than an inferred one).
-- ============================================================
alter table public.orders
  add column assignment_source text check (assignment_source in ('MANUAL', 'AUTO')),
  add column assignment_reason text,
  add column assignment_rule_id uuid references public.assignment_rules (id) on delete set null,
  add column last_auto_assignment_attempted_at timestamptz,
  add column last_auto_assignment_result text check (last_auto_assignment_result in (
    'ASSIGNED', 'NO_ELIGIBLE_STAFF', 'NO_AVAILABLE_STAFF', 'ALL_STAFF_AT_CAPACITY',
    'NO_PERMISSION_MATCH', 'DISABLED_MANUAL_STRATEGY', 'OUTSIDE_ASSIGNMENT_WINDOW'
  ));

comment on column public.orders.assignment_source is
  'MANUAL (assign_order() RPC) or AUTO (run_auto_assignment_sweep() / the automation engine''s ASSIGN_ORDER action). Null for orders assigned before this migration or never assigned — never backfilled/fabricated.';
comment on column public.orders.last_auto_assignment_result is
  'The outcome of the most recent automatic-assignment attempt for this order, recorded whether or not it actually resulted in an assignment — the honest basis for an "orders without eligible staff" dashboard card. Null means auto-assignment has never been attempted for this order.';

-- Hot path for the sweep's own claim query and the "unassigned/aging"
-- dashboard cards: unassigned, non-terminal orders ordered by age.
create index orders_unassigned_aging_idx on public.orders (workspace_id, brand_id, created_at)
  where assigned_to is null and deleted_at is null and status not in ('CANCELLED', 'DELIVERED', 'RETURNED');


-- ============================================================
-- PART C — assignment_rules: the configurable 20-minute default
-- (Part 6 of the brief: "must be configurable... default MUST be
-- 20 minutes"). Already has an audit trigger (0027) — see header note.
-- ============================================================
alter table public.assignment_rules
  add column aging_minutes integer not null default 20 check (aging_minutes > 0);

comment on column public.assignment_rules.aging_minutes is
  'Minutes an order/task must remain unassigned before run_auto_assignment_sweep() (orders) considers it eligible for automatic assignment. Default 20, per the brief''s explicit default; configurable per rule scope (workspace-wide or brand-specific). Irrelevant when strategy=manual (auto-assignment never runs for that scope regardless of aging_minutes).';

-- (assignment_rules and order_tasks already carry the generic
-- log_audit_event trigger from 0027/0025 respectively — re-verified
-- against the actual migration chain, not assumed. No new trigger
-- needed here.)


-- ============================================================
-- PART D — harden resolve_assignment() (0028) with brand scoping and
-- capacity/availability, and make it maintain last_assigned_at (the
-- "longest since last assignment" fairness signal) for every strategy
-- — not just round_robin/fixed's existing rotation cursor. Signature
-- unchanged; every existing caller (execute_automation_action's
-- ASSIGN_ORDER/ASSIGN_TASK, and this migration's own new sweep/
-- get_workforce_ops_summary) picks up the hardening automatically.
-- ============================================================
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
    left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
    where (ur.brand_id is null or ur.brand_id = p_brand_id)
      and coalesce(sas.is_available_for_assignment, true)
      and coalesce(sas.auto_assignment_enabled, true)
      and (p_module <> 'orders' or sas.max_active_orders is null or (
        select count(*) from public.orders oo
        where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
          and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and oo.deleted_at is null
      ) < sas.max_active_orders)
      and (v_rule.last_assigned_staff_id is null or fixed.user_id > v_rule.last_assigned_staff_id)
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
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      where (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
        and (p_module <> 'orders' or sas.max_active_orders is null or (
          select count(*) from public.orders oo
          where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
            and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and oo.deleted_at is null
        ) < sas.max_active_orders)
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
    left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
    where ur.workspace_id = p_workspace_id
      and (ur.brand_id is null or ur.brand_id = p_brand_id)
      and coalesce(sas.is_available_for_assignment, true)
      and coalesce(sas.auto_assignment_enabled, true)
      and (p_module <> 'orders' or sas.max_active_orders is null or (
        select count(*) from public.orders oo
        where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
          and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and oo.deleted_at is null
      ) < sas.max_active_orders)
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
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      where ur.workspace_id = p_workspace_id
        and (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
        and (p_module <> 'orders' or sas.max_active_orders is null or (
          select count(*) from public.orders oo
          where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
            and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and oo.deleted_at is null
        ) < sas.max_active_orders)
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
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      left join public.orders o on o.assigned_to = ur.user_id and o.workspace_id = p_workspace_id
        and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and o.deleted_at is null
      where ur.workspace_id = p_workspace_id
        and (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
      group by ur.user_id, sas.max_active_orders, sas.last_assigned_at
      having sas.max_active_orders is null or count(o.id) < sas.max_active_orders
      order by count(o.id), coalesce(sas.last_assigned_at, 'epoch'::timestamptz), ur.user_id
      limit 1;
    else
      select ur.user_id into v_candidate
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      left join public.order_tasks t on t.assigned_to = ur.user_id and t.workspace_id = p_workspace_id
        and t.status not in ('COMPLETED', 'CANCELLED')
      where ur.workspace_id = p_workspace_id
        and (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
      group by ur.user_id, sas.last_assigned_at
      order by count(t.id), coalesce(sas.last_assigned_at, 'epoch'::timestamptz), ur.user_id
      limit 1;
    end if;
  end if;

  if v_candidate is not null then
    if v_rule.strategy in ('round_robin', 'fixed') then
      update public.assignment_rules set last_assigned_staff_id = v_candidate where id = v_rule.id;
    end if;
    insert into public.staff_assignment_settings (workspace_id, user_id, last_assigned_at)
    values (p_workspace_id, v_candidate, now())
    on conflict (workspace_id, user_id) do update set last_assigned_at = excluded.last_assigned_at;
  end if;

  return v_candidate;
end;
$$;

comment on function public.resolve_assignment(uuid, uuid, text) is
  'Consumes assignment_rules. Returns null (leave unassigned / manual) when no active rule exists, strategy=manual, or no eligible staff can be found. Eligibility (workspace membership, brand scope, active profile status, relevant permission, availability, auto-assignment opt-in, and — for orders — capacity) is re-verified live, never from stale rule-creation-time data. Maintains last_assigned_at for every strategy (the "longest since last assignment" fairness signal least_workload''s tie-break and future scoring reads), not just round_robin/fixed''s rotation cursor.';


-- ============================================================
-- PART E — assign_order(): the manual assign/reassign/unassign path,
-- replacing the raw client `.update()` assignOrder() previously used.
-- No 20-minute restriction — that applies to AUTOMATIC assignment
-- only (Part 10 of the brief). Records source/reason/actor/timestamp;
-- previous/new assignee are already captured for free by the existing
-- generic audit_logs trigger (full before/after row) and by
-- log_order_event()'s ASSIGNED event + order_assigned/order_reassigned
-- notifications (0037) — both fire from the plain UPDATE below,
-- unchanged.
-- ============================================================
create or replace function public.assign_order(p_order_id uuid, p_assigned_to uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'insufficient_permission: must be signed in';
  end if;

  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'Order not found';
  end if;

  if not (public.user_has_permission(v_order.workspace_id, 'orders.assign') or public.user_has_permission(v_order.workspace_id, 'orders.manage')) then
    raise exception 'insufficient_permission: orders.assign required';
  end if;

  if p_assigned_to is not null and not exists (
    select 1 from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    where ur.user_id = p_assigned_to and ur.workspace_id = v_order.workspace_id
  ) then
    raise exception 'Assignee is not an active member of this workspace';
  end if;

  update public.orders
  set assigned_to = p_assigned_to,
      updated_by = v_actor,
      assignment_source = 'MANUAL',
      assignment_reason = p_reason,
      assignment_rule_id = null
  where id = p_order_id
  returning * into v_order;

  if p_assigned_to is not null then
    insert into public.staff_assignment_settings (workspace_id, user_id, last_assigned_at)
    values (v_order.workspace_id, p_assigned_to, now())
    on conflict (workspace_id, user_id) do update set last_assigned_at = excluded.last_assigned_at;
  end if;

  return v_order;
end;
$$;

comment on function public.assign_order(uuid, uuid, text) is
  'Authorized manual assign/reassign (p_assigned_to not null) or unassign (p_assigned_to null). No aging restriction — that applies only to run_auto_assignment_sweep(). Previous assignee, actor, and timestamp are captured for free by the existing generic orders audit trigger (full before/after row) and by log_order_event()''s ASSIGNED event/notifications; this function''s own job is only the new assignment_source=MANUAL/assignment_reason metadata.';


-- ============================================================
-- PART F — run_auto_assignment_sweep(): the missing scheduled-sweep
-- driver. The automation engine is purely event-driven and has no
-- concept of "wait N minutes then act" — this is the one genuinely
-- new piece of assignment infrastructure this migration adds, and it
-- delegates all actual candidate selection to resolve_assignment()
-- (Part D) rather than re-implementing scoring.
--
-- Concurrency: `for update skip locked` means two overlapping sweep
-- calls (e.g. two scheduler invocations that overlap, or a manual
-- "Run now" click during a scheduled run) can never both claim the
-- same order — the second simply skips whatever the first is holding
-- and moves to the next unlocked eligible row. Idempotent under
-- retries: an order already assigned, or attempted within the last 2
-- minutes, is excluded from the claim query entirely.
-- ============================================================
create or replace function public.run_auto_assignment_sweep(p_workspace_id uuid, p_brand_id uuid default null, p_limit integer default 20)
returns table (
  order_id uuid,
  order_number text,
  result text,
  assigned_to uuid,
  assignment_reason text,
  candidate_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_rule record;
  v_aging_minutes integer;
  v_candidate uuid;
  v_candidate_count integer;
  v_available_exists boolean;
  v_result text;
begin
  if not (public.user_has_permission(p_workspace_id, 'orders.assign') or public.user_has_permission(p_workspace_id, 'orders.manage')) then
    raise exception 'insufficient_permission: orders.assign required';
  end if;

  for v_order in
    select o.id, o.order_number, o.brand_id, o.created_at
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.assigned_to is null
      and o.status not in ('CANCELLED', 'DELIVERED', 'RETURNED')
      and (o.last_auto_assignment_attempted_at is null or o.last_auto_assignment_attempted_at < now() - interval '2 minutes')
    order by o.created_at asc
    limit p_limit
    for update skip locked
  loop
    -- Same brand-specific-beats-workspace-wide precedence resolve_assignment() uses.
    select * into v_rule from public.assignment_rules
    where workspace_id = p_workspace_id and module = 'orders' and is_active and deleted_at is null
      and (brand_id = v_order.brand_id or brand_id is null)
    order by brand_id nulls last
    limit 1;

    if found and v_rule.strategy = 'manual' then
      update public.orders set last_auto_assignment_attempted_at = now(), last_auto_assignment_result = 'DISABLED_MANUAL_STRATEGY'
        where id = v_order.id;
      order_id := v_order.id; order_number := v_order.order_number; result := 'DISABLED_MANUAL_STRATEGY';
      assigned_to := null; assignment_reason := null; candidate_count := 0;
      return next;
      continue;
    end if;

    v_aging_minutes := coalesce(v_rule.aging_minutes, 20);
    if v_order.created_at > now() - (v_aging_minutes || ' minutes')::interval then
      -- Too young. Do not record an attempt — a real attempt should
      -- happen the moment it actually crosses the threshold, not be
      -- suppressed by this function's own retry cooldown.
      continue;
    end if;

    select count(distinct ur.user_id) into v_candidate_count
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = 'orders.assign'
    where ur.workspace_id = p_workspace_id
      and (ur.brand_id is null or ur.brand_id = v_order.brand_id);

    v_candidate := public.resolve_assignment(p_workspace_id, v_order.brand_id, 'orders');

    if v_candidate is not null then
      update public.orders
      set assigned_to = v_candidate,
          updated_by = null,
          assignment_source = 'AUTO',
          assignment_reason = coalesce(v_rule.strategy, 'least_workload') || ' — automatic assignment sweep',
          assignment_rule_id = v_rule.id,
          last_auto_assignment_attempted_at = now(),
          last_auto_assignment_result = 'ASSIGNED'
      where id = v_order.id;

      order_id := v_order.id; order_number := v_order.order_number; result := 'ASSIGNED';
      assigned_to := v_candidate; assignment_reason := coalesce(v_rule.strategy, 'least_workload'); candidate_count := v_candidate_count;
      return next;
    else
      if v_candidate_count = 0 then
        v_result := 'NO_PERMISSION_MATCH';
      else
        select exists (
          select 1
          from public.user_roles ur
          join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions perm on perm.id = rp.permission_id and perm.slug = 'orders.assign'
          left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
          where ur.workspace_id = p_workspace_id
            and (ur.brand_id is null or ur.brand_id = v_order.brand_id)
            and coalesce(sas.is_available_for_assignment, true)
            and coalesce(sas.auto_assignment_enabled, true)
        ) into v_available_exists;

        v_result := case when not v_available_exists then 'NO_AVAILABLE_STAFF' else 'ALL_STAFF_AT_CAPACITY' end;
      end if;

      update public.orders set last_auto_assignment_attempted_at = now(), last_auto_assignment_result = v_result
        where id = v_order.id;

      order_id := v_order.id; order_number := v_order.order_number; result := v_result;
      assigned_to := null; assignment_reason := null; candidate_count := v_candidate_count;
      return next;
    end if;
  end loop;

  return;
end;
$$;

comment on function public.run_auto_assignment_sweep(uuid, uuid, integer) is
  'The scheduled auto-assignment engine. Claims up to p_limit unassigned, non-terminal, sufficiently-aged orders with `for update skip locked` (safe under concurrent/overlapping invocations), resolves each via the hardened resolve_assignment(), and either assigns (assignment_source=AUTO) or records an honest last_auto_assignment_result reason — never a fabricated assignment. In production this must be invoked periodically by an external scheduler (Supabase Cron / pg_cron / a scheduled Edge Function) — see the deployment notes; a permission-gated manual "Run now" is also exposed in the Management Command Center for on-demand runs.';


-- ============================================================
-- PART G — get_workforce_ops_summary(): the Management Command
-- Center's operational-decision-making numbers. Every figure is
-- computed from real rows — no fabricated online-status, no fabricated
-- success rate when there is no attempt history yet (returned as null,
-- not zero, so the frontend can render an honest "not enough data"
-- state rather than a misleading 0%).
-- ============================================================
create or replace function public.get_workforce_ops_summary(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  unassigned_count bigint,
  orders_aging_over_threshold_count bigint,
  orders_without_eligible_staff_count bigint,
  orders_assigned_today_count bigint,
  active_staff_count bigint,
  available_staff_count bigint,
  staff_at_capacity_count bigint,
  assignment_success_rate_24h numeric,
  avg_assignment_time_seconds_24h numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_aging_minutes integer;
begin
  if not public.user_has_permission(p_workspace_id, 'operations.view') then
    raise exception 'insufficient_permission: operations.view required';
  end if;

  select coalesce(
    (select ar.aging_minutes from public.assignment_rules ar
      where ar.workspace_id = p_workspace_id and ar.module = 'orders' and ar.is_active and ar.deleted_at is null
        and (ar.brand_id = p_brand_id or ar.brand_id is null)
      order by ar.brand_id nulls last limit 1),
    20
  ) into v_aging_minutes;

  return query
  with unassigned as (
    select o.id, o.created_at, o.last_auto_assignment_result
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.assigned_to is null
      and o.status not in ('CANCELLED', 'DELIVERED', 'RETURNED')
  ),
  eligible_staff as (
    select distinct ur.user_id
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = 'orders.assign'
    where ur.workspace_id = p_workspace_id
      and (p_brand_id is null or ur.brand_id is null or ur.brand_id = p_brand_id)
  ),
  staff_state as (
    select
      es.user_id,
      coalesce(sas.is_available_for_assignment, true) and coalesce(sas.auto_assignment_enabled, true) as is_available,
      sas.max_active_orders,
      (select count(*) from public.orders oo where oo.assigned_to = es.user_id and oo.workspace_id = p_workspace_id
        and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and oo.deleted_at is null) as active_count
    from eligible_staff es
    left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = es.user_id
  ),
  attempts_24h as (
    select o.last_auto_assignment_result, o.last_auto_assignment_attempted_at, o.created_at
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.last_auto_assignment_attempted_at is not null
      and o.last_auto_assignment_attempted_at >= now() - interval '24 hours'
  )
  select
    (select count(*) from unassigned),
    (select count(*) from unassigned where created_at <= now() - (v_aging_minutes || ' minutes')::interval),
    (select count(*) from unassigned where last_auto_assignment_result is not null and last_auto_assignment_result <> 'ASSIGNED'),
    (select count(*) from public.order_events ev
      where ev.workspace_id = p_workspace_id and (p_brand_id is null or ev.brand_id = p_brand_id)
        and ev.event_type = 'ASSIGNED' and (ev.metadata ->> 'assigned_to') is not null
        and ev.created_at >= date_trunc('day', now())),
    (select count(*) from staff_state),
    (select count(*) from staff_state where is_available and (max_active_orders is null or active_count < max_active_orders)),
    (select count(*) from staff_state where max_active_orders is not null and active_count >= max_active_orders),
    (select case when count(*) = 0 then null else
      round(count(*) filter (where last_auto_assignment_result = 'ASSIGNED')::numeric / count(*) * 100, 1)
     end from attempts_24h),
    (select case when count(*) filter (where last_auto_assignment_result = 'ASSIGNED') = 0 then null else
      round(avg(extract(epoch from (last_auto_assignment_attempted_at - created_at))) filter (where last_auto_assignment_result = 'ASSIGNED'), 0)
     end from attempts_24h);
end;
$$;

comment on function public.get_workforce_ops_summary(uuid, uuid) is
  'Management Command Center workforce metrics. assignment_success_rate_24h/avg_assignment_time_seconds_24h are null (never a fabricated 0%/0s) when there have been no automatic-assignment attempts in the window. orders_without_eligible_staff_count counts only orders with a real, recorded failed attempt — never inferred.';


-- ============================================================
-- PART H — set_staff_assignment_settings() (management) and
-- set_my_assignment_availability() (self-service). Full-state RPCs
-- (no partial-update ambiguity around "clear the capacity cap" vs
-- "leave it unchanged") — the settings form always submits definite
-- values for every field it owns.
-- ============================================================
create or replace function public.set_staff_assignment_settings(
  p_workspace_id uuid,
  p_user_id uuid,
  p_is_available_for_assignment boolean,
  p_auto_assignment_enabled boolean,
  p_max_active_orders integer default null
)
returns public.staff_assignment_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_assignment_settings%rowtype;
begin
  if not public.user_has_permission(p_workspace_id, 'staff.manage') then
    raise exception 'insufficient_permission: staff.manage required';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and workspace_id = p_workspace_id) then
    raise exception 'That person is not a member of this workspace.';
  end if;

  insert into public.staff_assignment_settings (
    workspace_id, user_id, is_available_for_assignment, auto_assignment_enabled, max_active_orders, updated_by
  ) values (
    p_workspace_id, p_user_id, p_is_available_for_assignment, p_auto_assignment_enabled, p_max_active_orders, auth.uid()
  )
  on conflict (workspace_id, user_id) do update set
    is_available_for_assignment = excluded.is_available_for_assignment,
    auto_assignment_enabled = excluded.auto_assignment_enabled,
    max_active_orders = excluded.max_active_orders,
    updated_at = now(),
    updated_by = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.set_staff_assignment_settings(uuid, uuid, boolean, boolean, integer) is
  'staff.manage-gated. Sets a colleague''s assignment capacity/availability/auto-assignment opt-in. A null p_max_active_orders means unlimited (explicitly, not "leave unchanged" — the caller always submits the full current form state).';

create or replace function public.set_my_assignment_availability(p_workspace_id uuid, p_is_available_for_assignment boolean)
returns public.staff_assignment_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.staff_assignment_settings%rowtype;
begin
  if v_uid is null then
    raise exception 'insufficient_permission: must be signed in';
  end if;
  if not exists (select 1 from public.user_roles where user_id = v_uid and workspace_id = p_workspace_id) then
    raise exception 'insufficient_permission: not a member of this workspace';
  end if;

  insert into public.staff_assignment_settings (workspace_id, user_id, is_available_for_assignment, updated_by)
  values (p_workspace_id, v_uid, p_is_available_for_assignment, v_uid)
  on conflict (workspace_id, user_id) do update set
    is_available_for_assignment = excluded.is_available_for_assignment,
    updated_at = now(),
    updated_by = v_uid
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.set_my_assignment_availability(uuid, boolean) is
  'Self-service "available for new assignments" toggle — any workspace member can set their own, no staff.manage required. Leaves max_active_orders/auto_assignment_enabled untouched (management-owned fields).';


-- ============================================================
-- PART I — extend get_workspace_staff() with the new capacity/
-- availability fields and a live active-order count, so the Staff
-- directory can show workload/availability without a second query
-- per row (Part 31: avoid N+1). Return-type change requires DROP.
-- ============================================================
drop function if exists public.get_workspace_staff(uuid);

create function public.get_workspace_staff(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  department text,
  status text,
  last_login_at timestamptz,
  created_at timestamptz,
  role_names text[],
  role_slugs text[],
  is_available_for_assignment boolean,
  auto_assignment_enabled boolean,
  max_active_orders integer,
  active_order_count bigint
)
language sql
stable
as $$
  select
    p.id, p.email, p.first_name, p.last_name, p.phone, p.avatar_url, p.department, p.status,
    p.last_login_at, p.created_at,
    array_agg(distinct r.name order by r.name),
    array_agg(distinct r.slug order by r.slug),
    coalesce(bool_and(coalesce(sas.is_available_for_assignment, true)), true),
    coalesce(bool_and(coalesce(sas.auto_assignment_enabled, true)), true),
    max(sas.max_active_orders),
    (select count(*) from public.orders oo where oo.assigned_to = p.id and oo.workspace_id = p_workspace_id
      and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED') and oo.deleted_at is null)
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  join public.roles r on r.id = ur.role_id
  left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = p.id
  where ur.workspace_id = p_workspace_id
    and p.deleted_at is null
    and (public.user_has_permission(p_workspace_id, 'staff.view') or public.user_has_permission(p_workspace_id, 'staff.manage'))
  group by p.id, p.email, p.first_name, p.last_name, p.phone, p.avatar_url, p.department, p.status, p.last_login_at, p.created_at;
$$;

comment on function public.get_workspace_staff(uuid) is
  'Full Staff directory, now including assignment capacity/availability and a live active-order count (0038) alongside the existing profile/role fields. Explicitly gated on staff.view/staff.manage — a caller lacking both gets zero rows.';


-- ============================================================
-- PART J — notify eligible staff when a new unassigned order appears
-- (Part 11 of the brief), and extend log_order_event() with nothing
-- else changed from 0037's version. One row per eligible, available
-- recipient (never a workspace broadcast — those are NOT permission-
-- filtered on read, confirmed in 0007) so Finance/Marketing/etc. never
-- see an operational "new order" alert they have no reason to act on.
-- Capped at 50 recipients as a defensive bound, not because any real
-- COD ops team is expected to approach it.
-- ============================================================
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

    if new.assigned_to is null then
      insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
      select
        new.workspace_id, new.brand_id, ur.user_id, 'new_order_available', 'New order available',
        'Order ' || new.order_number || ' (' || new.customer_name || ') is unassigned and ready to work.',
        case when new.priority in ('high', 'urgent') then new.priority else 'normal' end,
        '/orders/' || new.id, jsonb_build_object('order_id', new.id)
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = 'orders.assign'
      left join public.staff_assignment_settings sas on sas.workspace_id = new.workspace_id and sas.user_id = ur.user_id
      where ur.workspace_id = new.workspace_id
        and (ur.brand_id is null or ur.brand_id = new.brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and ur.user_id is distinct from new.created_by
      limit 50;
    end if;

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

    -- New assignee: "New order assigned to you" — never notify someone
    -- assigning the order to themselves.
    if new.assigned_to is not null and new.assigned_to is distinct from new.updated_by then
      insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
      values (
        new.workspace_id, new.brand_id, new.assigned_to, 'order_assigned', 'New order assigned to you',
        'Order ' || new.order_number || ' (' || new.customer_name || ') was assigned to you.',
        case when new.priority in ('high', 'urgent') then new.priority else 'normal' end,
        '/orders/' || new.id, jsonb_build_object('order_id', new.id)
      );
    end if;

    -- Previous assignee: "Order reassigned away from you" — only when
    -- handed to someone else (not simply unassigned to nobody, and
    -- never when the actor is reassigning their own order away).
    if old.assigned_to is not null and old.assigned_to is distinct from new.assigned_to
       and new.assigned_to is not null and old.assigned_to is distinct from new.updated_by then
      insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
      values (
        new.workspace_id, new.brand_id, old.assigned_to, 'order_reassigned', 'Order reassigned away from you',
        'Order ' || new.order_number || ' (' || new.customer_name || ') was reassigned to another staff member.',
        'normal', '/orders/' || new.id, jsonb_build_object('order_id', new.id)
      );
    end if;
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

  if new.cash_collection_status is distinct from old.cash_collection_status and new.cash_collection_status = 'collected' then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
    values (
      new.id, new.workspace_id, new.brand_id, 'CASH_COLLECTED',
      'Cash collected: ' || new.cash_collected_amount,
      jsonb_build_object('amount', new.cash_collected_amount), new.updated_by
    );
  end if;

  return new;
end;
$$;

comment on function public.log_order_event() is
  'Order timeline + assignment-notification trigger. Extended in 0038 to notify eligible, available orders.assign-holding staff when a new unassigned order is created (per-recipient inserts, never a workspace broadcast, since broadcast notifications are not permission-filtered on read). Everything else unchanged from 0037.';
