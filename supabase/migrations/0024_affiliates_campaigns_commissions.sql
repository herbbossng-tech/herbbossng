-- ============================================================
-- GOLDEN COMMERCE OS — Affiliate Management, Campaigns,
-- Commissions, Wallets, Withdrawals & Ad Cost Management (0024)
--
-- Extends the EXISTING Orders model for attribution (no parallel
-- order table) and reuses Phase 4's exact delivered-revenue
-- definition (status = 'DELIVERED' and cash_collection_status =
-- 'collected') wherever "delivered" matters here — never a second
-- definition. The 'affiliates' permission module, the
-- 'affiliate-manager' system role and the private 'affiliates'
-- storage bucket already exist (0008/0012) — this migration adds
-- everything they don't: the affiliate directory's own lifecycle,
-- campaigns, order attribution, an idempotent commission engine,
-- a ledger-backed wallet, withdrawals with reservation semantics,
-- ad cost approval, and analytics.
-- ============================================================


-- ---------------------------------------------------------------
-- 0. BUG FIX (discovered while writing this migration's own role
-- grants below): 0023's guard_system_role_permissions() blocks
-- EVERY INSERT/DELETE against role_permissions for a system role,
-- with no distinction between an authenticated client tampering via
-- PostgREST and a migration seeding a brand-new permission module's
-- grants onto the system role templates — the exact pattern 0008 and
-- 0022 both already relied on, and this migration needs again. As
-- written, no future migration could ever grant a new permission to
-- Owner/Admin/Manager/etc. again. role_permissions has no client
-- insert/delete RLS policy at all (every legitimate app write path
-- is the Roles feature's RPCs, never a direct table write) — so the
-- trigger's real job is blocking `authenticated`-role writes
-- specifically, not every writer. Migrations run as the `postgres`
-- superuser (session_user), never as `authenticated`, so gating on
-- that distinguishes "PostgREST request" from "migration seed" while
-- preserving the original protection exactly.
-- ---------------------------------------------------------------
create or replace function public.guard_system_role_permissions()
returns trigger
language plpgsql
as $$
declare
  v_role_id uuid := coalesce(new.role_id, old.role_id);
  v_is_system boolean;
begin
  select is_system_role into v_is_system from public.roles where id = v_role_id;
  if v_is_system and current_user = 'authenticated' then
    raise exception 'System role permissions cannot be modified. Duplicate the role to customize its permissions.';
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.guard_system_role_permissions() is
  'Blocks INSERT/DELETE against role_permissions for an is_system_role role when the writer is the `authenticated` PostgREST role — protecting the seeded Owner/Admin/.../Viewer templates from client tampering without also blocking migrations (which run as the postgres superuser) from seeding new permission grants onto those same templates.';


-- ---------------------------------------------------------------
-- 1. Permission catalogue: campaigns.*, commissions.*, wallets.*,
-- withdrawals.*, ad_costs.*, affiliate_reports.*.
-- ---------------------------------------------------------------
insert into public.permissions (module, action, slug, category, description) values
  ('campaigns', 'view', 'campaigns.view', 'Campaigns', 'View affiliate campaigns'),
  ('campaigns', 'create', 'campaigns.create', 'Campaigns', 'Create affiliate campaigns'),
  ('campaigns', 'update', 'campaigns.update', 'Campaigns', 'Update campaigns, including activate/pause/archive'),
  ('campaigns', 'delete', 'campaigns.delete', 'Campaigns', 'Delete draft campaigns'),
  ('campaigns', 'manage', 'campaigns.manage', 'Campaigns', 'Full campaign management'),

  ('commissions', 'view', 'commissions.view', 'Commissions', 'View affiliate commissions'),
  ('commissions', 'export', 'commissions.export', 'Commissions', 'Export commission data'),
  ('commissions', 'manage', 'commissions.manage', 'Commissions', 'Manually adjust/reverse commissions'),

  ('wallets', 'view', 'wallets.view', 'Wallets', 'View affiliate wallet balances and ledgers'),
  ('wallets', 'manage', 'wallets.manage', 'Wallets', 'Issue manual affiliate wallet credits/debits'),
  ('wallets', 'export', 'wallets.export', 'Wallets', 'Export wallet ledger data'),

  ('withdrawals', 'view', 'withdrawals.view', 'Withdrawals', 'View affiliate withdrawal requests'),
  ('withdrawals', 'create', 'withdrawals.create', 'Withdrawals', 'Record a withdrawal request for an affiliate'),
  ('withdrawals', 'approve', 'withdrawals.approve', 'Withdrawals', 'Approve or reject withdrawal requests'),
  ('withdrawals', 'manage', 'withdrawals.manage', 'Withdrawals', 'Mark withdrawals as paid; full withdrawal management'),
  ('withdrawals', 'export', 'withdrawals.export', 'Withdrawals', 'Export withdrawal data'),

  ('ad_costs', 'view', 'ad_costs.view', 'Ad Costs', 'View ad cost entries'),
  ('ad_costs', 'create', 'ad_costs.create', 'Ad Costs', 'Submit ad cost entries'),
  ('ad_costs', 'approve', 'ad_costs.approve', 'Ad Costs', 'Approve or reject ad cost entries'),
  ('ad_costs', 'manage', 'ad_costs.manage', 'Ad Costs', 'Full ad cost management'),
  ('ad_costs', 'export', 'ad_costs.export', 'Ad Costs', 'Export ad cost data'),

  ('affiliate_reports', 'view', 'affiliate_reports.view', 'Affiliate Reports', 'View affiliate/campaign/commission/wallet/withdrawal/ad-cost reports'),
  ('affiliate_reports', 'export', 'affiliate_reports.export', 'Affiliate Reports', 'Export affiliate reports')
on conflict (slug) do nothing;

-- Owner/Admin: Owner's/Admin's 0008 cross-join cannot retroactively
-- pick up rows inserted just above (same limitation noted in 0022) —
-- grant explicitly.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin')
  and p.module in ('campaigns', 'commissions', 'wallets', 'withdrawals', 'ad_costs', 'affiliate_reports')
on conflict do nothing;

-- Manager: can run campaigns operationally (view/create/update/delete/
-- export, no manage — mirrors 0008's own manager convention) and see
-- commission figures, but NOT wallets/withdrawals/ad_costs — the
-- same "no finance module" boundary 0008 already drew for Manager.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and (
    (p.module = 'campaigns' and p.action <> 'manage')
    or p.slug = 'commissions.view'
  )
on conflict do nothing;

-- Finance: wallets/withdrawals/ad-cost approval authority, commission
-- and campaign visibility, reports. This role is explicitly the
-- payout-approval authority in this workspace.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'finance'
  and (
    p.module in ('wallets', 'withdrawals', 'commissions', 'affiliate_reports')
    or p.slug in ('campaigns.view', 'ad_costs.view', 'ad_costs.approve', 'ad_costs.manage', 'ad_costs.export')
  )
on conflict do nothing;

-- Marketing: runs campaigns and submits ad spend, but does NOT
-- approve its own ad cost entries (separation of duties — approval
-- is Finance's/Affiliate Manager's job) and has no wallet/withdrawal
-- payout authority whatsoever.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'marketing'
  and (
    p.module = 'campaigns'
    or p.slug in ('ad_costs.view', 'ad_costs.create', 'ad_costs.export', 'commissions.view', 'affiliate_reports.view')
  )
on conflict do nothing;

-- Affiliate Manager: the whole point of this role — full authority
-- over every module this phase introduces.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'affiliate-manager'
  and p.module in ('campaigns', 'commissions', 'wallets', 'withdrawals', 'ad_costs', 'affiliate_reports')
on conflict do nothing;

-- Viewer: read-only, consistent with its existing "every action='view'" grant.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer'
  and p.module in ('campaigns', 'commissions', 'wallets', 'withdrawals', 'ad_costs', 'affiliate_reports')
  and p.action = 'view'
on conflict do nothing;

-- Deliberately NOT granted to Customer Support or Warehouse Staff —
-- neither gets any campaigns/commissions/wallets/withdrawals/ad_costs
-- permission. Customer Support has no wallet payout authority;
-- Warehouse Staff has no affiliate financial authority whatsoever.


-- ---------------------------------------------------------------
-- 2. Affiliates — the directory. Workspace-scoped (not brand-scoped:
-- one affiliate can promote campaigns across every brand in the
-- workspace via separate, brand-scoped campaigns). approval_status
-- (pending/approved/rejected) tracks the application; status
-- (active/suspended) is an independent operational toggle only
-- meaningful once approved — an approved-but-suspended affiliate
-- keeps their history but is blocked from new attribution.
-- ---------------------------------------------------------------
create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  business_name text,
  referral_code text not null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  applied_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  rejected_at timestamptz,
  rejected_by uuid references auth.users (id),
  rejection_reason text,
  suspended_at timestamptz,
  suspended_by uuid references auth.users (id),
  suspension_reason text,
  payout_method jsonb not null default '{}'::jsonb,
  notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  unique (workspace_id, referral_code)
);

comment on table public.affiliates is
  'The affiliate directory. approval_status (pending/approved/rejected) is the application state; status (active/suspended) is a separate operational toggle only meaningful once approved. Both are only ever changed via approve_affiliate()/reject_affiliate()/suspend_affiliate()/reactivate_affiliate() — see update_affiliates RLS policy below, which blocks direct client writes to either column.';

create index affiliates_workspace_id_idx on public.affiliates (workspace_id) where deleted_at is null;
create index affiliates_approval_status_idx on public.affiliates (workspace_id, approval_status) where deleted_at is null;

create trigger set_affiliates_updated_at
  before update on public.affiliates
  for each row execute function public.set_updated_at();

alter table public.affiliates enable row level security;

create policy "select_affiliates" on public.affiliates
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'affiliates.view')
  );

