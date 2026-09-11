-- ============================================================
-- GOLDEN COMMERCE OS — Organization + Staff + RBAC (0023)
--
-- Phase 5 builds no parallel membership/authorization system —
-- workspaces/brands/profiles/roles/permissions/role_permissions/
-- user_roles/notifications/audit_logs already exist from the
-- Foundation phase (0002/0003/0005/0007) and already carry full RLS.
-- This migration only adds what that foundation genuinely lacks:
--
--   1. get_effective_permissions() — the single RPC the real
--      PermissionsContext reads (replacing the mock "Owner, every
--      permission" implementation).
--   2. get_workspace_staff() — distinct staff + aggregated role
--      names for a workspace, used by the Staff module and the
--      Order assignment picker alike.
--   3. Owner-protection triggers — a workspace can never be left
--      without at least one active Owner, enforced at the database
--      layer, not by hiding a button.
--   4. System-role protection triggers — is_system_role roles and
--      their permission grants cannot be edited/archived from the
--      client, backend-enforced.
--   5. staff_invitations — real, database-backed invitation state
--      with cryptographically hashed, single-use, expiring tokens.
--      No email is sent by this migration or the app it backs; see
--      the Phase 5 delivery report for exactly what that means.
--   6. Audit coverage for workspaces/brands/user_roles (role grants/
--      revocations, workspace/brand configuration changes) — these
--      three tables had no audit trigger at all before this phase.
--   7. A hardened audit_logs INSERT policy: only the SECURITY
--      DEFINER audit trigger may write audit rows now, not any
--      authenticated client directly.
--   8. Indexes supporting the new Staff/Notifications/Audit Log
--      screens' common query shapes.
-- ============================================================


-- ---------------------------------------------------------------
-- 1. get_effective_permissions() — replaces the mock "Owner sees
-- everything" PermissionsContext. LEFT JOINs role_permissions so a
-- role with zero permissions still appears once (permission_slug
-- null) — the frontend needs the full role list for display (e.g.
-- the ProfileMenu role badge) even when a role happens to grant
-- nothing yet.
-- ---------------------------------------------------------------
create or replace function public.get_effective_permissions(p_workspace_id uuid)
returns table (
  role_id uuid,
  role_name text,
  role_slug text,
  is_system_role boolean,
  permission_slug text
)
language sql
stable
as $$
  select distinct r.id, r.name, r.slug, r.is_system_role, p.slug
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  left join public.role_permissions rp on rp.role_id = r.id
  left join public.permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and ur.workspace_id = p_workspace_id;
$$;

comment on function public.get_effective_permissions(uuid) is
  'Every role the current user holds in p_workspace_id, and every permission slug those roles grant (distinct, one row per role/permission pair; a role with no permissions yet still appears once with permission_slug null). The sole source of truth for PermissionsContext — never hardcode "Owner = everything" client-side again.';


-- ---------------------------------------------------------------
-- 2. get_workspace_staff() — the full Staff directory: distinct
-- staff for a workspace with aggregated role names/slugs. Explicitly
-- gated on staff.view/staff.manage (added to the WHERE clause, not
-- just relying on profiles' broader "co-workers can see each other"
-- RLS) — a workspace member without staff.view must get zero rows
-- here, even though profiles RLS alone would let them read individual
-- profile rows. See get_assignable_staff() below for the narrower,
-- orders.assign-gated picker used outside the Staff module.
-- ---------------------------------------------------------------
create or replace function public.get_workspace_staff(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
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
    p.id, p.email, p.first_name, p.last_name, p.avatar_url, p.department, p.status,
    p.last_login_at, p.created_at,
    array_agg(distinct r.name order by r.name),
    array_agg(distinct r.slug order by r.slug)
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  join public.roles r on r.id = ur.role_id
  where ur.workspace_id = p_workspace_id
    and p.deleted_at is null
    and (public.user_has_permission(p_workspace_id, 'staff.view') or public.user_has_permission(p_workspace_id, 'staff.manage'))
  group by p.id, p.email, p.first_name, p.last_name, p.avatar_url, p.department, p.status, p.last_login_at, p.created_at;
$$;

comment on function public.get_workspace_staff(uuid) is
  'Full Staff directory: distinct staff in a workspace with aggregated role names/slugs. Explicitly gated on staff.view/staff.manage — a caller lacking both gets zero rows.';


-- ---------------------------------------------------------------
-- get_assignable_staff() — a deliberately narrower sibling for the
-- Order assignment picker. Gated on orders.assign rather than
-- staff.view, because a role like Customer Support (orders.assign,
-- no staff.view in the seeded catalogue) still needs to be able to
-- assign orders to teammates without seeing the full Staff module.
-- Only active staff — historical assignments to since-deactivated
-- staff remain visible on the order itself via the existing FK, they
-- just aren't offered as a new assignment target.
-- ---------------------------------------------------------------
create or replace function public.get_assignable_staff(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text
)
language sql
stable
as $$
  select distinct p.id, p.email, p.first_name, p.last_name
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.workspace_id = p_workspace_id
    and p.status = 'active'
    and p.deleted_at is null
    and (
      public.user_has_permission(p_workspace_id, 'orders.assign')
      or public.user_has_permission(p_workspace_id, 'staff.view')
      or public.user_has_permission(p_workspace_id, 'staff.manage')
    )
  order by p.first_name, p.last_name;
$$;

comment on function public.get_assignable_staff(uuid) is
  'Active staff eligible to be assigned an order, gated on orders.assign (not staff.view) so operational roles like Customer Support can use the picker without full Staff-module access.';


-- ---------------------------------------------------------------
-- 3. Owner protection. "Owner" is identified by roles.slug = 'owner'
-- (the seeded system template, workspace_id is null, referenced
-- directly by user_roles rows scoped per-workspace) rather than by
-- role_id, so this also covers the (currently unused) possibility of
-- a workspace-cloned role that reuses the 'owner' slug.
-- ---------------------------------------------------------------
create or replace function public.guard_last_owner_removal()
returns trigger
language plpgsql
as $$
declare
  v_role_slug text;
  v_workspace_id uuid;
  v_remaining int;
begin
  select slug into v_role_slug from public.roles where id = old.role_id;
  if v_role_slug is distinct from 'owner' then
    return old;
  end if;
  v_workspace_id := old.workspace_id;

  select count(*) into v_remaining
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.slug = 'owner'
  where ur.workspace_id = v_workspace_id and ur.id <> old.id;

  if v_remaining = 0 then
    raise exception 'Cannot remove the last Owner from this workspace. Assign another Owner first.';
  end if;

  return old;
end;
$$;

comment on function public.guard_last_owner_removal() is
  'Blocks deleting (or, via the UPDATE trigger, reassigning away) the last remaining Owner grant in a workspace. Backend-enforced, not just a hidden button.';

create trigger guard_user_roles_owner_delete
  before delete on public.user_roles
  for each row execute function public.guard_last_owner_removal();

create trigger guard_user_roles_owner_reassign
  before update of role_id on public.user_roles
  for each row
  when (old.role_id is distinct from new.role_id)
  execute function public.guard_last_owner_removal();


create or replace function public.guard_last_owner_deactivation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'active' and new.status in ('inactive', 'suspended') then
    if exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.slug = 'owner'
      where ur.user_id = old.id
        and not exists (
          select 1
          from public.user_roles ur2
          join public.roles r2 on r2.id = ur2.role_id and r2.slug = 'owner'
          join public.profiles p2 on p2.id = ur2.user_id and p2.status = 'active' and p2.deleted_at is null
          where ur2.workspace_id = ur.workspace_id and ur2.user_id <> old.id
        )
    ) then
      raise exception 'Cannot deactivate the last active Owner of a workspace. Assign or activate another Owner first.';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.guard_last_owner_deactivation() is
  'Blocks setting a profile to inactive/suspended if doing so would leave any of their workspaces with zero active Owners.';

create trigger guard_profiles_owner_deactivation
  before update of status on public.profiles
  for each row
  when (old.status is distinct from new.status)
  execute function public.guard_last_owner_deactivation();


-- ---------------------------------------------------------------
-- 4. System-role protection. is_system_role rows (the seeded
-- Owner/Admin/Manager/... templates) cannot have their identity or
-- permission grants edited from the client at all — UI never even
-- exposes the controls, but this is the actual enforcement.
-- ---------------------------------------------------------------
create or replace function public.guard_system_role_identity()
returns trigger
language plpgsql
as $$
begin
  if old.is_system_role and (new.name is distinct from old.name or new.slug is distinct from old.slug or new.is_system_role is distinct from old.is_system_role) then
    raise exception 'System roles cannot be renamed or converted to custom roles.';
  end if;
  if old.is_system_role and new.deleted_at is not null and old.deleted_at is null then
    raise exception 'System roles cannot be archived.';
  end if;
  return new;
end;
$$;

create trigger guard_roles_system_identity
  before update on public.roles
  for each row execute function public.guard_system_role_identity();


create or replace function public.guard_custom_role_archive()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (select 1 from public.user_roles where role_id = old.id) then
      raise exception 'Cannot archive a role that is still assigned to staff. Reassign them first.';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_roles_custom_archive
  before update of deleted_at on public.roles
  for each row
  when (new.deleted_at is distinct from old.deleted_at)
  execute function public.guard_custom_role_archive();


create or replace function public.guard_system_role_permissions()
returns trigger
language plpgsql
as $$
declare
  v_role_id uuid := coalesce(new.role_id, old.role_id);
  v_is_system boolean;
begin
  select is_system_role into v_is_system from public.roles where id = v_role_id;
  if v_is_system then
    raise exception 'System role permissions cannot be modified. Duplicate the role to customize its permissions.';
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.guard_system_role_permissions() is
  'Prevents any INSERT/DELETE against role_permissions for an is_system_role role, protecting the seeded Owner/Admin/.../Viewer templates from accidental (or malicious) permission tampering.';

create trigger guard_role_permissions_system_insert
  before insert on public.role_permissions
  for each row execute function public.guard_system_role_permissions();

create trigger guard_role_permissions_system_delete
  before delete on public.role_permissions
  for each row execute function public.guard_system_role_permissions();


-- ---------------------------------------------------------------
-- 5. staff_invitations. No client insert/update/delete policy at
-- all — every mutation goes through a SECURITY DEFINER RPC below,
-- mirroring the create_order()/create_customer() convention. Only
-- a sha256 hash of the token is ever stored; the raw token is
-- returned exactly once, at creation, for the caller to share
-- through whatever channel they choose (no email is sent here).
-- ---------------------------------------------------------------
create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  email text not null,
  role_id uuid not null references public.roles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.staff_invitations is
  'Database-backed staff invitation state. token_hash is sha256(raw token) — the raw token is returned once by create_staff_invitation() and never stored. No email delivery is implemented; the raw token/link must be shared manually by whoever created the invitation.';

create index staff_invitations_workspace_id_idx on public.staff_invitations (workspace_id);
create index staff_invitations_email_idx on public.staff_invitations (email);
create index staff_invitations_status_idx on public.staff_invitations (status);

alter table public.staff_invitations enable row level security;

create policy "select_staff_invitations" on public.staff_invitations
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'staff.view') or public.user_has_permission(workspace_id, 'staff.manage'))
  );


