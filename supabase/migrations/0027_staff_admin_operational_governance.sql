-- ============================================================
-- GCOS PHASE 7 — Staff, RBAC, Workspace & Operational
-- Administration.
--
-- Per the Phase 7 brief's own Part 19 ("inspect before creating"):
-- Staff directory/detail, invitations (create/revoke/accept with
-- hashed tokens + expiry), Roles/permission-matrix/system-role
-- protection, Workspace settings, Brand settings (incl. every
-- requested Meta Pixel/CAPI/GTM/Clarity field), and the Audit Log
-- viewer are ALL ALREADY FULLY BUILT (Phase 5, migration 0023) and
-- are NOT touched here beyond the narrow, explicitly-justified
-- additions below. This migration adds only what a careful audit
-- of the existing schema/RLS/RPCs confirmed does not already exist:
--
--   Part A — two new permission modules (assignment_rules,
--            approval_rules) + role grants.
--   Part B — assignment_rules: a configuration foundation for
--            staff-assignment strategy (manual/round_robin/
--            least_workload/fixed) per module/brand. NOT wired into
--            create_order()/create_order_task() — per the brief's
--            own Part 9 ("do not implement complex automation") and
--            Part 29 ("no scope creep: automation/event engine
--            belongs to a later phase"), this is deliberately
--            configuration-only, ready for that future engine to
--            read. Manual assignment (existing Assign-to-me/picker
--            UI, untouched) remains the only thing that actually
--            runs today.
--   Part C — approval_rules: same posture for approval thresholds
--            on orders/affiliates/withdrawals/ad_costs — the four
--            modules that already have a real `*.approve` permission
--            slug. Configuration only; the existing direct-approve
--            RPCs (approve_affiliate, etc.) are NOT modified to
--            enforce these thresholds, which would be a much larger,
--            riskier change touching Phase 4/6 approval flows well
--            outside an administration-layer phase.
--   Part D — set_staff_status(): profiles.status changes (activate/
--            deactivate/suspend) currently write NO audit_logs row
--            at all (confirmed: no trigger exists on public.profiles
--            besides the owner-protection guard and set_updated_at)
--            and support only active/inactive from the frontend, not
--            the 'suspended' state the brief's Part 1 explicitly asks
--            for. This RPC is a properly-audited, properly-notified,
--            workspace-scoped write path for all three reachable
--            states, added ALONGSIDE the existing direct-UPDATE RLS
--            policy (0023's update_workspace_staff_profiles is left
--            completely in place) — the frontend is switched to use
--            it, but nothing that depended on the old path breaks.
--   Part E — get_workspace_staff() gains `phone` in its return set
--            (the column already exists on profiles and the brief's
--            Part 1 explicitly asks for it in the Staff directory;
--            it was simply never selected).
-- ============================================================


-- ---------------------------------------------------------------
-- PART A — permission catalogue.
-- ---------------------------------------------------------------
insert into public.permissions (module, action, slug, category, description) values
  ('assignment_rules', 'view', 'assignment_rules.view', 'Assignment Rules', 'View staff-assignment rule configuration'),
  ('assignment_rules', 'manage', 'assignment_rules.manage', 'Assignment Rules', 'Create/edit/archive staff-assignment rules'),
  ('approval_rules', 'view', 'approval_rules.view', 'Approval Rules', 'View approval-rule configuration'),
  ('approval_rules', 'manage', 'approval_rules.manage', 'Approval Rules', 'Create/edit/archive approval rules')
on conflict (slug) do nothing;

-- Owner/Admin — explicit grant (their 0008 cross-join predates these
-- rows, same recurring fix every prior phase has needed).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug in ('owner', 'admin')
  and p.module in ('assignment_rules', 'approval_rules')
on conflict do nothing;

-- Manager: visibility only. Configuring workspace-wide assignment/
-- approval policy is an Owner/Admin decision, not day-to-day
-- operations — consistent with Manager never holding a `*.manage`
-- slug anywhere in the existing catalogue.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and p.slug in ('assignment_rules.view', 'approval_rules.view')
on conflict do nothing;

-- Finance: full authority over approval rules — they already hold
-- withdrawals.* and ad_costs.approve/manage (0024: "the payout-
-- approval authority in this workspace"), so owning the thresholds
-- that gate those same actions is a direct extension of that
-- existing authority. Assignment rules are operational, not
-- Finance's domain — view only.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'finance'
  and (p.module = 'approval_rules' or p.slug = 'assignment_rules.view')
on conflict do nothing;

-- Viewer: read-only, matching its existing blanket "every .view slug"
-- convention.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer'
  and p.slug in ('assignment_rules.view', 'approval_rules.view')
on conflict do nothing;

-- Customer Support, Warehouse Staff, Marketing, Affiliate Manager get
-- nothing from either module — deliberate, matching the same "no
-- reach into workspace-level configuration" boundary those roles
-- already have for staff/roles_permissions/workspace/brands (0008).


-- ---------------------------------------------------------------
-- PART B — assignment_rules.
-- ---------------------------------------------------------------
create table public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  module text not null check (module in ('orders', 'tasks')),
  strategy text not null check (strategy in ('manual', 'round_robin', 'least_workload', 'fixed')),
  fixed_staff_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.assignment_rules is
  'Configuration foundation for staff-assignment strategy per module/brand. module is deliberately limited to orders/tasks — the only two entities with a real staff-assignable column (orders.assigned_to, order_tasks.assigned_to) today; waybills/warehouse have no such column yet, so no rule surface pretends to configure one. NOT consumed by create_order()/create_order_task()/assign_order_task() — manual assignment (Assign to me / staff picker) is still the only thing that runs; this table is what a future automation/event engine would read.';

-- One active rule per (workspace, brand-or-all-brands, module) — a
-- brand-null row means "applies to every brand in the workspace
-- unless a brand-specific rule overrides it," so both scopes must
-- each be unambiguous on their own.
create unique index assignment_rules_active_scope_idx on public.assignment_rules
  (workspace_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), module)
  where is_active and deleted_at is null;
create index assignment_rules_workspace_id_idx on public.assignment_rules (workspace_id);

alter table public.assignment_rules enable row level security;

create policy "select_assignment_rules" on public.assignment_rules
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'assignment_rules.view')
  );