create policy "insert_affiliates" on public.affiliates
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'affiliates.create')
  );

-- WITH CHECK forces approval_status/status to stay exactly as they
-- were for any direct client update — the only legal way to change
-- either is through the SECURITY DEFINER RPCs below, which bypass
-- RLS entirely. Server-enforced, not just UI-hidden.
create policy "update_affiliates" on public.affiliates
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'affiliates.update') or public.user_has_permission(workspace_id, 'affiliates.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'affiliates.update') or public.user_has_permission(workspace_id, 'affiliates.manage'))
    and approval_status = (select a.approval_status from public.affiliates a where a.id = affiliates.id)
    and status = (select a.status from public.affiliates a where a.id = affiliates.id)
  );

-- Dedicated audit trigger (mirrors log_workspace_audit_event in 0023):
-- affiliates has no brand_id column of its own, so the generic
-- log_audit_event() (which reads new.brand_id) doesn't fit.
create or replace function public.log_affiliate_audit_event()
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
      when new.approval_status is distinct from old.approval_status then 'status_change'
      when new.status is distinct from old.status then 'status_change'
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
    v_workspace_id, null, auth.uid(), 'affiliates', v_action, 'affiliate', v_id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_affiliates
  after insert or update on public.affiliates
  for each row execute function public.log_affiliate_audit_event();


-- ---------------------------------------------------------------
-- Referral code generation + affiliate lifecycle RPCs. All four
-- gated on affiliates.approve (same permission that already existed
-- for this purpose in the 0008 seed).
-- ---------------------------------------------------------------
create or replace function public.generate_affiliate_referral_code(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_code := 'AFF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (
      select 1 from public.affiliates where workspace_id = p_workspace_id and referral_code = v_code
    );
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'Could not generate a unique referral code';
    end if;
  end loop;
  return v_code;
end;
$$;

create or replace function public.create_affiliate(
  p_workspace_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_business_name text default null,
  p_notes text default null
)
returns public.affiliates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
begin
  if not public.user_has_permission(p_workspace_id, 'affiliates.create') then
    raise exception 'insufficient_permission: affiliates.create required';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name is required';
  end if;

  insert into public.affiliates (
    workspace_id, full_name, email, phone, business_name, notes, referral_code, created_by, updated_by
  ) values (
    p_workspace_id, trim(p_full_name), nullif(trim(p_email), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_business_name), ''), p_notes,
    public.generate_affiliate_referral_code(p_workspace_id), auth.uid(), auth.uid()
  )
  returning * into v_affiliate;

  return v_affiliate;
end;
$$;

comment on function public.create_affiliate(uuid, text, text, text, text, text) is
  'Creates a pending affiliate application with a unique, workspace-scoped referral_code. Use approve_affiliate()/reject_affiliate() to move it out of pending.';

create or replace function public.approve_affiliate(p_affiliate_id uuid)
returns public.affiliates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
begin
  select * into v_affiliate from public.affiliates where id = p_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Affiliate not found';
  end if;
  if not public.user_has_permission(v_affiliate.workspace_id, 'affiliates.approve') then
    raise exception 'insufficient_permission: affiliates.approve required';
  end if;
  if v_affiliate.approval_status <> 'pending' then
    raise exception 'Only a pending affiliate can be approved';
  end if;

  update public.affiliates
    set approval_status = 'approved', status = 'active',
        approved_at = now(), approved_by = auth.uid(), updated_by = auth.uid()
    where id = p_affiliate_id
    returning * into v_affiliate;

  insert into public.notifications (workspace_id, brand_id, type, title, message, priority, link, metadata)
  values (
    v_affiliate.workspace_id, null, 'affiliate_approved', 'Affiliate approved',
    v_affiliate.full_name || ' was approved as an affiliate.', 'normal',
    '/affiliates/' || v_affiliate.id, jsonb_build_object('affiliate_id', v_affiliate.id)
  );

  return v_affiliate;
end;
$$;

create or replace function public.reject_affiliate(p_affiliate_id uuid, p_reason text)
returns public.affiliates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
begin
  select * into v_affiliate from public.affiliates where id = p_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Affiliate not found';
  end if;
  if not public.user_has_permission(v_affiliate.workspace_id, 'affiliates.approve') then
    raise exception 'insufficient_permission: affiliates.approve required';
  end if;
  if v_affiliate.approval_status <> 'pending' then
    raise exception 'Only a pending affiliate can be rejected';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'rejection_reason is required';
  end if;

  update public.affiliates
    set approval_status = 'rejected', rejected_at = now(), rejected_by = auth.uid(),
        rejection_reason = p_reason, updated_by = auth.uid()
    where id = p_affiliate_id
    returning * into v_affiliate;

  return v_affiliate;
end;
$$;

create or replace function public.suspend_affiliate(p_affiliate_id uuid, p_reason text default null)
returns public.affiliates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
begin
  select * into v_affiliate from public.affiliates where id = p_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Affiliate not found';
  end if;
  if not public.user_has_permission(v_affiliate.workspace_id, 'affiliates.approve') then
    raise exception 'insufficient_permission: affiliates.approve required';
  end if;
  if v_affiliate.approval_status <> 'approved' or v_affiliate.status <> 'active' then
    raise exception 'Only an active, approved affiliate can be suspended';
  end if;

  update public.affiliates
    set status = 'suspended', suspended_at = now(), suspended_by = auth.uid(),
        suspension_reason = p_reason, updated_by = auth.uid()
    where id = p_affiliate_id
    returning * into v_affiliate;

  return v_affiliate;
end;
$$;

create or replace function public.reactivate_affiliate(p_affiliate_id uuid)
returns public.affiliates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
begin
  select * into v_affiliate from public.affiliates where id = p_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Affiliate not found';
  end if;
  if not public.user_has_permission(v_affiliate.workspace_id, 'affiliates.approve') then
    raise exception 'insufficient_permission: affiliates.approve required';
  end if;
  if v_affiliate.approval_status <> 'approved' or v_affiliate.status <> 'suspended' then
    raise exception 'Only a suspended affiliate can be reactivated';
  end if;

  update public.affiliates
    set status = 'active', suspended_at = null, suspended_by = null, suspension_reason = null, updated_by = auth.uid()
    where id = p_affiliate_id
    returning * into v_affiliate;

  return v_affiliate;
end;
$$;


-- ---------------------------------------------------------------
-- 3. Campaigns — brand + product scoped. DRAFT/ACTIVE/PAUSED/
-- ARCHIVED state machine enforced by a BEFORE UPDATE trigger
-- (mirrors guard_order_status_transition's role for orders).
--
-- Commission base is deliberately NOT a configurable column: it is
-- always "the sum of order_items.total_amount for this campaign's
-- selected products, within the attributed order" — a single,
-- documented definition (see process_affiliate_commission below),
-- never left ambiguous or reinvented per campaign.
-- ---------------------------------------------------------------
create table public.affiliate_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),

  commission_type text not null default 'PERCENTAGE'
    check (commission_type in ('FIXED_AMOUNT', 'PERCENTAGE')),
  commission_value numeric(12, 2) not null default 0 check (commission_value >= 0),

  qualifying_event text not null default 'PER_DELIVERED_ORDER'
    check (qualifying_event in ('PER_ORDER_CREATED', 'PER_DELIVERED_ORDER')),
  affiliate_access text not null default 'ALL_APPROVED_AFFILIATES'
    check (affiliate_access in ('ALL_APPROVED_AFFILIATES', 'SELECTED_AFFILIATES_ONLY')),

  allowed_activities text[] not null default '{}',
  start_at timestamptz,
  end_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  unique (brand_id, slug)
);