create or replace function public.create_staff_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role_id uuid,
  p_brand_id uuid default null
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_role_workspace uuid;
  v_token text;
  v_token_hash text;
  v_id uuid;
  v_expires timestamptz;
begin
  if not (public.user_has_permission(p_workspace_id, 'staff.create') or public.user_has_permission(p_workspace_id, 'staff.manage')) then
    raise exception 'insufficient_permission: staff.create required';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required';
  end if;

  select r.workspace_id into v_role_workspace from public.roles r where r.id = p_role_id and r.deleted_at is null;
  if not found then
    raise exception 'Role not found';
  end if;
  if v_role_workspace is not null and v_role_workspace <> p_workspace_id then
    raise exception 'That role does not belong to this workspace';
  end if;

  if exists (
    select 1 from public.staff_invitations si
    where si.workspace_id = p_workspace_id and si.email = v_email and si.status = 'pending' and si.expires_at > now()
  ) then
    raise exception 'invitation_already_pending: % already has a pending invitation to this workspace', v_email;
  end if;

  if exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.workspace_id = p_workspace_id and lower(p.email) = v_email
  ) then
    raise exception 'already_a_member: % is already a member of this workspace', v_email;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '7 days';

  insert into public.staff_invitations (workspace_id, brand_id, email, role_id, token_hash, expires_at, invited_by)
  values (p_workspace_id, p_brand_id, v_email, p_role_id, v_token_hash, v_expires, auth.uid())
  returning staff_invitations.id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