create policy "manage_assignment_rules" on public.assignment_rules
  for all to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'assignment_rules.manage')
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'assignment_rules.manage')
  );

create trigger set_assignment_rules_updated_at
  before update on public.assignment_rules
  for each row execute function public.set_updated_at();

-- Scope guard: a brand_id must actually belong to workspace_id, a
-- 'fixed' strategy must name at least one staff member, and every
-- named staff member must genuinely hold a role in this workspace —
-- "the assignment engine must never assign a user outside the
-- workspace or brand scope" enforced server-side, not just by a
-- picker that happens to be pre-filtered.
create or replace function public.guard_assignment_rule_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_workspace uuid;
  v_bad_staff uuid;
begin
  if new.brand_id is not null then
    select workspace_id into v_brand_workspace from public.brands where id = new.brand_id;
    if v_brand_workspace is distinct from new.workspace_id then
      raise exception 'brand_id must belong to workspace_id';
    end if;
  end if;

  if new.strategy = 'fixed' and coalesce(array_length(new.fixed_staff_ids, 1), 0) = 0 then
    raise exception 'strategy=fixed requires at least one entry in fixed_staff_ids';
  end if;

  if coalesce(array_length(new.fixed_staff_ids, 1), 0) > 0 then
    select s into v_bad_staff
    from unnest(new.fixed_staff_ids) as s
    where not exists (select 1 from public.user_roles ur where ur.workspace_id = new.workspace_id and ur.user_id = s)
    limit 1;
    if v_bad_staff is not null then
      raise exception 'fixed_staff_ids contains a user with no role in this workspace: %', v_bad_staff;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_assignment_rules_scope
  before insert or update on public.assignment_rules
  for each row execute function public.guard_assignment_rule_scope();

create trigger audit_assignment_rules
  after insert or update on public.assignment_rules
  for each row execute function public.log_ops_audit_event('assignment_rules');