comment on table public.affiliate_campaigns is
  'commission_value is a percentage (0-100) when commission_type=PERCENTAGE, or a flat currency amount when FIXED_AMOUNT. qualifying_event PER_ORDER_CREATED pays on order creation (risky for COD — many never convert); PER_DELIVERED_ORDER pays only once the order reaches DELIVERED, reusing the exact same status the Finance module uses for delivered_revenue. affiliate_access ALL_APPROVED_AFFILIATES vs SELECTED_AFFILIATES_ONLY is enforced server-side inside process_affiliate_commission()/create_order(), never merely hidden in the UI.';

create index affiliate_campaigns_workspace_id_idx on public.affiliate_campaigns (workspace_id) where deleted_at is null;
create index affiliate_campaigns_brand_id_idx on public.affiliate_campaigns (brand_id) where deleted_at is null;
create index affiliate_campaigns_status_idx on public.affiliate_campaigns (brand_id, status) where deleted_at is null;

create trigger set_affiliate_campaigns_updated_at
  before update on public.affiliate_campaigns
  for each row execute function public.set_updated_at();

create or replace function public.guard_campaign_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'ARCHIVED' then
      raise exception 'An archived campaign cannot change status';
    end if;
    if not (
      (old.status = 'DRAFT' and new.status in ('ACTIVE', 'ARCHIVED'))
      or (old.status = 'ACTIVE' and new.status in ('PAUSED', 'ARCHIVED'))
      or (old.status = 'PAUSED' and new.status in ('ACTIVE', 'ARCHIVED'))
    ) then
      raise exception 'Invalid campaign status transition: % -> %', old.status, new.status;
    end if;

    if new.status = 'ACTIVE' and old.status = 'DRAFT' then
      if not exists (select 1 from public.affiliate_campaign_products where campaign_id = new.id) then
        raise exception 'A campaign needs at least one product before it can be activated';
      end if;
      if new.commission_value <= 0 then
        raise exception 'A campaign needs a commission value greater than zero before it can be activated';
      end if;
      if new.affiliate_access = 'SELECTED_AFFILIATES_ONLY'
        and not exists (select 1 from public.affiliate_campaign_affiliates where campaign_id = new.id and relationship = 'ACCESS') then
        raise exception 'SELECTED_AFFILIATES_ONLY campaigns need at least one affiliate granted access before activation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_affiliate_campaigns_status_transition
  before update on public.affiliate_campaigns
  for each row execute function public.guard_campaign_status_transition();

create trigger audit_affiliate_campaigns
  after insert or update on public.affiliate_campaigns
  for each row execute function public.log_audit_event('campaigns');

alter table public.affiliate_campaigns enable row level security;

create policy "select_affiliate_campaigns" on public.affiliate_campaigns
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'campaigns.view')
  );

create policy "insert_affiliate_campaigns" on public.affiliate_campaigns
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'campaigns.create')
  );

create policy "update_affiliate_campaigns" on public.affiliate_campaigns
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'campaigns.update') or public.user_has_permission(workspace_id, 'campaigns.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'campaigns.update') or public.user_has_permission(workspace_id, 'campaigns.manage'))
  );

create policy "delete_affiliate_campaigns" on public.affiliate_campaigns
  for delete to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and status = 'DRAFT'
    and (public.user_has_permission(workspace_id, 'campaigns.delete') or public.user_has_permission(workspace_id, 'campaigns.manage'))
  );


-- ---------------------------------------------------------------
-- Campaign product selection.
-- ---------------------------------------------------------------
create table public.affiliate_campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.affiliate_campaigns (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (campaign_id, product_id)
);

create index affiliate_campaign_products_campaign_id_idx on public.affiliate_campaign_products (campaign_id);
create index affiliate_campaign_products_product_id_idx on public.affiliate_campaign_products (product_id);

alter table public.affiliate_campaign_products enable row level security;

create policy "select_affiliate_campaign_products" on public.affiliate_campaign_products
  for select to authenticated
  using (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and public.user_has_permission(c.workspace_id, 'campaigns.view')
    )
  );

create policy "write_affiliate_campaign_products" on public.affiliate_campaign_products
  for all to authenticated
  using (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and c.status = 'DRAFT'
        and (public.user_has_permission(c.workspace_id, 'campaigns.update') or public.user_has_permission(c.workspace_id, 'campaigns.manage'))
    )
  )
  with check (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and c.status = 'DRAFT'
        and (public.user_has_permission(c.workspace_id, 'campaigns.update') or public.user_has_permission(c.workspace_id, 'campaigns.manage'))
    )
  );

comment on table public.affiliate_campaign_products is
  'The product selection a campaign pays commission on. Only editable while the campaign is DRAFT — once ACTIVE, the product set (and therefore the commission_base definition) is frozen so in-flight attribution stays consistent; pause/archive and start a new campaign to change it.';


-- ---------------------------------------------------------------
-- Campaign <-> affiliate junction: dual purpose. 'ACCESS' rows are
-- the whitelist consulted when affiliate_access =
-- SELECTED_AFFILIATES_ONLY. 'COMMISSION_EXCEPTION' rows mark an
-- affiliate who may participate but earns nothing — independent of
-- the access rule, works under either access mode.
-- ---------------------------------------------------------------
create table public.affiliate_campaign_affiliates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.affiliate_campaigns (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  relationship text not null check (relationship in ('ACCESS', 'COMMISSION_EXCEPTION')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (campaign_id, affiliate_id, relationship)
);

create index affiliate_campaign_affiliates_campaign_id_idx on public.affiliate_campaign_affiliates (campaign_id, relationship);
create index affiliate_campaign_affiliates_affiliate_id_idx on public.affiliate_campaign_affiliates (affiliate_id);

alter table public.affiliate_campaign_affiliates enable row level security;

create policy "select_affiliate_campaign_affiliates" on public.affiliate_campaign_affiliates
  for select to authenticated
  using (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and public.user_has_permission(c.workspace_id, 'campaigns.view')
    )
  );

create policy "write_affiliate_campaign_affiliates" on public.affiliate_campaign_affiliates
  for all to authenticated
  using (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and (public.user_has_permission(c.workspace_id, 'campaigns.update') or public.user_has_permission(c.workspace_id, 'campaigns.manage'))
    )
  )
  with check (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and (public.user_has_permission(c.workspace_id, 'campaigns.update') or public.user_has_permission(c.workspace_id, 'campaigns.manage'))
    )
  );


-- ---------------------------------------------------------------
-- Campaign promotional assets — reuses the existing private
-- 'affiliates' storage bucket (created in 0012); this table is just
-- the metadata row pointing at an object in it.
-- ---------------------------------------------------------------
create table public.affiliate_campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.affiliate_campaigns (id) on delete cascade,
  name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index affiliate_campaign_assets_campaign_id_idx on public.affiliate_campaign_assets (campaign_id);

alter table public.affiliate_campaign_assets enable row level security;

create policy "select_affiliate_campaign_assets" on public.affiliate_campaign_assets
  for select to authenticated
  using (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and public.user_has_permission(c.workspace_id, 'campaigns.view')
    )
  );

create policy "write_affiliate_campaign_assets" on public.affiliate_campaign_assets
  for all to authenticated
  using (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and (public.user_has_permission(c.workspace_id, 'campaigns.update') or public.user_has_permission(c.workspace_id, 'campaigns.manage'))
    )
  )
  with check (
    exists (
      select 1 from public.affiliate_campaigns c
      where c.id = campaign_id and c.workspace_id in (select public.user_workspace_ids())
        and (public.user_has_permission(c.workspace_id, 'campaigns.update') or public.user_has_permission(c.workspace_id, 'campaigns.manage'))
    )
  );

-- Write policies for the 'affiliates' storage bucket (only a public
-- read policy would be wrong here — the bucket is private, matching
-- 0012's `('affiliates', 'affiliates', false)` bucket definition).
-- Path convention: `${workspace_id}/${campaign_id}/...`, same shape
-- as the brands bucket's `${workspace_id}/${brand_id}/...` in 0023.
create policy "affiliates_bucket_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'affiliates'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "affiliates_bucket_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'affiliates'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "affiliates_bucket_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'affiliates'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "affiliates_bucket_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'affiliates'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );


-- ---------------------------------------------------------------
-- 4. Order attribution — extends the EXISTING orders table. No
-- parallel order/attribution table. affiliate_referral_code_used is
-- a historical snapshot (survives the affiliate's code ever being
-- regenerated); affiliate_campaign_id is only set once a matching
-- ACTIVE campaign is actually resolved (see create_order() below) —
-- an order can carry affiliate_id with a null campaign_id if the
-- referral code was valid but no live campaign covers any ordered
-- product, which still records attribution for analytics without
-- fabricating a commission.
-- ---------------------------------------------------------------
alter table public.orders add column if not exists affiliate_id uuid references public.affiliates (id) on delete set null;
alter table public.orders add column if not exists affiliate_campaign_id uuid references public.affiliate_campaigns (id) on delete set null;
alter table public.orders add column if not exists affiliate_referral_code_used text;