comment on function public.create_staff_invitation(uuid, text, uuid, uuid) is
  'Creates a pending staff invitation and returns the raw token exactly once. The caller is responsible for sharing the resulting /invitations/accept?token=... link — no email is sent by this function.';


create or replace function public.revoke_staff_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.staff_invitations where id = p_id;
  if not found then
    raise exception 'Invitation not found';
  end if;
  if not (public.user_has_permission(v_workspace_id, 'staff.delete') or public.user_has_permission(v_workspace_id, 'staff.manage')) then
    raise exception 'insufficient_permission: staff.manage required';
  end if;

  update public.staff_invitations set status = 'revoked' where id = p_id and status = 'pending';
end;
$$;


create or replace function public.accept_staff_invitation(p_token text)
returns public.user_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
  v_invite public.staff_invitations%rowtype;
  v_user_email text;
  v_grant public.user_roles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept an invitation';
  end if;

  select * into v_invite from public.staff_invitations where token_hash = v_hash;
  if not found then
    raise exception 'invalid_invitation: this invitation link is not valid';
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'invitation_revoked: this invitation has been revoked';
  end if;
  if v_invite.status = 'accepted' then
    raise exception 'invitation_already_used: this invitation has already been accepted';
  end if;
  if v_invite.expires_at < now() then
    update public.staff_invitations set status = 'expired' where id = v_invite.id and status = 'pending';
    raise exception 'invitation_expired: this invitation has expired. Ask an admin to send a new one.';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> v_invite.email then
    raise exception 'email_mismatch: this invitation was sent to a different email address';
  end if;

  insert into public.user_roles (user_id, role_id, workspace_id, brand_id, created_by)
  values (auth.uid(), v_invite.role_id, v_invite.workspace_id, v_invite.brand_id, v_invite.invited_by)
  on conflict (user_id, role_id, workspace_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'))
    do nothing
  returning * into v_grant;

  if not found then
    select * into v_grant from public.user_roles
      where user_id = auth.uid() and role_id = v_invite.role_id and workspace_id = v_invite.workspace_id
        and coalesce(brand_id, '00000000-0000-0000-0000-000000000000') = coalesce(v_invite.brand_id, '00000000-0000-0000-0000-000000000000');
  end if;

  update public.staff_invitations
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;

  return v_grant;
end;
$$;

comment on function public.accept_staff_invitation(text) is
  'Redeems a pending, unexpired invitation for the CURRENTLY AUTHENTICATED user, provided their auth email matches the invitation. Requires the invitee to already have (or create, outside this function) a GCOS account — this function does not create auth.users rows.';


-- ---------------------------------------------------------------
-- 6. Audit coverage for workspaces/brands/user_roles. Neither
-- generic log_audit_event() shape fits workspaces (no workspace_id/
-- brand_id columns of its own) or brands (no brand_id column of its
-- own — it IS the brand), so both get a small dedicated trigger
-- function instead of forcing a mismatched reuse. user_roles already
-- has workspace_id/brand_id/id, so it reuses the generic function
-- exactly like every other phase's tables.
-- ---------------------------------------------------------------
create or replace function public.log_workspace_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_id := new.id;
  elsif TG_OP = 'UPDATE' then
    v_action := case
      when new.status is distinct from old.status then 'status_change'
      else 'update'
    end;
    v_id := new.id;
  else
    v_action := 'delete';
    v_id := old.id;
  end if;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    v_id, null, auth.uid(), 'workspace', v_action, 'workspace', v_id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_workspaces
  after insert or update or delete on public.workspaces
  for each row execute function public.log_workspace_audit_event();


create or replace function public.log_brand_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_workspace_id uuid;
  v_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_workspace_id := new.workspace_id;
    v_id := new.id;
  elsif TG_OP = 'UPDATE' then
    v_action := case
      when new.status is distinct from old.status and new.status = 'active' then 'activate'
      when new.status is distinct from old.status and old.status = 'active' then 'deactivate'
      else 'update'
    end;
    v_workspace_id := new.workspace_id;
    v_id := new.id;
  else
    v_action := 'delete';
    v_workspace_id := old.workspace_id;
    v_id := old.id;
  end if;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    v_workspace_id, v_id, auth.uid(), 'brands', v_action, 'brand', v_id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_brands
  after insert or update or delete on public.brands
  for each row execute function public.log_brand_audit_event();

create trigger audit_user_roles
  after insert or delete on public.user_roles
  for each row execute function public.log_audit_event('staff');


-- ---------------------------------------------------------------
-- 7. Harden audit_logs: only the SECURITY DEFINER trigger function
-- may write rows now. Nothing in the application ever inserted into
-- audit_logs directly (verified against the current codebase) — the
-- broad "any authenticated workspace member can insert" policy from
-- 0007 was unused surface, not a relied-upon feature, so removing it
-- is additive hardening, not a behavior change.
-- ---------------------------------------------------------------
drop policy if exists "insert_audit_logs" on public.audit_logs;


-- ---------------------------------------------------------------
-- profiles had no policy at all letting an admin update a CO-WORKER's
-- profile (0007 only allows a user to update their own row) — meaning
-- "deactivate staff" / "edit department" had no legal write path.
-- Gated on staff.manage, scoped to a shared workspace, and explicitly
-- excludes self-updates (those already go through update_own_profile;
-- an admin managing their own status via this broader policy would
-- be a confusing double path).
-- ---------------------------------------------------------------
create policy "update_workspace_staff_profiles" on public.profiles
  for update to authenticated
  using (
    id <> auth.uid()
    and exists (
      select 1 from public.user_roles ur1
      join public.user_roles ur2 on ur2.workspace_id = ur1.workspace_id
      where ur1.user_id = auth.uid() and ur2.user_id = profiles.id
        and public.user_has_permission(ur1.workspace_id, 'staff.manage')
    )
  )
  with check (
    id <> auth.uid()
    and exists (
      select 1 from public.user_roles ur1
      join public.user_roles ur2 on ur2.workspace_id = ur1.workspace_id
      where ur1.user_id = auth.uid() and ur2.user_id = profiles.id
        and public.user_has_permission(ur1.workspace_id, 'staff.manage')
    )
  );


-- ---------------------------------------------------------------
-- Workspace-wide (user_id IS NULL) notifications had no UPDATE
-- policy at all — 0007 only let a user mark their OWN notifications
-- read. A broadcast notification is a single shared row (no per-user
-- read-receipt table, and this phase doesn't add one), so "read by
-- anyone marks it read for everyone" is the correct behavior given
-- that model, not a bug to route around.
-- ---------------------------------------------------------------
create policy "update_workspace_notifications" on public.notifications
  for update to authenticated
  using (user_id is null and workspace_id in (select public.user_workspace_ids()))
  with check (user_id is null and workspace_id in (select public.user_workspace_ids()));


-- ---------------------------------------------------------------
-- 9. SECURITY FIX (discovered during this phase's RLS review, per
-- the mandate to test "a user without finance.view cannot retrieve
-- finance data"): every Phase 4 finance/analytics RPC was
-- SECURITY INVOKER relying ONLY on orders.view via orders' own RLS —
-- it never checked finance.view at all. Customer Support and
-- Warehouse Staff both hold orders.view (needed for their normal
-- order-handling work) and so could already call
-- get_finance_summary()/get_product_performance()/etc. directly and
-- see real delivered revenue, COGS and gross profit despite having
-- no finance permission whatsoever. This is a genuine bug, not a
-- calculation change — fixing it is explicitly in scope.
--
-- All seven functions are shared by the Finance, Analytics and
-- Reports pages (confirmed against the actual frontend code), so the
-- correct gate is "holds view access to any of the three modules
-- that legitimately surface these numbers," not finance.view alone —
-- otherwise Marketing (analytics.view, no finance.view) would lose
-- access to figures its own Analytics tabs are supposed to show.
-- Bodies are byte-for-byte the 0022 originals plus this one added
-- condition per scope — nothing else about the calculations changes.
-- ---------------------------------------------------------------
create or replace function public.user_has_finance_visibility(p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select public.user_has_permission(p_workspace_id, 'finance.view')
      or public.user_has_permission(p_workspace_id, 'analytics.view')
      or public.user_has_permission(p_workspace_id, 'reports.view');
$$;

comment on function public.user_has_finance_visibility(uuid) is
  'True if the current user holds finance.view, analytics.view or reports.view in p_workspace_id — the shared gate for every Finance/Analytics/Reports aggregation RPC, since all three pages consume the same functions.';


create or replace function public.get_finance_summary(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_sales_value numeric,
  total_orders bigint,
  delivered_revenue numeric,
  delivered_orders bigint,
  pending_revenue numeric,
  pending_orders bigint,
  returned_value numeric,
  returned_orders bigint,
  cancelled_value numeric,
  cancelled_orders bigint,
  average_order_value numeric,
  average_delivered_order_value numeric,
  cogs_delivered numeric,
  gross_profit numeric,
  gross_margin_pct numeric,
  delivery_success_rate numeric,
  return_rate numeric,
  cancellation_rate numeric,
  rate_delivered_count bigint,
  rate_returned_count bigint,
  rate_cancelled_count bigint,
  rate_eligible_count bigint,
  contribution_profit numeric,
  contribution_profit_orders_count bigint
)
language sql
stable
as $$
  with created_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  delivered_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and o.status = 'DELIVERED' and o.cash_collection_status = 'collected'
      and (p_date_from is null or o.delivered_at >= p_date_from)
      and (p_date_to is null or o.delivered_at <= p_date_to)
  ),
  returned_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and o.status = 'RETURNED'
      and (p_date_from is null or o.returned_at >= p_date_from)
      and (p_date_to is null or o.returned_at <= p_date_to)
  ),
  cancelled_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and o.status = 'CANCELLED'
      and (p_date_from is null or o.cancelled_at >= p_date_from)
      and (p_date_to is null or o.cancelled_at <= p_date_to)
  ),
  agg as (
    select
      coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0) as total_sales_value,
      count(*) filter (where status <> 'CANCELLED') as total_orders,
      coalesce(sum(total_amount) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')), 0) as pending_revenue,
      count(*) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')) as pending_orders,
      count(*) filter (where status = 'DELIVERED') as rate_delivered_count,
      count(*) filter (where status = 'RETURNED') as rate_returned_count,
      count(*) filter (where status = 'CANCELLED') as rate_cancelled_count
    from created_scope
  ),
  delivered_agg as (
    select
      coalesce(sum(total_amount), 0) as delivered_revenue,
      count(*) as delivered_orders,
      coalesce(sum(cost_amount), 0) as cogs_delivered,
      coalesce(sum(total_amount - coalesce(cost_amount, 0) - actual_delivery_cost) filter (where actual_delivery_cost is not null), 0) as contribution_profit,
      count(*) filter (where actual_delivery_cost is not null) as contribution_profit_orders_count
    from delivered_scope
  ),
  returned_agg as (
    select coalesce(sum(total_amount), 0) as returned_value, count(*) as returned_orders from returned_scope
  ),
  cancelled_agg as (
    select coalesce(sum(total_amount), 0) as cancelled_value, count(*) as cancelled_orders from cancelled_scope
  )
  select
    agg.total_sales_value,
    agg.total_orders,
    delivered_agg.delivered_revenue,
    delivered_agg.delivered_orders,
    agg.pending_revenue,
    agg.pending_orders,
    returned_agg.returned_value,
    returned_agg.returned_orders,
    cancelled_agg.cancelled_value,
    cancelled_agg.cancelled_orders,
    case when agg.total_orders > 0 then round(agg.total_sales_value / agg.total_orders, 2) else 0 end,
    case when delivered_agg.delivered_orders > 0 then round(delivered_agg.delivered_revenue / delivered_agg.delivered_orders, 2) else 0 end,
    delivered_agg.cogs_delivered,
    delivered_agg.delivered_revenue - delivered_agg.cogs_delivered,
    case when delivered_agg.delivered_revenue > 0
      then round(100.0 * (delivered_agg.delivered_revenue - delivered_agg.cogs_delivered) / delivered_agg.delivered_revenue, 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_delivered_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_returned_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_cancelled_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    agg.rate_delivered_count,
    agg.rate_returned_count,
    agg.rate_cancelled_count,
    (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count),
    delivered_agg.contribution_profit,
    delivered_agg.contribution_profit_orders_count
  from agg, delivered_agg, returned_agg, cancelled_agg;
$$;


create or replace function public.get_order_status_value_breakdown(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  status text,
  order_count bigint,
  order_value numeric
)
language sql
stable
as $$
  with statuses(status, sort_order) as (
    values
      ('NEW', 1), ('PENDING', 2), ('WILL_CALL_BACK', 3), ('SCHEDULED', 4),
      ('PROCESSING_FOR_DISPATCH', 5), ('DISPATCHED', 6), ('IN_TRANSIT', 7),
      ('PARTIALLY_DELIVERED', 8), ('DELIVERED', 9), ('RETURNED', 10), ('CANCELLED', 11)
  )
  select
    statuses.status,
    coalesce(count(o.id), 0),
    coalesce(sum(o.total_amount), 0)
  from statuses
  left join public.orders o
    on o.status = statuses.status
    and o.workspace_id = p_workspace_id
    and (p_brand_id is null or o.brand_id = p_brand_id)
    and o.deleted_at is null
    and public.user_has_finance_visibility(p_workspace_id)
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at <= p_date_to)
  group by statuses.status, statuses.sort_order
  order by statuses.sort_order;
$$;


create or replace function public.get_delivery_funnel_stats(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  stage text,
  order_count bigint,
  order_value numeric
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
      and public.user_has_finance_visibility(p_workspace_id)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  )
  select 'CREATED', count(*), coalesce(sum(total_amount), 0) from scope
  union all
  select 'CONFIRMED', count(*), coalesce(sum(total_amount), 0) from scope where status <> 'NEW'
  union all
  select 'DISPATCHED', count(*), coalesce(sum(total_amount), 0) from scope
    where status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED', 'RETURNED')
  union all
  select 'DELIVERED', count(*), coalesce(sum(total_amount), 0) from scope where status = 'DELIVERED'
  union all
  select 'CASH_COLLECTED', count(*), coalesce(sum(total_amount), 0) from scope
    where status = 'DELIVERED' and cash_collection_status = 'collected';
$$;


create or replace function public.get_revenue_trend(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_granularity text default 'day'
)
returns table (
  bucket date,
  sales_value numeric,
  delivered_revenue numeric,
  pending_revenue numeric
)
language plpgsql
stable
as $$
declare
  v_from timestamptz := coalesce(p_date_from, now() - interval '29 days');
  v_to timestamptz := coalesce(p_date_to, now());
  v_step interval;
  v_granularity text := lower(coalesce(p_granularity, 'day'));
  v_allowed boolean := public.user_has_finance_visibility(p_workspace_id);
begin
  if v_granularity not in ('day', 'week', 'month') then
    v_granularity := 'day';
  end if;
  v_step := case v_granularity when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 day' end;

  return query
  with buckets as (
    select generate_series(date_trunc(v_granularity, v_from), date_trunc(v_granularity, v_to), v_step)::date as bucket
  )
  select
    b.bucket,
    coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null and o.status <> 'CANCELLED' and v_allowed
        and date_trunc(v_granularity, o.created_at) = b.bucket
    ), 0),
    coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null and o.status = 'DELIVERED' and o.cash_collection_status = 'collected' and v_allowed
        and date_trunc(v_granularity, o.delivered_at) = b.bucket
    ), 0),
    coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null and o.status not in ('DELIVERED', 'RETURNED', 'CANCELLED') and v_allowed
        and date_trunc(v_granularity, o.created_at) = b.bucket
    ), 0)
  from buckets b
  order by b.bucket;