create or replace function public.notify_assignment_rule_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' or (old.strategy is distinct from new.strategy or old.is_active is distinct from new.is_active or old.fixed_staff_ids is distinct from new.fixed_staff_ids) then
    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata, created_by)
    values (
      new.workspace_id, new.brand_id, null, 'assignment_rule_changed', 'Assignment rule updated',
      initcap(new.module) || ' assignment strategy set to ' || replace(new.strategy, '_', ' ') || (case when new.is_active then '' else ' (inactive)' end),
      'normal', '/settings/assignment-rules', jsonb_build_object('rule_id', new.id, 'module', new.module, 'strategy', new.strategy), auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger notify_assignment_rules_change
  after insert or update on public.assignment_rules
  for each row execute function public.notify_assignment_rule_changed();


-- ---------------------------------------------------------------
-- PART C — approval_rules.
-- ---------------------------------------------------------------
create table public.approval_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  module text not null check (module in ('orders', 'affiliates', 'withdrawals', 'ad_costs')),
  action text not null default 'approve',
  threshold_amount numeric(14, 2),
  required_approver_role_id uuid references public.roles (id),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  constraint approval_rules_threshold_nonneg check (threshold_amount is null or threshold_amount >= 0)
);

comment on table public.approval_rules is
  'Configuration foundation for approval thresholds/required-approver policy. module is limited to orders/affiliates/withdrawals/ad_costs — the only four modules with a real *.approve permission slug in the existing catalogue. Deliberately NOT wired into the existing direct-approve RPCs (which remain untouched, single-step, permission-gated exactly as before) — enforcing these thresholds at the approval call sites is a materially larger change to already-shipped Phase 4/6 flows and is out of scope for an administration-layer phase. This is the config surface; enforcement is a documented follow-up.';

create unique index approval_rules_active_scope_idx on public.approval_rules
  (workspace_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), module)
  where is_active and deleted_at is null;
create index approval_rules_workspace_id_idx on public.approval_rules (workspace_id);

alter table public.approval_rules enable row level security;

create policy "select_approval_rules" on public.approval_rules
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'approval_rules.view')
  );

create policy "manage_approval_rules" on public.approval_rules
  for all to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'approval_rules.manage')
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'approval_rules.manage')
  );

create trigger set_approval_rules_updated_at
  before update on public.approval_rules
  for each row execute function public.set_updated_at();

create or replace function public.guard_approval_rule_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_workspace uuid;
  v_role_workspace uuid;
  v_role_deleted timestamptz;
  v_role_found boolean;
begin
  if new.brand_id is not null then
    select workspace_id into v_brand_workspace from public.brands where id = new.brand_id;
    if v_brand_workspace is distinct from new.workspace_id then
      raise exception 'brand_id must belong to workspace_id';
    end if;
  end if;

  if new.required_approver_role_id is not null then
    select true, workspace_id, deleted_at into v_role_found, v_role_workspace, v_role_deleted
    from public.roles where id = new.required_approver_role_id;
    if not coalesce(v_role_found, false) or v_role_deleted is not null then
      raise exception 'required_approver_role_id does not reference a live role';
    end if;
    if v_role_workspace is not null and v_role_workspace is distinct from new.workspace_id then
      raise exception 'required_approver_role_id must be a system role or a role belonging to workspace_id';
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_approval_rules_scope
  before insert or update on public.approval_rules
  for each row execute function public.guard_approval_rule_scope();

create trigger audit_approval_rules
  after insert or update on public.approval_rules
  for each row execute function public.log_ops_audit_event('approval_rules');