create index if not exists orders_affiliate_id_idx on public.orders (affiliate_id) where affiliate_id is not null;
create index if not exists orders_affiliate_campaign_id_idx on public.orders (affiliate_campaign_id) where affiliate_campaign_id is not null;

comment on column public.orders.affiliate_id is
  'The affiliate credited with this order, resolved server-side in create_order() from a referral code — never client-supplied directly.';
comment on column public.orders.affiliate_campaign_id is
  'The ACTIVE campaign this order was attributed to at creation time (product+affiliate-access matched). Null if a valid affiliate was resolved but no live campaign covered any ordered product — attribution without a commission.';


-- ---------------------------------------------------------------
-- affiliate_commissions — idempotency is a database constraint
-- (unique on campaign_id, affiliate_id, order_id), not just
-- application-level care. EXEMPT rows exist for COMMISSION_EXCEPTION
-- affiliates who participate but earn nothing — tracked, not hidden.
-- ---------------------------------------------------------------
create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.affiliate_campaigns (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,

  qualifying_event text not null check (qualifying_event in ('PER_ORDER_CREATED', 'PER_DELIVERED_ORDER')),
  commission_base_amount numeric(14, 2) not null default 0,
  commission_type text not null check (commission_type in ('FIXED_AMOUNT', 'PERCENTAGE')),
  commission_value numeric(12, 2) not null,
  commission_amount numeric(14, 2) not null default 0,
  currency_code text not null,

  status text not null default 'ELIGIBLE' check (status in ('ELIGIBLE', 'EXEMPT', 'REVERSED')),
  wallet_transaction_id uuid,
  reversed_at timestamptz,
  reversed_reason text,
  reversal_wallet_transaction_id uuid,

  created_at timestamptz not null default now(),
  unique (campaign_id, affiliate_id, order_id)
);

comment on table public.affiliate_commissions is
  'commission_base_amount = sum(order_items.total_amount) for this order''s items whose product_id is in the campaign''s selected products — the ONE definition of commission base, computed fresh by process_affiliate_commission(), never a client-supplied figure. The unique (campaign_id, affiliate_id, order_id) constraint is what makes duplicate order-creation retries, duplicate delivery webhooks, and duplicate manual recalculation calls all no-ops rather than double-paying commission.';

create index affiliate_commissions_workspace_id_idx on public.affiliate_commissions (workspace_id);
create index affiliate_commissions_affiliate_id_idx on public.affiliate_commissions (affiliate_id, status);
create index affiliate_commissions_campaign_id_idx on public.affiliate_commissions (campaign_id);
create index affiliate_commissions_order_id_idx on public.affiliate_commissions (order_id);

alter table public.affiliate_commissions enable row level security;

create policy "select_affiliate_commissions" on public.affiliate_commissions
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'commissions.view')
  );

-- No client insert/update/delete policy at all — every row here is
-- written exclusively by process_affiliate_commission()/
-- reverse_affiliate_commission() (SECURITY DEFINER), never a direct
-- client write. This is what makes the ledger genuinely tamper-proof,
-- not just discouraged.


-- ---------------------------------------------------------------
-- 5. Wallets — ledger-derived balance, never client-writable.
-- balance = sum(affiliate_wallet_transactions.amount) (available
-- funds); reserved_balance = sum(...reserved_delta) (funds held
-- against a pending/approved withdrawal). Both are maintained
-- exclusively by apply_wallet_transaction_to_balance(), the same
-- trigger-maintained-aggregate pattern already used for
-- customers.total_orders/products.stock_quantity.
-- ---------------------------------------------------------------
create table public.affiliate_wallets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  balance numeric(14, 2) not null default 0,
  reserved_balance numeric(14, 2) not null default 0,
  currency_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, affiliate_id)
);

create index affiliate_wallets_affiliate_id_idx on public.affiliate_wallets (affiliate_id);

alter table public.affiliate_wallets enable row level security;

create policy "select_affiliate_wallets" on public.affiliate_wallets
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'wallets.view')
  );

-- No client write policy whatsoever — balance/reserved_balance are
-- only ever mutated by the ledger trigger below.


create table public.affiliate_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  wallet_id uuid not null references public.affiliate_wallets (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  transaction_type text not null check (transaction_type in (
    'COMMISSION_EARNED', 'COMMISSION_REVERSED', 'MANUAL_CREDIT', 'MANUAL_DEBIT',
    'WITHDRAWAL_RESERVED', 'WITHDRAWAL_RELEASED', 'WITHDRAWAL_PAID'
  )),
  -- Signed effect on wallets.balance (the available-to-withdraw figure).
  amount numeric(14, 2) not null,
  -- Signed effect on wallets.reserved_balance (funds held for a
  -- withdrawal in flight). Zero for every non-withdrawal type.
  reserved_delta numeric(14, 2) not null default 0,
  reference_type text,
  reference_id uuid,
  description text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.affiliate_wallet_transactions is
  'Append-only ledger, mirroring inventory_transactions'' role for stock. balance = sum(amount); reserved_balance = sum(reserved_delta). A withdrawal request moves funds from balance into reserved_balance (amount -X, reserved_delta +X) without changing the affiliate''s total (balance+reserved) — see request_affiliate_withdrawal(). Rows are only ever inserted by public.credit_affiliate_wallet(); there is no client insert/update/delete policy.';

create index affiliate_wallet_transactions_wallet_id_idx on public.affiliate_wallet_transactions (wallet_id, created_at desc);
create index affiliate_wallet_transactions_affiliate_id_idx on public.affiliate_wallet_transactions (affiliate_id);
create index affiliate_wallet_transactions_reference_idx on public.affiliate_wallet_transactions (reference_type, reference_id);

alter table public.affiliate_wallet_transactions enable row level security;

create policy "select_affiliate_wallet_transactions" on public.affiliate_wallet_transactions
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'wallets.view')
  );

create or replace function public.apply_wallet_transaction_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.affiliate_wallets
    set balance = balance + new.amount,
        reserved_balance = reserved_balance + new.reserved_delta,
        updated_at = now()
    where id = new.wallet_id;
  return new;
end;
$$;

create trigger apply_affiliate_wallet_transaction
  after insert on public.affiliate_wallet_transactions
  for each row execute function public.apply_wallet_transaction_to_balance();