end;
$$;


create or replace function public.get_product_performance(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 50
)
returns table (
  product_id uuid,
  product_name text,
  sku text,
  orders_count bigint,
  units_sold bigint,
  sales_value numeric,
  delivered_revenue numeric,
  returned_orders bigint,
  cancelled_orders bigint,
  cancellation_rate numeric,
  stock_quantity integer,
  reserved_quantity integer,
  available_quantity integer,
  cogs_delivered numeric,
  gross_profit numeric,
  gross_margin_pct numeric,
  items_delivered bigint,
  items_with_cost_data bigint
)
language sql
stable
as $$
  with items as (
    select oi.*, o.status, o.cash_collection_status
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.workspace_id = p_workspace_id
      and (p_brand_id is null or oi.brand_id = p_brand_id)
      and o.deleted_at is null
      and oi.product_id is not null
      and public.user_has_finance_visibility(p_workspace_id)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  grouped as (
    select
      items.product_id,
      max(items.product_name) as product_name,
      max(items.sku) as sku,
      count(distinct items.order_id) as orders_count,
      coalesce(sum(items.quantity) filter (where items.status <> 'CANCELLED'), 0) as units_sold,
      coalesce(sum(items.total_amount) filter (where items.status <> 'CANCELLED'), 0) as sales_value,
      coalesce(sum(items.total_amount) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected'), 0) as delivered_revenue,
      count(distinct items.order_id) filter (where items.status = 'RETURNED') as returned_orders,
      count(distinct items.order_id) filter (where items.status = 'CANCELLED') as cancelled_orders,
      coalesce(sum(items.unit_cost * items.quantity) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected' and items.unit_cost is not null), 0) as cogs_delivered,
      count(*) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected') as items_delivered,
      count(*) filter (where items.status = 'DELIVERED' and items.cash_collection_status = 'collected' and items.unit_cost is not null) as items_with_cost_data
    from items
    group by items.product_id
  )
  select
    grouped.product_id,
    grouped.product_name,
    grouped.sku,
    grouped.orders_count,
    grouped.units_sold,
    grouped.sales_value,
    grouped.delivered_revenue,
    grouped.returned_orders,
    grouped.cancelled_orders,
    case when grouped.orders_count > 0 then round(100.0 * grouped.cancelled_orders / grouped.orders_count, 1) else 0 end,
    p.stock_quantity,
    p.reserved_quantity,
    p.available_quantity,
    grouped.cogs_delivered,
    grouped.delivered_revenue - grouped.cogs_delivered,
    case when grouped.delivered_revenue > 0 then round(100.0 * (grouped.delivered_revenue - grouped.cogs_delivered) / grouped.delivered_revenue, 1) else 0 end,
    grouped.items_delivered,
    grouped.items_with_cost_data
  from grouped
  left join public.products p on p.id = grouped.product_id
  order by grouped.sales_value desc
  limit greatest(p_limit, 1);
$$;


create or replace function public.get_customer_analytics(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_customers bigint,
  new_customers bigint,
  repeat_customers bigint,
  repeat_order_rate numeric,
  avg_orders_per_customer numeric,
  customer_revenue numeric,
  delivered_customer_revenue numeric
)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (
      where (p_date_from is null or created_at >= p_date_from)
        and (p_date_to is null or created_at <= p_date_to)
    ),
    count(*) filter (where is_repeat_customer),
    case when count(*) > 0 then round(100.0 * count(*) filter (where is_repeat_customer) / count(*), 1) else 0 end,
    case when count(*) filter (where total_orders > 0) > 0
      then round(sum(total_orders)::numeric / count(*) filter (where total_orders > 0), 2)
      else 0 end,
    coalesce(sum(total_order_value), 0),
    coalesce(sum(delivered_value), 0)
  from public.customers
  where workspace_id = p_workspace_id
    and (p_brand_id is null or brand_id = p_brand_id)
    and deleted_at is null
    and public.user_has_finance_visibility(p_workspace_id);
$$;


create or replace function public.get_landing_page_analytics(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 50
)
returns table (
  landing_page_id uuid,
  landing_page_name text,
  landing_page_slug text,
  orders_count bigint,
  sales_value numeric,
  delivered_revenue numeric,
  pending_revenue numeric,
  returned_orders bigint,
  cancelled_orders bigint,
  average_order_value numeric
)
language sql
stable
as $$
  with scope as (
    select o.*
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.landing_page_id is not null
      and public.user_has_finance_visibility(p_workspace_id)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  grouped as (
    select
      scope.landing_page_id,
      count(*) as orders_count,
      coalesce(sum(scope.total_amount) filter (where scope.status <> 'CANCELLED'), 0) as sales_value,
      coalesce(sum(scope.total_amount) filter (where scope.status = 'DELIVERED' and scope.cash_collection_status = 'collected'), 0) as delivered_revenue,
      coalesce(sum(scope.total_amount) filter (where scope.status not in ('DELIVERED', 'RETURNED', 'CANCELLED')), 0) as pending_revenue,
      count(*) filter (where scope.status = 'RETURNED') as returned_orders,
      count(*) filter (where scope.status = 'CANCELLED') as cancelled_orders,
      count(*) filter (where scope.status <> 'CANCELLED') as non_cancelled_count
    from scope
    group by scope.landing_page_id
  )
  select
    grouped.landing_page_id,
    lp.name,
    lp.slug,
    grouped.orders_count,
    grouped.sales_value,
    grouped.delivered_revenue,
    grouped.pending_revenue,
    grouped.returned_orders,
    grouped.cancelled_orders,
    case when grouped.non_cancelled_count > 0 then round(grouped.sales_value / grouped.non_cancelled_count, 2) else 0 end
  from grouped
  join public.landing_pages lp on lp.id = grouped.landing_page_id
  order by grouped.sales_value desc
  limit greatest(p_limit, 1);
$$;


-- ---------------------------------------------------------------
-- The `brands` storage bucket was created in 0012 (products/inventory
-- phase) for future use but never got write RLS policies (only
-- `products` and `landing-pages` did) — Brand Management's logo
-- upload is the first feature that actually needs it. Mirrors the
-- products bucket pattern exactly: path is always
-- `${workspace_id}/${brand_id}/...`.
-- ---------------------------------------------------------------
create policy "brands_bucket_public_read" on storage.objects
  for select
  using (bucket_id = 'brands');

create policy "brands_bucket_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brands'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "brands_bucket_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'brands'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "brands_bucket_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brands'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );


-- ---------------------------------------------------------------
-- 10. Indexes for the new screens' common query shapes.
-- ---------------------------------------------------------------
create index audit_logs_workspace_module_idx on public.audit_logs (workspace_id, module);
create index audit_logs_workspace_user_idx on public.audit_logs (workspace_id, user_id);
create index audit_logs_workspace_action_idx on public.audit_logs (workspace_id, action);
create index notifications_workspace_created_idx on public.notifications (workspace_id, created_at desc);
create index notifications_archived_idx on public.notifications (workspace_id, is_archived);
create index user_roles_role_id_idx on public.user_roles (role_id);


-- ---------------------------------------------------------------
-- Best-effort Realtime for the Notifications bell: adds notifications
-- to Supabase's built-in `supabase_realtime` publication so a new row
-- can push to the topbar without a manual refetch. Guarded because
-- that publication only exists on an actual Supabase-provisioned
-- database — a plain local Postgres (this migration's own test
-- environment) has no such publication, so this is a harmless no-op
-- there rather than a failed migration. Whether Realtime actually
-- fires end-to-end can only be verified against a live Supabase
-- project, which this sandbox cannot reach — see the Phase 5 delivery
-- report for exactly what was and wasn't verified.
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
exception when duplicate_object then
  null;
end $$;