create or replace function public.notify_approval_rule_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' or (old.threshold_amount is distinct from new.threshold_amount or old.is_active is distinct from new.is_active or old.required_approver_role_id is distinct from new.required_approver_role_id) then
    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata, created_by)
    values (
      new.workspace_id, new.brand_id, null, 'approval_rule_changed', 'Approval rule updated',
      initcap(new.module) || ' ' || new.action || ' rule ' ||
        (case when new.threshold_amount is not null then 'threshold set to ' || new.threshold_amount else 'has no amount threshold' end) ||
        (case when new.is_active then '' else ' (inactive)' end),
      'normal', '/settings/approval-rules', jsonb_build_object('rule_id', new.id, 'module', new.module, 'threshold_amount', new.threshold_amount), auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger notify_approval_rules_change
  after insert or update on public.approval_rules
  for each row execute function public.notify_approval_rule_changed();


-- ---------------------------------------------------------------
-- PART D — set_staff_status(): the first properly-audited,
-- properly-notified write path for profiles.status. The existing
-- update_workspace_staff_profiles RLS policy (0023) is left exactly
-- as-is — this is an additional, better path, not a replacement of
-- the RLS boundary itself. guard_last_owner_deactivation() (0023)
-- still fires on the UPDATE this RPC performs, unmodified.
-- ---------------------------------------------------------------
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
  end if;

  return v_profile;
end;
$$;

comment on function public.set_staff_status(uuid, uuid, text) is
  'The audited/notified path for staff.manage holders to activate/deactivate/suspend a workspace member. Runs through the exact same profiles.status column and guard_last_owner_deactivation() trigger (0023) as the pre-existing direct-UPDATE RLS path — that policy is untouched, this is just the path the frontend now uses so the change is actually recorded.';


-- ---------------------------------------------------------------
-- PART E — get_workspace_staff(): add `phone` (column already
-- existed on profiles, simply never selected). Return-type change
-- requires DROP + CREATE, not CREATE OR REPLACE.
-- ---------------------------------------------------------------
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
  role_slugs text[]
)
language sql
stable
as $$
  select
    p.id, p.email, p.first_name, p.last_name, p.phone, p.avatar_url, p.department, p.status,
    p.last_login_at, p.created_at,
    array_agg(distinct r.name order by r.name),
    array_agg(distinct r.slug order by r.slug)
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  join public.roles r on r.id = ur.role_id
  where ur.workspace_id = p_workspace_id
    and p.deleted_at is null
    and (public.user_has_permission(p_workspace_id, 'staff.view') or public.user_has_permission(p_workspace_id, 'staff.manage'))
  group by p.id, p.email, p.first_name, p.last_name, p.phone, p.avatar_url, p.department, p.status, p.last_login_at, p.created_at;
$$;

comment on function public.get_workspace_staff(uuid) is
  'Full Staff directory: distinct staff in a workspace with aggregated role names/slugs, now including phone. Explicitly gated on staff.view/staff.manage — a caller lacking both gets zero rows.';


-- ---------------------------------------------------------------
-- PART F — close a real authorization gap surfaced while building
-- Part D/Part 17's explicit authorization review: user_has_permission()
-- and user_workspace_ids() — the two functions every RLS policy and
-- every SECURITY DEFINER RPC in the ENTIRE system is built on — never
-- checked the caller's own profiles.status. A suspended or deactivated
-- staff member's user_roles grants stayed fully functional at the
-- database layer for as long as their Supabase session/JWT remained
-- valid; only get_assignable_staff() (0023) happened to filter
-- status='active', and only for the picker it serves, not as a general
-- boundary. This was a real gap, not a hypothetical one — Part 24's
-- test #11 ("suspended/deactivated staff cannot access protected
-- workspace data") could not actually pass against the pre-existing
-- code. Hardening these two shared primitives closes it everywhere at
-- once, with no new authorization model and no per-module changes.
-- Fixture users in every existing regression test default to
-- profiles.status='active' (the table's own default) and are never
-- explicitly deactivated mid-test, so this is not expected to change
-- any existing test's outcome — verified by re-running the full
-- 101-106 suite after this change.
-- ---------------------------------------------------------------
create or replace function public.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct ur.workspace_id
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid()
    and p.status = 'active'
    and p.deleted_at is null;
$$;

comment on function public.user_workspace_ids() is
  'Workspace IDs the current authenticated user belongs to AND is active in — a suspended/inactive/deleted profile resolves to zero workspaces here, which cascades through every RLS policy built on this function. Core building block for workspace-isolation RLS policies.';

create or replace function public.user_has_permission(p_workspace_id uuid, p_permission_slug text)
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
    where ur.user_id = auth.uid()
      and ur.workspace_id = p_workspace_id
      and p.slug = p_permission_slug
      and pr.status = 'active'
      and pr.deleted_at is null
  );
$$;

comment on function public.user_has_permission(uuid, text) is
  'Whether the current authenticated user holds p_permission_slug in p_workspace_id AND their own profile is active/non-deleted — every RLS policy and SECURITY DEFINER RPC in the system is built on this function, so suspending/deactivating a staff member (set_staff_status) now takes effect everywhere immediately, not just in the frontend UI.';