-- ---------------------------------------------------------------
-- credit_affiliate_wallet(): the single gateway every wallet-
-- affecting operation in this migration goes through (commission
-- award/reversal, manual credit/debit, withdrawal reserve/release/
-- paid) — exactly the adjust_inventory()-for-wallets equivalent.
-- Gets-or-creates the wallet, locks it FOR UPDATE (serializing
-- concurrent writers on the same affiliate — this is what makes
-- "simultaneous withdrawal requests" and "concurrent credit +
-- withdrawal" safe), then inserts the ledger row.
-- ---------------------------------------------------------------
create or replace function public.credit_affiliate_wallet(
  p_workspace_id uuid,
  p_affiliate_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_reserved_delta numeric,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_description text default null,
  p_currency_code text default 'NGN'
)
returns public.affiliate_wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.affiliate_wallets%rowtype;
  v_txn public.affiliate_wallet_transactions%rowtype;
begin
  insert into public.affiliate_wallets (workspace_id, affiliate_id, currency_code)
    values (p_workspace_id, p_affiliate_id, p_currency_code)
    on conflict (workspace_id, affiliate_id) do nothing;

  select * into v_wallet from public.affiliate_wallets
    where workspace_id = p_workspace_id and affiliate_id = p_affiliate_id
    for update;

  insert into public.affiliate_wallet_transactions (
    workspace_id, wallet_id, affiliate_id, transaction_type, amount, reserved_delta,
    reference_type, reference_id, description, created_by
  ) values (
    p_workspace_id, v_wallet.id, p_affiliate_id, p_transaction_type, p_amount, p_reserved_delta,
    p_reference_type, p_reference_id, p_description, auth.uid()
  )
  returning * into v_txn;

  return v_txn;
end;
$$;


-- ---------------------------------------------------------------
-- 6. Commission engine. process_affiliate_commission() is called
-- both from create_order() (for PER_ORDER_CREATED campaigns, right
-- after order_items and affiliate_campaign_id are resolved) and from
-- the orders AFTER UPDATE trigger below (for PER_DELIVERED_ORDER
-- campaigns, on the transition into DELIVERED). It re-reads
-- everything fresh from the database rather than trusting trigger
-- NEW/OLD state, which is what lets it be called defensively from
-- two different places and still be genuinely idempotent — the
-- unique constraint on affiliate_commissions is the actual guarantee,
-- this is just the calculation.
-- ---------------------------------------------------------------
create or replace function public.process_affiliate_commission(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_campaign public.affiliate_campaigns%rowtype;
  v_base numeric(14, 2);
  v_is_exception boolean;
  v_status text;
  v_amount numeric(14, 2);
  v_commission_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found or v_order.affiliate_id is null or v_order.affiliate_campaign_id is null then
    return;
  end if;

  select * into v_campaign from public.affiliate_campaigns
    where id = v_order.affiliate_campaign_id and deleted_at is null;
  if not found then
    return;
  end if;

  if v_campaign.qualifying_event = 'PER_DELIVERED_ORDER' and v_order.status <> 'DELIVERED' then
    return;
  end if;

  select coalesce(sum(oi.total_amount), 0) into v_base
    from public.order_items oi
    join public.affiliate_campaign_products cp on cp.product_id = oi.product_id and cp.campaign_id = v_campaign.id
    where oi.order_id = p_order_id;

  select exists(
    select 1 from public.affiliate_campaign_affiliates
    where campaign_id = v_campaign.id and affiliate_id = v_order.affiliate_id and relationship = 'COMMISSION_EXCEPTION'
  ) into v_is_exception;

  if v_is_exception then
    v_status := 'EXEMPT';
    v_amount := 0;
  else
    v_status := 'ELIGIBLE';
    v_amount := case
      when v_campaign.commission_type = 'FIXED_AMOUNT' then v_campaign.commission_value
      else round(v_base * v_campaign.commission_value / 100.0, 2)
    end;
  end if;

  insert into public.affiliate_commissions (
    workspace_id, campaign_id, affiliate_id, order_id, qualifying_event,
    commission_base_amount, commission_type, commission_value, commission_amount,
    currency_code, status
  ) values (
    v_order.workspace_id, v_campaign.id, v_order.affiliate_id, p_order_id, v_campaign.qualifying_event,
    v_base, v_campaign.commission_type, v_campaign.commission_value, v_amount,
    v_order.currency_code, v_status
  )
  on conflict (campaign_id, affiliate_id, order_id) do nothing
  returning id into v_commission_id;

  -- Already existed (a retry/duplicate call) — nothing further to do.
  if v_commission_id is null then
    return;
  end if;

  if v_status = 'ELIGIBLE' and v_amount > 0 then
    declare
      v_txn public.affiliate_wallet_transactions%rowtype;
    begin
      v_txn := public.credit_affiliate_wallet(
        v_order.workspace_id, v_order.affiliate_id, 'COMMISSION_EARNED', v_amount, 0,
        'commission', v_commission_id, 'Commission for order ' || v_order.order_number, v_order.currency_code
      );
      update public.affiliate_commissions set wallet_transaction_id = v_txn.id where id = v_commission_id;
    end;

    insert into public.notifications (workspace_id, brand_id, type, title, message, priority, link, metadata)
    values (
      v_order.workspace_id, v_order.brand_id, 'commission_earned', 'Commission earned',
      'A commission of ' || v_amount || ' ' || v_order.currency_code || ' was earned on order ' || v_order.order_number,
      'normal', '/affiliates/' || v_order.affiliate_id, jsonb_build_object('commission_id', v_commission_id, 'order_id', p_order_id)
    );
  end if;
end;
$$;

comment on function public.process_affiliate_commission(uuid) is
  'Idempotent: safe to call repeatedly for the same order (unique constraint on affiliate_commissions no-ops any retry). No-ops entirely if the order has no affiliate/campaign attribution, or if the campaign''s qualifying_event has not yet been met.';

create or replace function public.reverse_affiliate_commission(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission public.affiliate_commissions%rowtype;
  v_order public.orders%rowtype;
  v_txn public.affiliate_wallet_transactions%rowtype;
begin
  select * into v_commission from public.affiliate_commissions
    where order_id = p_order_id and status = 'ELIGIBLE'
    for update;
  if not found then
    return;
  end if;

  select * into v_order from public.orders where id = p_order_id;

  update public.affiliate_commissions
    set status = 'REVERSED', reversed_at = now(), reversed_reason = 'Order ' || v_order.status
    where id = v_commission.id;

  if v_commission.commission_amount > 0 then
    v_txn := public.credit_affiliate_wallet(
      v_commission.workspace_id, v_commission.affiliate_id, 'COMMISSION_REVERSED', -v_commission.commission_amount, 0,
      'commission_reversal', v_commission.id, 'Commission reversed: order ' || v_order.order_number || ' ' || v_order.status,
      v_commission.currency_code
    );
    update public.affiliate_commissions set reversal_wallet_transaction_id = v_txn.id where id = v_commission.id;
  end if;
end;
$$;

comment on function public.reverse_affiliate_commission(uuid) is
  'Idempotent: only acts on a commission still in ELIGIBLE status (FOR UPDATE-locked), so a duplicate CANCELLED/RETURNED trigger firing is a safe no-op. Only reachable for PER_ORDER_CREATED commissions in practice, since order_status_transitions has no outgoing edge from DELIVERED — a PER_DELIVERED_ORDER commission''s order can never subsequently become CANCELLED/RETURNED.';

create or replace function public.handle_affiliate_commission_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'DELIVERED' then
      perform public.process_affiliate_commission(new.id);
    elsif new.status in ('CANCELLED', 'RETURNED') then
      perform public.reverse_affiliate_commission(new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_affiliate_commission_effects
  after update on public.orders
  for each row execute function public.handle_affiliate_commission_effects();


-- ---------------------------------------------------------------
-- create_order(): 0022's signature plus one new trailing optional
-- parameter. A plain CREATE OR REPLACE with an appended parameter
-- does NOT replace the old function — Postgres identifies functions
-- by name + parameter TYPE LIST, so a 21-parameter signature is a
-- distinct overload from 0022's 20-parameter one, leaving both
-- defined and making every call site using named/positional-with-
-- defaults syntax ambiguous ("function ... is not unique"). The
-- explicit DROP is what makes this genuinely a replace, keeping the
-- single-entrypoint contract every prior phase relied on.
-- ---------------------------------------------------------------
drop function if exists public.create_order(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text
);

-- Resolves an affiliate from a referral code, then (once order_items
-- exist) resolves the best-matching ACTIVE campaign and fires the
-- commission engine for PER_ORDER_CREATED campaigns. Affiliate access
-- rules (ALL_APPROVED_AFFILIATES vs SELECTED_AFFILIATES_ONLY) are
-- enforced right here, server-side — an unauthorized affiliate/
-- campaign pairing simply never attributes, regardless of what the
-- client sends.
create or replace function public.create_order(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_source text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_items jsonb,
  p_customer_email text default null,
  p_customer_country_code text default null,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_address_2 text default null,
  p_customer_postal_code text default null,
  p_customer_notes text default null,
  p_shipping_fee numeric default 0,
  p_discount_amount numeric default 0,
  p_source_detail text default null,
  p_internal_notes text default null,
  p_priority text default 'normal',
  p_idempotency_key text default null,
  p_affiliate_referral_code text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_currency text;
  v_workspace_country text;
  v_dial_code text;
  v_order_number text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_is_repeat boolean;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_affiliate public.affiliates%rowtype;
  v_affiliate_id uuid;
  v_campaign_id uuid;
begin
  if not public.user_has_permission(p_workspace_id, 'orders.create') then
    raise exception 'insufficient_permission: orders.create required';
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'customer_name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'customer_phone is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'customer_address is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select currency_code, country_code into v_currency, v_workspace_country
    from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_workspace_country;

  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  if coalesce(trim(p_affiliate_referral_code), '') <> '' then
    select * into v_affiliate from public.affiliates
      where workspace_id = p_workspace_id and referral_code = upper(trim(p_affiliate_referral_code))
        and approval_status = 'approved' and status = 'active' and deleted_at is null;
    if found then
      v_affiliate_id := v_affiliate.id;
    end if;
  end if;

  select id into v_customer_id from public.customers
    where workspace_id = p_workspace_id and brand_id = p_brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, acquisition_source, created_by, updated_by
    ) values (
      p_workspace_id, p_brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      p_customer_email, v_workspace_country, p_customer_state, p_customer_city, trim(p_customer_address), p_source,
      auth.uid(), auth.uid()
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'quantity must be a positive integer for every order item';
    end if;

    select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid
        and workspace_id = p_workspace_id
        and brand_id = p_brand_id
        and deleted_at is null;
    if not found then
      raise exception 'Product % not found in this brand', v_item ->> 'product_id';
    end if;

    v_subtotal := v_subtotal + v_product.selling_price * v_quantity;
    v_cost := v_cost + coalesce(v_product.cost_price, 0) * v_quantity;
  end loop;

  v_total := v_subtotal + coalesce(p_shipping_fee, 0) - coalesce(p_discount_amount, 0);
  if v_total < 0 then
    raise exception 'Order total cannot be negative';
  end if;

  v_order_number := public.generate_order_number(p_workspace_id);

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2,
    customer_postal_code, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    source_detail, internal_notes, idempotency_key, is_repeat_customer,
    affiliate_id, affiliate_referral_code_used,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_order_number, p_source, 'NEW', coalesce(p_priority, 'normal'),
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), p_customer_email, p_customer_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2,
    p_customer_postal_code, p_customer_notes,
    v_currency, v_subtotal, coalesce(p_shipping_fee, 0), coalesce(p_discount_amount, 0), v_total,
    v_cost, v_subtotal - v_cost,
    p_source_detail, p_internal_notes, p_idempotency_key, v_is_repeat,
    v_affiliate_id, case when v_affiliate_id is not null then upper(trim(p_affiliate_referral_code)) else null end,
    auth.uid(), auth.uid()
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    insert into public.order_items (
      order_id, workspace_id, brand_id, product_id, product_name, sku,
      quantity, unit_price, unit_cost, compare_price, total_amount
    ) values (
      v_order.id, p_workspace_id, p_brand_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.selling_price, v_product.cost_price, v_product.compare_price, v_product.selling_price * v_quantity
    );

    if v_product.track_inventory then
      perform public.adjust_inventory(
        v_product.id, 'RESERVED', v_quantity,
        'Order ' || v_order_number || ' created', 'order', v_order.id
      );
    end if;
  end loop;

  -- Affiliate campaign resolution: only once order_items exist (need
  -- the ordered product set). ALL_APPROVED_AFFILIATES campaigns
  -- accept any approved+active affiliate; SELECTED_AFFILIATES_ONLY
  -- campaigns require an explicit ACCESS grant for this affiliate.
  -- Most recently created matching ACTIVE campaign wins on overlap.
  if v_affiliate_id is not null then
    select c.id into v_campaign_id
      from public.affiliate_campaigns c
      where c.workspace_id = p_workspace_id
        and c.brand_id = p_brand_id
        and c.status = 'ACTIVE'
        and c.deleted_at is null
        and (c.start_at is null or c.start_at <= now())
        and (c.end_at is null or c.end_at >= now())
        and (
          c.affiliate_access = 'ALL_APPROVED_AFFILIATES'
          or exists (
            select 1 from public.affiliate_campaign_affiliates ca
            where ca.campaign_id = c.id and ca.affiliate_id = v_affiliate_id and ca.relationship = 'ACCESS'
          )
        )
        and exists (
          select 1 from public.affiliate_campaign_products cp
          join public.order_items oi on oi.product_id = cp.product_id
          where cp.campaign_id = c.id and oi.order_id = v_order.id
        )
      order by c.created_at desc
      limit 1;

    if v_campaign_id is not null then
      update public.orders set affiliate_campaign_id = v_campaign_id where id = v_order.id
        returning * into v_order;

      perform public.process_affiliate_commission(v_order.id);
    end if;
  end if;

  return v_order;
end;
$$;

comment on function public.create_order(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text
) is
  'The only way to create an order. Prices/costs are always read from the live products row server-side. Finds-or-creates the ordering customer by canonical phone and links order.customer_id. Snapshots order_items.unit_cost for Product Performance COGS attribution. Resolves an optional affiliate referral code and, once order_items exist, the best-matching ACTIVE campaign — firing the commission engine immediately for PER_ORDER_CREATED campaigns.';


-- ---------------------------------------------------------------
-- 7. Manual affiliate wallet credit/debit — transactional,
-- permissioned, audited (a dedicated audit_logs row, not just the
-- ledger row itself, since this is a manual override worth its own
-- explicit trail).
-- ---------------------------------------------------------------
create or replace function public.create_manual_wallet_transaction(
  p_affiliate_id uuid,
  p_amount numeric,
  p_reason text
)
returns public.affiliate_wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_type text;
  v_txn public.affiliate_wallet_transactions%rowtype;
begin
  select * into v_affiliate from public.affiliates where id = p_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Affiliate not found';
  end if;
  if not public.user_has_permission(v_affiliate.workspace_id, 'wallets.manage') then
    raise exception 'insufficient_permission: wallets.manage required';
  end if;
  if p_amount = 0 then
    raise exception 'amount must be non-zero';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason is required for a manual wallet transaction';
  end if;

  v_type := case when p_amount > 0 then 'MANUAL_CREDIT' else 'MANUAL_DEBIT' end;

  v_txn := public.credit_affiliate_wallet(
    v_affiliate.workspace_id, p_affiliate_id, v_type, p_amount, 0, 'manual', null, p_reason
  );

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (
    v_affiliate.workspace_id, null, auth.uid(), 'wallets', 'create', 'affiliate_wallet_transaction', v_txn.id,
    jsonb_build_object('affiliate_id', p_affiliate_id, 'amount', p_amount, 'reason', p_reason)
  );

  return v_txn;
end;
$$;

comment on function public.create_manual_wallet_transaction(uuid, numeric, text) is
  'Positive amount = manual credit, negative = manual debit. Always requires a reason and wallets.manage. Goes through credit_affiliate_wallet(), so it is subject to the same row-locked, ledger-derived balance as every other wallet mutation.';


-- ---------------------------------------------------------------
-- 8. Withdrawals — reservation/release semantics. A withdrawal
-- request immediately moves funds from balance into reserved_balance
-- (never merely "checked"), which is what makes two concurrent
-- withdrawal requests for the same affiliate structurally unable to
-- both succeed past their combined balance: the second request's
-- FOR UPDATE-locked balance check runs after the first's reservation
-- has already been applied.
-- ---------------------------------------------------------------
create table public.affiliate_withdrawals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency_code text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'PAID')),
  payout_method jsonb not null default '{}'::jsonb,
  note text,

  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users (id),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  rejection_reason text,
  paid_at timestamptz,
  paid_by uuid references auth.users (id),
  payment_reference text,

  reserve_transaction_id uuid references public.affiliate_wallet_transactions (id),
  release_transaction_id uuid references public.affiliate_wallet_transactions (id),
  paid_transaction_id uuid references public.affiliate_wallet_transactions (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index affiliate_withdrawals_workspace_id_idx on public.affiliate_withdrawals (workspace_id, status);
create index affiliate_withdrawals_affiliate_id_idx on public.affiliate_withdrawals (affiliate_id);

create trigger set_affiliate_withdrawals_updated_at
  before update on public.affiliate_withdrawals
  for each row execute function public.set_updated_at();

alter table public.affiliate_withdrawals enable row level security;

create policy "select_affiliate_withdrawals" on public.affiliate_withdrawals
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'withdrawals.view')
  );

-- No client insert/update policy — every row and every status
-- transition goes through the RPCs below.

create or replace function public.log_withdrawal_audit_event()
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
  else
    v_action := 'status_change';
  end if;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    new.workspace_id, null, auth.uid(), 'withdrawals', v_action, 'affiliate_withdrawal', new.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new)
  );

  return new;
end;
$$;

create trigger audit_affiliate_withdrawals
  after insert or update on public.affiliate_withdrawals
  for each row execute function public.log_withdrawal_audit_event();


create or replace function public.request_affiliate_withdrawal(
  p_affiliate_id uuid,
  p_amount numeric,
  p_note text default null
)
returns public.affiliate_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_wallet public.affiliate_wallets%rowtype;
  v_txn public.affiliate_wallet_transactions%rowtype;
  v_withdrawal public.affiliate_withdrawals%rowtype;
begin
  select * into v_affiliate from public.affiliates where id = p_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Affiliate not found';
  end if;
  if not public.user_has_permission(v_affiliate.workspace_id, 'withdrawals.create') then
    raise exception 'insufficient_permission: withdrawals.create required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into public.affiliate_wallets (workspace_id, affiliate_id, currency_code)
    values (v_affiliate.workspace_id, p_affiliate_id, 'NGN')
    on conflict (workspace_id, affiliate_id) do nothing;

  -- Locks the wallet row for the remainder of this transaction —
  -- the actual guarantee behind "never allow withdrawal > available
  -- balance" and "never allow two concurrent requests to both clear".
  select * into v_wallet from public.affiliate_wallets
    where workspace_id = v_affiliate.workspace_id and affiliate_id = p_affiliate_id
    for update;

  if v_wallet.balance < p_amount then
    raise exception 'Insufficient balance: available % < requested %', v_wallet.balance, p_amount;
  end if;

  v_txn := public.credit_affiliate_wallet(
    v_affiliate.workspace_id, p_affiliate_id, 'WITHDRAWAL_RESERVED', -p_amount, p_amount,
    'withdrawal', null, 'Withdrawal requested', v_wallet.currency_code
  );

  insert into public.affiliate_withdrawals (
    workspace_id, affiliate_id, amount, currency_code, payout_method, note,
    requested_by, reserve_transaction_id
  ) values (
    v_affiliate.workspace_id, p_affiliate_id, p_amount, v_wallet.currency_code, v_affiliate.payout_method, p_note,
    auth.uid(), v_txn.id
  )
  returning * into v_withdrawal;

  update public.affiliate_wallet_transactions set reference_id = v_withdrawal.id where id = v_txn.id;

  return v_withdrawal;
end;
$$;

create or replace function public.approve_affiliate_withdrawal(p_withdrawal_id uuid)
returns public.affiliate_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal public.affiliate_withdrawals%rowtype;
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

  update public.affiliate_withdrawals
    set status = 'APPROVED', reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_withdrawal_id
    returning * into v_withdrawal;

  return v_withdrawal;
end;
$$;

create or replace function public.reject_affiliate_withdrawal(p_withdrawal_id uuid, p_reason text)
returns public.affiliate_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal public.affiliate_withdrawals%rowtype;
  v_txn public.affiliate_wallet_transactions%rowtype;
begin
  select * into v_withdrawal from public.affiliate_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Withdrawal not found';
  end if;
  if not public.user_has_permission(v_withdrawal.workspace_id, 'withdrawals.approve') then
    raise exception 'insufficient_permission: withdrawals.approve required';
  end if;
  if v_withdrawal.status not in ('PENDING', 'APPROVED') then
    raise exception 'Only a pending or approved withdrawal can be rejected';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'rejection_reason is required';
  end if;

  -- Release the reservation: funds return to available balance.
  v_txn := public.credit_affiliate_wallet(
    v_withdrawal.workspace_id, v_withdrawal.affiliate_id, 'WITHDRAWAL_RELEASED', v_withdrawal.amount, -v_withdrawal.amount,
    'withdrawal', v_withdrawal.id, 'Withdrawal rejected: ' || p_reason, v_withdrawal.currency_code
  );

  update public.affiliate_withdrawals
    set status = 'REJECTED', reviewed_at = now(), reviewed_by = auth.uid(),
        rejection_reason = p_reason, release_transaction_id = v_txn.id
    where id = p_withdrawal_id
    returning * into v_withdrawal;

  return v_withdrawal;
end;
$$;

create or replace function public.mark_affiliate_withdrawal_paid(p_withdrawal_id uuid, p_payment_reference text default null)
returns public.affiliate_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal public.affiliate_withdrawals%rowtype;
  v_txn public.affiliate_wallet_transactions%rowtype;
begin
  select * into v_withdrawal from public.affiliate_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Withdrawal not found';
  end if;
  if not public.user_has_permission(v_withdrawal.workspace_id, 'withdrawals.manage') then
    raise exception 'insufficient_permission: withdrawals.manage required';
  end if;
  -- Only reachable from APPROVED — once PAID, this WHERE clause can
  -- never match again, which is the actual "never double-payout"
  -- guarantee, not just a UI disabled-state.
  if v_withdrawal.status <> 'APPROVED' then
    raise exception 'Only an approved withdrawal can be marked paid';
  end if;

  -- Funds already left available balance at request time; paying out
  -- only clears the reservation, no further balance change.
  v_txn := public.credit_affiliate_wallet(
    v_withdrawal.workspace_id, v_withdrawal.affiliate_id, 'WITHDRAWAL_PAID', 0, -v_withdrawal.amount,
    'withdrawal', v_withdrawal.id, 'Withdrawal paid' || coalesce(': ' || p_payment_reference, ''), v_withdrawal.currency_code
  );

  update public.affiliate_withdrawals
    set status = 'PAID', paid_at = now(), paid_by = auth.uid(),
        payment_reference = p_payment_reference, paid_transaction_id = v_txn.id
    where id = p_withdrawal_id
    returning * into v_withdrawal;

  insert into public.notifications (workspace_id, brand_id, type, title, message, priority, link, metadata)
  values (
    v_withdrawal.workspace_id, null, 'withdrawal_paid', 'Withdrawal paid',
    v_withdrawal.amount || ' ' || v_withdrawal.currency_code || ' withdrawal paid out.', 'normal',
    '/affiliates/withdrawals', jsonb_build_object('withdrawal_id', v_withdrawal.id, 'affiliate_id', v_withdrawal.affiliate_id)
  );

  return v_withdrawal;
end;
$$;


-- ---------------------------------------------------------------
-- 9. Ad Cost Management. COD-correct terminology: initial_cost_per_
-- order / delivered_cost_per_order are computed in the reporting
-- RPC below, never labeled "CPC" (which implies per-click, not
-- per-order — misleading for a COD business where clicks don't
-- convert 1:1 with orders, let alone deliveries). Only APPROVED rows
-- feed get_ad_cost_summary()/reports.
-- ---------------------------------------------------------------
create table public.ad_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  campaign_id uuid references public.affiliate_campaigns (id) on delete set null,
  affiliate_id uuid references public.affiliates (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,

  period_start date not null,
  period_end date not null,
  initial_cost_amount numeric(14, 2) not null check (initial_cost_amount >= 0),
  initial_orders_count integer not null default 0 check (initial_orders_count >= 0),
  delivered_orders_count integer check (delivered_orders_count is null or delivered_orders_count >= 0),
  currency_code text not null,

  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  notes text,
  submitted_by uuid references auth.users (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

comment on table public.ad_costs is
  'initial_cost_amount / initial_orders_count = "Initial Cost/Order" (cost per order created); initial_cost_amount / delivered_orders_count = "Delivered Cost/Order" (cost per order actually delivered) — both computed at read time in get_ad_cost_summary(), never stored, and never called "CPC" (that implies per-click, which is not what a COD business should optimize toward). Only status=APPROVED rows are included in any summary/report.';

create index ad_costs_workspace_id_idx on public.ad_costs (workspace_id, status);
create index ad_costs_brand_id_idx on public.ad_costs (brand_id);
create index ad_costs_campaign_id_idx on public.ad_costs (campaign_id) where campaign_id is not null;

create trigger set_ad_costs_updated_at
  before update on public.ad_costs
  for each row execute function public.set_updated_at();

-- Dedicated audit trigger, NOT the generic log_audit_event(): that
-- function's CASE expression unconditionally references new.deleted_at
-- (a column products/categories/landing_pages all happen to have),
-- which raises for any table's record type that lacks it — ad_costs
-- has no soft-delete column, so it needs its own small trigger,
-- exactly the same reason affiliates/workspaces got dedicated ones.
create or replace function public.log_ad_cost_audit_event()
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
  else
    v_action := case when new.status is distinct from old.status then 'status_change' else 'update' end;
  end if;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    new.workspace_id, new.brand_id, auth.uid(), 'ad_costs', v_action, 'ad_cost', new.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new)
  );

  return new;
end;
$$;

create trigger audit_ad_costs
  after insert or update on public.ad_costs
  for each row execute function public.log_ad_cost_audit_event();

alter table public.ad_costs enable row level security;

create policy "select_ad_costs" on public.ad_costs
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'ad_costs.view')
  );

create policy "insert_ad_costs" on public.ad_costs
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'ad_costs.create')
    and status = 'PENDING'
  );

create policy "update_ad_costs" on public.ad_costs
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and status = 'PENDING'
    and (public.user_has_permission(workspace_id, 'ad_costs.create') or public.user_has_permission(workspace_id, 'ad_costs.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'ad_costs.create') or public.user_has_permission(workspace_id, 'ad_costs.manage'))
  );

-- Approval/rejection is a separate, explicitly-gated RPC (ad_costs.approve)
-- rather than folded into the general update policy above — the same
-- separation-of-duties shape as withdrawals.
create or replace function public.approve_ad_cost(p_ad_cost_id uuid)
returns public.ad_costs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_cost public.ad_costs%rowtype;
begin
  select * into v_ad_cost from public.ad_costs where id = p_ad_cost_id and status = 'PENDING' for update;
  if not found then
    raise exception 'Ad cost entry not found or not pending';
  end if;
  if not public.user_has_permission(v_ad_cost.workspace_id, 'ad_costs.approve') then
    raise exception 'insufficient_permission: ad_costs.approve required';
  end if;

  update public.ad_costs
    set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_ad_cost_id
    returning * into v_ad_cost;

  return v_ad_cost;
end;
$$;

create or replace function public.reject_ad_cost(p_ad_cost_id uuid, p_reason text)
returns public.ad_costs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_cost public.ad_costs%rowtype;
begin
  select * into v_ad_cost from public.ad_costs where id = p_ad_cost_id and status = 'PENDING' for update;
  if not found then
    raise exception 'Ad cost entry not found or not pending';
  end if;
  if not public.user_has_permission(v_ad_cost.workspace_id, 'ad_costs.approve') then
    raise exception 'insufficient_permission: ad_costs.approve required';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'rejection_reason is required';
  end if;

  update public.ad_costs
    set status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
    where id = p_ad_cost_id
    returning * into v_ad_cost;

  return v_ad_cost;
end;
$$;


-- ---------------------------------------------------------------
-- 10. Analytics/Reports RPCs. Shared visibility gate mirrors
-- user_has_finance_visibility() from 0023 — every one of these is
-- surfaced by both the light Affiliate/Campaign Analytics views and
-- the Reports module extension, so the gate covers every module that
-- legitimately shows these figures.
-- ---------------------------------------------------------------
create or replace function public.user_has_affiliate_visibility(p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select public.user_has_permission(p_workspace_id, 'affiliates.view')
      or public.user_has_permission(p_workspace_id, 'campaigns.view')
      or public.user_has_permission(p_workspace_id, 'affiliate_reports.view');
$$;

create or replace function public.get_affiliate_performance(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  affiliate_id uuid,
  affiliate_name text,
  referral_code text,
  total_orders bigint,
  delivered_orders bigint,
  delivered_revenue numeric,
  total_commission_earned numeric,
  total_commission_reversed numeric,
  net_commission numeric,
  wallet_balance numeric,
  wallet_reserved_balance numeric
)
language sql
stable
as $$
  select
    a.id,
    a.full_name,
    a.referral_code,
    count(distinct o.id) filter (where o.id is not null),
    count(distinct o.id) filter (where o.status = 'DELIVERED' and o.cash_collection_status = 'collected'),
    coalesce(sum(o.total_amount) filter (where o.status = 'DELIVERED' and o.cash_collection_status = 'collected'), 0),
    coalesce(sum(c.commission_amount) filter (where c.status = 'ELIGIBLE'), 0),
    coalesce(sum(c.commission_amount) filter (where c.status = 'REVERSED'), 0),
    coalesce(sum(c.commission_amount) filter (where c.status = 'ELIGIBLE'), 0) - coalesce(sum(c.commission_amount) filter (where c.status = 'REVERSED'), 0),
    coalesce(w.balance, 0),
    coalesce(w.reserved_balance, 0)
  from public.affiliates a
  left join public.orders o
    on o.affiliate_id = a.id and o.deleted_at is null
    and (p_brand_id is null or o.brand_id = p_brand_id)
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at <= p_date_to)
  left join public.affiliate_commissions c on c.affiliate_id = a.id and c.order_id = o.id
  left join public.affiliate_wallets w on w.affiliate_id = a.id and w.workspace_id = a.workspace_id
  where a.workspace_id = p_workspace_id
    and a.deleted_at is null
    and public.user_has_affiliate_visibility(p_workspace_id)
  group by a.id, a.full_name, a.referral_code, w.balance, w.reserved_balance
  order by 6 desc nulls last;
$$;

comment on function public.get_affiliate_performance(uuid, uuid, timestamptz, timestamptz) is
  'delivered_revenue reuses the exact Phase 4 definition (status=DELIVERED and cash_collection_status=collected). net_commission = ELIGIBLE minus REVERSED — EXEMPT commissions are intentionally excluded from both sums (they carry zero commission_amount by construction).';

create or replace function public.get_campaign_performance(
  p_workspace_id uuid,
  p_brand_id uuid default null
)
returns table (
  campaign_id uuid,
  campaign_name text,
  status text,
  total_orders bigint,
  delivered_orders bigint,
  delivered_revenue numeric,
  total_commission_paid numeric,
  approved_ad_cost numeric,
  initial_orders_for_ad_cost bigint,
  delivered_orders_for_ad_cost bigint
)
language sql
stable
as $$
  with campaign_orders as (
    select
      c.id as campaign_id, c.name, c.status,
      count(distinct o.id) as total_orders,
      count(distinct o.id) filter (where o.status = 'DELIVERED' and o.cash_collection_status = 'collected') as delivered_orders,
      coalesce(sum(o.total_amount) filter (where o.status = 'DELIVERED' and o.cash_collection_status = 'collected'), 0) as delivered_revenue
    from public.affiliate_campaigns c
    left join public.orders o on o.affiliate_campaign_id = c.id and o.deleted_at is null
    where c.workspace_id = p_workspace_id and c.deleted_at is null
      and (p_brand_id is null or c.brand_id = p_brand_id)
    group by c.id, c.name, c.status
  ),
  campaign_commissions as (
    select campaign_id, coalesce(sum(commission_amount) filter (where status = 'ELIGIBLE'), 0)
        - coalesce(sum(commission_amount) filter (where status = 'REVERSED'), 0) as net_commission
    from public.affiliate_commissions
    group by campaign_id
  ),
  campaign_ad_costs as (
    select campaign_id, coalesce(sum(initial_cost_amount), 0) as approved_ad_cost,
      coalesce(sum(initial_orders_count), 0) as initial_orders, coalesce(sum(delivered_orders_count), 0) as delivered_orders
    from public.ad_costs
    where status = 'APPROVED'
    group by campaign_id
  )
  select
    co.campaign_id, co.name, co.status, co.total_orders, co.delivered_orders, co.delivered_revenue,
    coalesce(cc.net_commission, 0), coalesce(ca.approved_ad_cost, 0),
    coalesce(ca.initial_orders, 0), coalesce(ca.delivered_orders, 0)
  from campaign_orders co
  left join campaign_commissions cc on cc.campaign_id = co.campaign_id
  left join campaign_ad_costs ca on ca.campaign_id = co.campaign_id
  where public.user_has_affiliate_visibility(p_workspace_id)
  order by co.delivered_revenue desc nulls last;
$$;

create or replace function public.get_product_affiliate_performance(
  p_workspace_id uuid,
  p_brand_id uuid default null
)
returns table (
  product_id uuid,
  product_name text,
  campaign_id uuid,
  campaign_name text,
  delivered_orders bigint,
  delivered_revenue numeric,
  total_commission_paid numeric
)
language sql
stable
as $$
  select
    p.id, p.name, c.id, c.name,
    count(distinct oi.order_id) filter (where o.status = 'DELIVERED' and o.cash_collection_status = 'collected'),
    coalesce(sum(oi.total_amount) filter (where o.status = 'DELIVERED' and o.cash_collection_status = 'collected'), 0),
    coalesce(sum(com.commission_amount) filter (where com.status = 'ELIGIBLE'), 0) - coalesce(sum(com.commission_amount) filter (where com.status = 'REVERSED'), 0)
  from public.affiliate_campaign_products cp
  join public.affiliate_campaigns c on c.id = cp.campaign_id
  join public.products p on p.id = cp.product_id
  left join public.order_items oi on oi.product_id = p.id
  left join public.orders o on o.id = oi.order_id and o.affiliate_campaign_id = c.id and o.deleted_at is null
  left join public.affiliate_commissions com on com.order_id = o.id and com.campaign_id = c.id
  where c.workspace_id = p_workspace_id and c.deleted_at is null
    and (p_brand_id is null or c.brand_id = p_brand_id)
    and public.user_has_affiliate_visibility(p_workspace_id)
  group by p.id, p.name, c.id, c.name
  order by 6 desc nulls last;
$$;

create or replace function public.get_ad_cost_summary(
  p_workspace_id uuid,
  p_brand_id uuid default null
)
returns table (
  id uuid,
  campaign_id uuid,
  campaign_name text,
  affiliate_id uuid,
  affiliate_name text,
  product_id uuid,
  product_name text,
  period_start date,
  period_end date,
  initial_cost_amount numeric,
  initial_orders_count integer,
  delivered_orders_count integer,
  initial_cost_per_order numeric,
  delivered_cost_per_order numeric,
  currency_code text,
  status text
)
language sql
stable
as $$
  select
    ac.id, ac.campaign_id, c.name, ac.affiliate_id, a.full_name, ac.product_id, p.name,
    ac.period_start, ac.period_end, ac.initial_cost_amount, ac.initial_orders_count, ac.delivered_orders_count,
    case when ac.initial_orders_count > 0 then round(ac.initial_cost_amount / ac.initial_orders_count, 2) else null end,
    case when coalesce(ac.delivered_orders_count, 0) > 0 then round(ac.initial_cost_amount / ac.delivered_orders_count, 2) else null end,
    ac.currency_code, ac.status
  from public.ad_costs ac
  left join public.affiliate_campaigns c on c.id = ac.campaign_id
  left join public.affiliates a on a.id = ac.affiliate_id
  left join public.products p on p.id = ac.product_id
  where ac.workspace_id = p_workspace_id
    and (p_brand_id is null or ac.brand_id = p_brand_id)
    and ac.status = 'APPROVED'
    and public.user_has_permission(p_workspace_id, 'ad_costs.view')
  order by ac.period_start desc;
$$;

comment on function public.get_ad_cost_summary(uuid, uuid) is
  '"Initial Cost/Order" and "Delivered Cost/Order" — deliberately not "CPC", which implies per-click and would misstate what a COD business should be optimizing against. Only APPROVED entries are ever included.';
