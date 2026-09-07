-- ============================================================
-- GOLDEN COMMERCE OS — Migration 0039
-- Platform billing: subscription plans, tenant subscriptions,
-- payment methods, manual crypto payments, platform admin,
-- feature entitlements, and platform-wide (homepage) settings.
-- ============================================================
--
-- AUDIT SUMMARY (performed before writing any code this phase):
--
-- Two full read-only audits confirmed the existing system has NO
-- outstanding exploitable vulnerabilities to fix:
--   * All 159 SECURITY DEFINER functions across 0001-0038 already set
--     search_path = public (no privilege-escalation-via-search-path).
--   * Every financial value (order price, affiliate commission,
--     withdrawal amount) is derived/validated server-side from a
--     trusted source, never trusted from the client, with the sole
--     documented exception of ad_costs.initial_cost_amount, which has
--     no canonical source of truth by design and is mitigated by a
--     separate approval permission (ad_costs.approve) before it feeds
--     any report.
--   * Every queue-claim / approval RPC already uses `for update` or
--     `for update skip locked` correctly — no double-processing gap.
--   * The one existing `grant execute ... to anon` (a read-only
--     tracking-status lookup) is safe; the one anon-callable
--     financial mutation (create_public_order) has no client-supplied
--     price and is workspace/brand-scoped from the resolved page.
--
-- This migration therefore introduces NEW infrastructure only — it
-- does not patch a hole in existing code. Every new financial/state
-- mutation below follows the exact patterns the audit found already
-- proven safe elsewhere in this codebase:
--   * Row-locking (`for update`) + a status re-check after the lock,
--     exactly like approve_affiliate_withdrawal/approve_ad_cost (0024).
--   * A fail-closed, RLS-enabled table with a permission-gated
--     SECURITY DEFINER read/write RPC — mirroring
--     brand_communication_secrets (0032) — for anything sensitive.
--   * A dedicated audit-trigger function (not the generic
--     log_audit_event(), which unconditionally reads new.brand_id —
--     these tables are workspace- or platform-scoped, not
--     brand-scoped) — mirroring log_ad_cost_audit_event (0024).
--
-- NEW CONCEPT — platform admin: this codebase has no "super admin"
-- above the workspace-scoped `owner` role (confirmed: zero references
-- to a hardcoded owner-role gate anywhere in the frontend — access is
-- uniformly permission-slug-based). Billing plans, payment-method
-- configuration, and the public homepage are platform-wide concepts
-- that do not belong to any single tenant workspace, so a NEW,
-- narrow, cross-cutting `profiles.is_platform_admin` flag is added —
-- deliberately NOT reusing the `owner` role, since being Owner of one
-- workspace must never grant authority over another tenant's billing
-- or the shared public homepage. No RPC can set this flag on the
-- caller's own row (that would be a privilege-escalation hole) — see
-- the deployment notes at the end of this migration for how the first
-- platform admin is provisioned.
-- ============================================================

-- ============================================================
-- PART A — Platform admin
-- ============================================================

alter table public.profiles
  add column is_platform_admin boolean not null default false;

comment on column public.profiles.is_platform_admin is
  'Cross-workspace GCOS platform administrator — distinct from the workspace-scoped "owner" role. Governs billing plans, payment-method/crypto configuration, and the public homepage, none of which belong to any single tenant workspace. No RPC may set this on the caller''s own row; it is provisioned by a database administrator directly (see migration 0039 deployment notes).';

create or replace function public.user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid() and deleted_at is null),
    false
  );
$$;

comment on function public.user_is_platform_admin() is
  'Whether the current authenticated user is a GCOS platform administrator. The authorization boundary for every platform-level table/RPC in this migration (subscription_plans, payment_methods_config, crypto_payment_configs, platform_settings, and cross-tenant billing review).';

-- ============================================================
-- PART B — Subscription plans (platform-managed, tenant-readable)
-- ============================================================

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  monthly_price numeric(12, 2) not null default 0 check (monthly_price >= 0),
  annual_price numeric(12, 2) check (annual_price is null or annual_price >= 0),
  currency_code text not null default 'USD',
  trial_days integer not null default 0 check (trial_days >= 0),
  max_orders integer check (max_orders is null or max_orders > 0),
  max_staff integer check (max_staff is null or max_staff > 0),
  max_warehouses integer check (max_warehouses is null or max_warehouses > 0),
  max_brands integer check (max_brands is null or max_brands > 0),
  max_landing_pages integer check (max_landing_pages is null or max_landing_pages > 0),
  entitlements jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_public boolean not null default true,
  is_popular boolean not null default false,
  is_custom_pricing boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table public.subscription_plans is
  'GCOS platform subscription plans (Starter/Growth/Scale are default SEED data, not hardcoded names — fully editable/creatable via Settings → Billing by a platform admin). NULL on any max_* column means unlimited. entitlements is a flat jsonb of boolean/numeric feature flags (e.g. automation_enabled, advanced_reports, api_access) read by get_workspace_entitlements().';

comment on column public.subscription_plans.entitlements is
  'Flat jsonb feature-flag map, e.g. {"automation_enabled": true, "advanced_reports": false, "api_access": false}. Centralized entitlement source read via get_workspace_entitlements() rather than scattered plan checks.';

create index subscription_plans_active_public_idx on public.subscription_plans (is_active, is_public, sort_order);

create trigger set_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;

-- Public pricing must be visible on the anonymous homepage, and to
-- every authenticated tenant choosing a plan — but only active,
-- public rows. Full visibility (including inactive/private/custom
-- draft plans) is platform-admin only.
create policy "select_public_subscription_plans" on public.subscription_plans
  for select to anon, authenticated
  using (is_active and is_public);

create policy "select_all_subscription_plans_platform_admin" on public.subscription_plans
  for select to authenticated
  using (public.user_is_platform_admin());

-- No direct insert/update/delete policy: all writes go through
-- upsert_subscription_plan()/set_subscription_plan_active() below,
-- which enforce user_is_platform_admin() and write the audit trail —
-- mirroring the fail-closed-by-default-then-RPC-gated pattern used
-- for brand_communication_secrets (0032).

create or replace function public.log_billing_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text := TG_ARGV[0];
  v_entity_type text := TG_ARGV[1];
  v_workspace_id uuid;
  v_action text;
  v_row record;
begin
  v_row := coalesce(new, old);
  -- Platform-level tables (plans/payment methods/crypto config/settings)
  -- have no workspace_id at all; tenant-level tables (subscriptions,
  -- payments) do. `to_jsonb(v_row) ->> 'workspace_id'` reads it only
  -- when the column exists, staying null (a legitimate, documented
  -- audit_logs value — see 0007) otherwise.
  v_workspace_id := nullif(to_jsonb(v_row) ->> 'workspace_id', '')::uuid;

  if TG_OP = 'INSERT' then
    v_action := 'create';
  elsif TG_OP = 'DELETE' then
    v_action := 'delete';
  else
    v_action := case when to_jsonb(new) ->> 'status' is distinct from to_jsonb(old) ->> 'status' then 'status_change' else 'update' end;
  end if;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    v_workspace_id, null, auth.uid(), v_module, v_action, v_entity_type, v_row.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return v_row;
end;
$$;

comment on function public.log_billing_audit_event() is
  'Dedicated audit trigger for platform/billing tables — mirrors log_ad_cost_audit_event (0024) rather than the generic log_audit_event(), because these tables are workspace-scoped-or-platform-scoped, never brand-scoped, so the generic trigger''s unconditional new.brand_id read would fail. Takes (module, entity_type) as TG_ARGV. Never logs secret/wallet values beyond what the row itself already exposes (crypto wallet addresses are display data, not secrets — see PART E).';

create trigger audit_subscription_plans
  after insert or update or delete on public.subscription_plans
  for each row execute function public.log_billing_audit_event('billing', 'subscription_plan');

-- ============================================================
-- PART C — Tenant subscriptions (one current row per workspace)
-- ============================================================

create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status text not null default 'TRIALING'
    check (status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'EXPIRED')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annual')),
  -- Snapshotted at subscribe/renewal time — NEVER re-derived from the
  -- (mutable) plan row, so a later price change never silently
  -- rewrites a tenant's already-agreed amount.
  amount numeric(12, 2) not null check (amount >= 0),
  currency_code text not null,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  renewal_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  payment_provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table public.tenant_subscriptions is
  'The single authoritative, server-derived subscription record per workspace. amount/currency_code are snapshotted, not recomputed from subscription_plans, so historical billing is never silently rewritten by a later plan-price edit. Written only via subscribe_to_plan()/review_tenant_payment()/cancel_tenant_subscription() — no direct client insert/update policy exists.';

create index tenant_subscriptions_status_idx on public.tenant_subscriptions (status);
create index tenant_subscriptions_renewal_at_idx on public.tenant_subscriptions (renewal_at) where status = 'ACTIVE';

create trigger set_tenant_subscriptions_updated_at
  before update on public.tenant_subscriptions
  for each row execute function public.set_updated_at();

alter table public.tenant_subscriptions enable row level security;

create policy "select_own_tenant_subscription" on public.tenant_subscriptions
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'billing.view')
  );

create policy "select_all_tenant_subscriptions_platform_admin" on public.tenant_subscriptions
  for select to authenticated
  using (public.user_is_platform_admin());

create trigger audit_tenant_subscriptions
  after insert or update on public.tenant_subscriptions
  for each row execute function public.log_billing_audit_event('billing', 'tenant_subscription');

-- ============================================================
-- PART D — Payment methods (platform-configured, which are enabled)
-- ============================================================

create table public.payment_methods_config (
  id uuid primary key default gen_random_uuid(),
  method_type text not null check (method_type in ('card', 'bank_transfer', 'gateway', 'crypto', 'manual')),
  display_label text not null,
  is_active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table public.payment_methods_config is
  'Which payment methods GCOS currently accepts for tenant subscriptions, platform-admin-configured. `config` is non-secret display/behavior config (e.g. a gateway provider name to route to) — actual provider API keys, if a gateway is ever wired up, belong in a secrets table following the brand_communication_secrets (0032) fail-closed pattern, not here. card/bank_transfer/gateway ship inactive by default (NOT CONFIGURED) — this migration does not fabricate a working payment gateway integration.';

create index payment_methods_config_active_idx on public.payment_methods_config (is_active, sort_order);

create trigger set_payment_methods_config_updated_at
  before update on public.payment_methods_config
  for each row execute function public.set_updated_at();

alter table public.payment_methods_config enable row level security;

create policy "select_active_payment_methods" on public.payment_methods_config
  for select to anon, authenticated
  using (is_active);

create policy "select_all_payment_methods_platform_admin" on public.payment_methods_config
  for select to authenticated
  using (public.user_is_platform_admin());

create trigger audit_payment_methods_config
  after insert or update or delete on public.payment_methods_config
  for each row execute function public.log_billing_audit_event('billing', 'payment_method_config');

-- ============================================================
-- PART E — Crypto payment configuration (manual, admin-confirmed)
-- ============================================================

create table public.crypto_payment_configs (
  id uuid primary key default gen_random_uuid(),
  currency_code text not null,
  network text not null,
  wallet_address text not null,
  display_label text,
  payment_instructions text,
  confirmation_requirements text,
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  unique (currency_code, network)
);

comment on table public.crypto_payment_configs is
  'Manual crypto payment destinations (e.g. USDT/TRC20), platform-admin-configured. A wallet address is display data shown to a paying tenant, not a secret — no private key is ever stored (none is needed for this receive-only model) — so this table is RLS-readable, unlike brand_communication_secrets. Multiple networks are supported by design (TRC20/ERC20/BEP20/...); nothing assumes a single network. Submitting a tx reference here NEVER activates a subscription by itself — only review_tenant_payment() (platform-admin only) can do that.';

create index crypto_payment_configs_active_idx on public.crypto_payment_configs (is_active, sort_order);

create trigger set_crypto_payment_configs_updated_at
  before update on public.crypto_payment_configs
  for each row execute function public.set_updated_at();

alter table public.crypto_payment_configs enable row level security;

create policy "select_active_crypto_payment_configs" on public.crypto_payment_configs
  for select to authenticated
  using (is_active);

create policy "select_all_crypto_payment_configs_platform_admin" on public.crypto_payment_configs
  for select to authenticated
  using (public.user_is_platform_admin());

create trigger audit_crypto_payment_configs
  after insert or update or delete on public.crypto_payment_configs
  for each row execute function public.log_billing_audit_event('billing', 'crypto_payment_config');

-- ============================================================
-- PART F — Tenant payments (the payment/invoice ledger)
-- ============================================================

create table public.tenant_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subscription_id uuid references public.tenant_subscriptions (id) on delete set null,
  plan_id uuid not null references public.subscription_plans (id),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  -- Snapshotted server-side from subscription_plans at submission time
  -- inside submit_tenant_payment() — never accepted as a client value.
  amount numeric(12, 2) not null check (amount >= 0),
  currency_code text not null,
  payment_method_type text not null check (payment_method_type in ('card', 'bank_transfer', 'gateway', 'crypto', 'manual')),
  provider text,
  provider_reference text,
  crypto_config_id uuid references public.crypto_payment_configs (id),
  crypto_tx_reference text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FAILED', 'REFUNDED')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  rejection_reason text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table public.tenant_payments is
  'The payment/invoice ledger. idempotency_key is unique and client-generated once per submission attempt, so a retried submit_tenant_payment() call can never create a duplicate payment row. A payment reaches APPROVED — the only status that activates/extends a subscription — solely via review_tenant_payment(), never by a tenant''s own action: "the client says it was paid" is never sufficient (Section 8 of the brief). provider_reference is intended to carry a real gateway''s idempotent transaction id once a real gateway is wired up (none is in this migration — see payment_methods_config comment).';

create index tenant_payments_workspace_idx on public.tenant_payments (workspace_id, created_at desc);
create index tenant_payments_status_idx on public.tenant_payments (status);

create trigger set_tenant_payments_updated_at
  before update on public.tenant_payments
  for each row execute function public.set_updated_at();

alter table public.tenant_payments enable row level security;

create policy "select_own_tenant_payments" on public.tenant_payments
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'billing.view')
  );

create policy "select_all_tenant_payments_platform_admin" on public.tenant_payments
  for select to authenticated
  using (public.user_is_platform_admin());

create trigger audit_tenant_payments
  after insert or update on public.tenant_payments
  for each row execute function public.log_billing_audit_event('billing', 'tenant_payment');

-- ============================================================
-- PART G — Platform-wide settings (homepage content, etc.)
-- ============================================================

create table public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

comment on table public.platform_settings is
  'Platform-wide (not workspace-scoped) configuration, e.g. key=''homepage'' for the public marketing homepage''s editable content. Deliberately a NEW table rather than reusing the existing workspace/brand-scoped `settings` table (0006): that table''s RLS requires workspace_id to be a member of the caller''s workspaces and is authenticated-only, which structurally cannot serve content the anonymous homepage must read. Never store secrets here — this table is broadly readable by design.';

create trigger set_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

-- The anonymous homepage must read this. There is nothing
-- sensitive in it by contract (see the comment above) — this is the
-- same tradeoff already made for subscription_plans/payment_methods_config.
create policy "select_platform_settings" on public.platform_settings
  for select to anon, authenticated
  using (true);

create or replace function public.log_platform_settings_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    null, null, auth.uid(), 'billing', case when TG_OP = 'INSERT' then 'create' else 'update' end,
    'platform_setting', null,
    case when TG_OP = 'INSERT' then null else jsonb_build_object('key', old.key, 'value', old.value) end,
    jsonb_build_object('key', new.key, 'value', new.value)
  );
  return new;
end;
$$;

comment on function public.log_platform_settings_audit_event() is
  'platform_settings.key is text, not uuid, so it cannot fill audit_logs.entity_id (uuid) — stored in the JSONB payload instead, alongside the value, so the change is still fully auditable.';

create trigger audit_platform_settings
  after insert or update on public.platform_settings
  for each row execute function public.log_platform_settings_audit_event();

-- ============================================================
-- PART H — RPCs: platform-admin writes
-- ============================================================

create or replace function public.upsert_subscription_plan(
  p_id uuid default null,
  p_slug text default null,
  p_name text default null,
  p_description text default null,
  p_monthly_price numeric default null,
  p_annual_price numeric default null,
  p_currency_code text default null,
  p_trial_days integer default null,
  p_max_orders integer default null,
  p_max_staff integer default null,
  p_max_warehouses integer default null,
  p_max_brands integer default null,
  p_max_landing_pages integer default null,
  p_entitlements jsonb default null,
  p_is_public boolean default null,
  p_is_popular boolean default null,
  p_is_custom_pricing boolean default null,
  p_sort_order integer default null
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if not public.user_is_platform_admin() then
    raise exception 'insufficient_permission: platform admin required';
  end if;

  if p_id is null then
    if p_slug is null or p_name is null then
      raise exception 'slug and name are required to create a plan';
    end if;
    insert into public.subscription_plans (
      slug, name, description, monthly_price, annual_price, currency_code, trial_days,
      max_orders, max_staff, max_warehouses, max_brands, max_landing_pages, entitlements,
      is_public, is_popular, is_custom_pricing, sort_order, created_by, updated_by
    ) values (
      p_slug, p_name, p_description, coalesce(p_monthly_price, 0), p_annual_price, coalesce(p_currency_code, 'USD'), coalesce(p_trial_days, 0),
      p_max_orders, p_max_staff, p_max_warehouses, p_max_brands, p_max_landing_pages, coalesce(p_entitlements, '{}'::jsonb),
      coalesce(p_is_public, true), coalesce(p_is_popular, false), coalesce(p_is_custom_pricing, false), coalesce(p_sort_order, 0), auth.uid(), auth.uid()
    )
    returning * into v_plan;
  else
    update public.subscription_plans set
      slug = coalesce(p_slug, slug),
      name = coalesce(p_name, name),
      description = coalesce(p_description, description),
      monthly_price = coalesce(p_monthly_price, monthly_price),
      annual_price = coalesce(p_annual_price, annual_price),
      currency_code = coalesce(p_currency_code, currency_code),
      trial_days = coalesce(p_trial_days, trial_days),
      max_orders = p_max_orders,
      max_staff = p_max_staff,
      max_warehouses = p_max_warehouses,
      max_brands = p_max_brands,
      max_landing_pages = p_max_landing_pages,
      entitlements = coalesce(p_entitlements, entitlements),
      is_public = coalesce(p_is_public, is_public),
      is_popular = coalesce(p_is_popular, is_popular),
      is_custom_pricing = coalesce(p_is_custom_pricing, is_custom_pricing),
      sort_order = coalesce(p_sort_order, sort_order),
      updated_by = auth.uid()
    where id = p_id
    returning * into v_plan;

    if not found then
      raise exception 'Plan not found';
    end if;
  end if;

  return v_plan;
end;
$$;

comment on function public.upsert_subscription_plan(uuid, text, text, text, numeric, numeric, text, integer, integer, integer, integer, integer, integer, jsonb, boolean, boolean, boolean, integer) is
  'Platform-admin-only create/update for a subscription plan. p_max_* columns are NOT coalesced against the existing value on update — passing null explicitly clears a limit to "unlimited", matching how every other nullable limit column in this codebase behaves.';

create or replace function public.set_subscription_plan_active(p_id uuid, p_is_active boolean)
returns public.subscription_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if not public.user_is_platform_admin() then
    raise exception 'insufficient_permission: platform admin required';
  end if;

  update public.subscription_plans set is_active = p_is_active, updated_by = auth.uid()
  where id = p_id
  returning * into v_plan;

  if not found then
    raise exception 'Plan not found';
  end if;
  return v_plan;
end;
$$;

comment on function public.set_subscription_plan_active(uuid, boolean) is
  'Deactivating a plan (never hard-deleting — existing tenant_subscriptions/tenant_payments reference plan_id and must never dangle) hides it from the public plan list; existing subscribers are unaffected.';

create or replace function public.set_payment_method_config(
  p_id uuid default null,
  p_method_type text default null,
  p_display_label text default null,
  p_is_active boolean default null,
  p_config jsonb default null,
  p_sort_order integer default null
)
returns public.payment_methods_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payment_methods_config%rowtype;
begin
  if not public.user_is_platform_admin() then
    raise exception 'insufficient_permission: platform admin required';
  end if;

  if p_id is null then
    if p_method_type is null or p_display_label is null then
      raise exception 'method_type and display_label are required to create a payment method';
    end if;
    insert into public.payment_methods_config (method_type, display_label, is_active, config, sort_order, created_by, updated_by)
    values (p_method_type, p_display_label, coalesce(p_is_active, false), coalesce(p_config, '{}'::jsonb), coalesce(p_sort_order, 0), auth.uid(), auth.uid())
    returning * into v_row;
  else
    update public.payment_methods_config set
      display_label = coalesce(p_display_label, display_label),
      is_active = coalesce(p_is_active, is_active),
      config = coalesce(p_config, config),
      sort_order = coalesce(p_sort_order, sort_order),
      updated_by = auth.uid()
    where id = p_id
    returning * into v_row;

    if not found then
      raise exception 'Payment method not found';
    end if;
  end if;

  return v_row;
end;
$$;

create or replace function public.set_crypto_payment_config(
  p_id uuid default null,
  p_currency_code text default null,
  p_network text default null,
  p_wallet_address text default null,
  p_display_label text default null,
  p_payment_instructions text default null,
  p_confirmation_requirements text default null,
  p_is_active boolean default null,
  p_sort_order integer default null
)
returns public.crypto_payment_configs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.crypto_payment_configs%rowtype;
begin
  if not public.user_is_platform_admin() then
    raise exception 'insufficient_permission: platform admin required';
  end if;

  if p_id is null then
    if p_currency_code is null or p_network is null or p_wallet_address is null then
      raise exception 'currency_code, network and wallet_address are required to create a crypto payment config';
    end if;
    insert into public.crypto_payment_configs (
      currency_code, network, wallet_address, display_label, payment_instructions,
      confirmation_requirements, is_active, sort_order, created_by, updated_by
    ) values (
      upper(p_currency_code), upper(p_network), trim(p_wallet_address), p_display_label, p_payment_instructions,
      p_confirmation_requirements, coalesce(p_is_active, false), coalesce(p_sort_order, 0), auth.uid(), auth.uid()
    )
    returning * into v_row;
  else
    update public.crypto_payment_configs set
      wallet_address = coalesce(trim(p_wallet_address), wallet_address),
      display_label = coalesce(p_display_label, display_label),
      payment_instructions = coalesce(p_payment_instructions, payment_instructions),
      confirmation_requirements = coalesce(p_confirmation_requirements, confirmation_requirements),
      is_active = coalesce(p_is_active, is_active),
      sort_order = coalesce(p_sort_order, sort_order),
      updated_by = auth.uid()
    where id = p_id
    returning * into v_row;

    if not found then
      raise exception 'Crypto payment config not found';
    end if;
  end if;

  return v_row;
end;
$$;

comment on function public.set_crypto_payment_config(uuid, text, text, text, text, text, text, boolean, integer) is
  'Platform-admin-only. currency_code/network are only settable on create (a new network is a new row, per the unique(currency_code, network) constraint) — supports adding TRC20 today and ERC20/BEP20/Polygon later without assuming a single network forever.';

create or replace function public.set_platform_setting(p_key text, p_value jsonb)
returns public.platform_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_settings%rowtype;
begin
  if not public.user_is_platform_admin() then
    raise exception 'insufficient_permission: platform admin required';
  end if;
  if length(p_key) = 0 or length(p_key) > 100 then
    raise exception 'Invalid setting key';
  end if;

  insert into public.platform_settings (key, value, updated_by)
  values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.set_platform_setting(text, jsonb) is
  'Generic platform-wide config upsert (e.g. key=''homepage''). The frontend is responsible for sanitizing any rich text before it reaches this RPC (see the homepage config form) — this function stores whatever valid jsonb it is given, exactly like every other settings-write RPC in this codebase.';

-- ============================================================
-- PART I — RPCs: tenant-facing billing
-- ============================================================

create or replace function public.get_workspace_entitlements(p_workspace_id uuid)
returns table (
  plan_id uuid,
  plan_name text,
  status text,
  max_orders integer,
  max_staff integer,
  max_warehouses integer,
  max_brands integer,
  max_landing_pages integer,
  entitlements jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  -- No subscription row = every workspace created before this
  -- migration shipped, plus any brand-new workspace that hasn't
  -- picked a plan yet. Reporting every limit as NULL ("unlimited")
  -- here — not 0 — is deliberate: this migration must never
  -- retroactively lock an existing, un-migrated tenant out of staff
  -- invites or any other entitlement-gated action the moment it
  -- ships. A workspace only becomes limited once it actually has a
  -- tenant_subscriptions row (via subscribe_to_plan).
  select
    sp.id, sp.name, coalesce(ts.status, 'NONE'),
    sp.max_orders, sp.max_staff, sp.max_warehouses, sp.max_brands, sp.max_landing_pages,
    coalesce(sp.entitlements, '{}'::jsonb)
  from public.tenant_subscriptions ts
  join public.subscription_plans sp on sp.id = ts.plan_id
  where ts.workspace_id = p_workspace_id
  union all
  select null, null, 'NONE', null, null, null, null, null, '{}'::jsonb
  where not exists (select 1 from public.tenant_subscriptions where workspace_id = p_workspace_id)
  limit 1;
$$;

comment on function public.get_workspace_entitlements(uuid) is
  'Centralized entitlement lookup — the single source other RPCs should call rather than each re-deriving plan limits. No permission check: any workspace member can see their own workspace''s entitlements (needed for frontend feature-gating UX); write paths remain separately permission-gated.';

create or replace function public.subscribe_to_plan(p_workspace_id uuid, p_plan_id uuid, p_billing_interval text default 'monthly')
returns public.tenant_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_sub public.tenant_subscriptions%rowtype;
  v_amount numeric;
begin
  if not public.user_has_permission(p_workspace_id, 'billing.manage') then
    raise exception 'insufficient_permission: billing.manage required';
  end if;
  if p_billing_interval not in ('monthly', 'annual') then
    raise exception 'Invalid billing interval';
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'Plan not found or inactive';
  end if;
  if p_billing_interval = 'annual' and v_plan.annual_price is null then
    raise exception 'This plan has no annual price configured';
  end if;

  -- Server derives the amount from the CURRENT plan row — never a
  -- client-supplied price, per the brief's explicit requirement.
  v_amount := case when p_billing_interval = 'annual' then v_plan.annual_price else v_plan.monthly_price end;

  insert into public.tenant_subscriptions (
    workspace_id, plan_id, status, billing_interval, amount, currency_code,
    trial_ends_at, created_by, updated_by
  ) values (
    p_workspace_id, p_plan_id,
    case when v_plan.trial_days > 0 then 'TRIALING' else 'PAST_DUE' end,
    p_billing_interval, v_amount, v_plan.currency_code,
    case when v_plan.trial_days > 0 then now() + (v_plan.trial_days || ' days')::interval else null end,
    auth.uid(), auth.uid()
  )
  on conflict (workspace_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_interval = excluded.billing_interval,
    amount = excluded.amount,
    currency_code = excluded.currency_code,
    trial_ends_at = excluded.trial_ends_at,
    cancelled_at = null,
    cancellation_reason = null,
    updated_by = auth.uid()
  returning * into v_sub;

  return v_sub;
end;
$$;

comment on function public.subscribe_to_plan(uuid, uuid, text) is
  'Selects a plan for a workspace. Starts TRIALING if the plan has a trial; otherwise PAST_DUE (payment required) — a subscription only reaches ACTIVE via review_tenant_payment() approving a real payment, or by starting/continuing a trial. One row per workspace (upsert on the unique workspace_id) — changing plans replaces the current subscription record rather than creating a parallel one, matching "authoritative subscription state must be server-side, single source of truth."';

create or replace function public.submit_tenant_payment(
  p_workspace_id uuid,
  p_plan_id uuid,
  p_billing_interval text,
  p_payment_method_type text,
  p_idempotency_key text,
  p_crypto_config_id uuid default null,
  p_crypto_tx_reference text default null
)
returns public.tenant_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_amount numeric;
  v_payment public.tenant_payments%rowtype;
  v_existing public.tenant_payments%rowtype;
begin
  if not public.user_has_permission(p_workspace_id, 'billing.manage') then
    raise exception 'insufficient_permission: billing.manage required';
  end if;
  if p_billing_interval not in ('monthly', 'annual') then
    raise exception 'Invalid billing interval';
  end if;
  if p_payment_method_type not in ('card', 'bank_transfer', 'gateway', 'crypto', 'manual') then
    raise exception 'Invalid payment method type';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'idempotency_key is required';
  end if;

  -- A retried submit (network blip, double-click) with the same
  -- client-generated key returns the existing row instead of erroring
  -- or creating a duplicate — genuine idempotency, not just a unique
  -- constraint the client has to interpret itself.
  select * into v_existing from public.tenant_payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.workspace_id <> p_workspace_id then
      raise exception 'idempotency_key already used by a different workspace';
    end if;
    return v_existing;
  end if;

  if not exists (
    select 1 from public.payment_methods_config where method_type = p_payment_method_type and is_active
  ) then
    raise exception 'payment_method_not_available: % is not currently enabled', p_payment_method_type;
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'Plan not found or inactive';
  end if;

  v_amount := case when p_billing_interval = 'annual' then v_plan.annual_price else v_plan.monthly_price end;
  if v_amount is null then
    raise exception 'This plan has no % price configured', p_billing_interval;
  end if;

  if p_payment_method_type = 'crypto' then
    if p_crypto_config_id is null then
      raise exception 'crypto_config_id is required for a crypto payment';
    end if;
    if not exists (select 1 from public.crypto_payment_configs where id = p_crypto_config_id and is_active) then
      raise exception 'Selected crypto payment destination is not active';
    end if;
    -- Crypto is self-service: the tenant only calls this RPC once
    -- they have an actual on-chain transaction reference to submit as
    -- proof. Before that, the frontend shows the wallet address/
    -- instructions from crypto_payment_configs directly — no row is
    -- created here until real proof exists to review.
    if coalesce(trim(p_crypto_tx_reference), '') = '' then
      raise exception 'crypto_tx_reference is required to submit a crypto payment for review';
    end if;
  end if;

  insert into public.tenant_payments (
    workspace_id, subscription_id, plan_id, billing_interval, amount, currency_code,
    payment_method_type, crypto_config_id, crypto_tx_reference, status, submitted_at,
    idempotency_key, created_by
  ) values (
    p_workspace_id, (select id from public.tenant_subscriptions where workspace_id = p_workspace_id),
    p_plan_id, p_billing_interval, v_amount, v_plan.currency_code,
    p_payment_method_type, p_crypto_config_id, p_crypto_tx_reference,
    -- manual/bank_transfer/crypto all land as SUBMITTED immediately —
    -- "submitted" means "the tenant has requested this and it is
    -- awaiting admin review," which is true the moment this RPC is
    -- called for any of them (crypto already required its proof
    -- above; manual/bank_transfer need no proof, since a platform
    -- admin confirms those out-of-band before reviewing). Never
    -- APPROVED here — only review_tenant_payment() can do that.
    'SUBMITTED', now(),
    p_idempotency_key, auth.uid()
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

comment on function public.submit_tenant_payment(uuid, uuid, text, text, text, uuid, text) is
  'Tenant-side payment submission. Amount/currency are ALWAYS derived server-side from the live subscription_plans row, never accepted from the client. Never sets status beyond SUBMITTED — activating a subscription requires review_tenant_payment(), which only a platform admin can call. idempotency_key (client-generated, e.g. a UUID minted once per submit attempt) makes a retried call safe.';

create or replace function public.review_tenant_payment(p_payment_id uuid, p_decision text, p_reason text default null)
returns public.tenant_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.tenant_payments%rowtype;
  v_period interval;
begin
  if not public.user_is_platform_admin() then
    raise exception 'insufficient_permission: platform admin required';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject';
  end if;

  -- Row-locked read + a status re-check after the lock — the exact
  -- pattern approve_affiliate_withdrawal/approve_ad_cost (0024) use to
  -- make concurrent double-approval impossible: a second concurrent
  -- call blocks on the lock, then finds status already APPROVED/
  -- REJECTED and raises rather than double-processing.
  select * into v_payment from public.tenant_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status not in ('PENDING', 'SUBMITTED') then
    raise exception 'payment_already_reviewed: this payment is already %', v_payment.status;
  end if;

  if p_decision = 'reject' then
    update public.tenant_payments set
      status = 'REJECTED', reviewed_at = now(), reviewed_by = auth.uid(), rejection_reason = p_reason
    where id = p_payment_id
    returning * into v_payment;
    return v_payment;
  end if;

  update public.tenant_payments set
    status = 'APPROVED', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_payment_id
  returning * into v_payment;

  -- Approving a payment is the ONLY path that ever activates or
  -- extends a subscription — never the tenant's own submission, never
  -- a client-reported "paid" flag, per the brief's explicit rule.
  v_period := case when v_payment.billing_interval = 'annual' then interval '1 year' else interval '1 month' end;

  update public.tenant_subscriptions set
    plan_id = v_payment.plan_id,
    status = 'ACTIVE',
    billing_interval = v_payment.billing_interval,
    amount = v_payment.amount,
    currency_code = v_payment.currency_code,
    current_period_start = now(),
    current_period_end = now() + v_period,
    renewal_at = now() + v_period,
    payment_provider = v_payment.payment_method_type,
    provider_reference = coalesce(v_payment.provider_reference, v_payment.crypto_tx_reference),
    trial_ends_at = null,
    cancelled_at = null,
    cancellation_reason = null,
    updated_by = auth.uid()
  where workspace_id = v_payment.workspace_id;

  if not found then
    insert into public.tenant_subscriptions (
      workspace_id, plan_id, status, billing_interval, amount, currency_code,
      current_period_start, current_period_end, renewal_at, payment_provider, provider_reference,
      created_by, updated_by
    ) values (
      v_payment.workspace_id, v_payment.plan_id, 'ACTIVE', v_payment.billing_interval, v_payment.amount, v_payment.currency_code,
      now(), now() + v_period, now() + v_period, v_payment.payment_method_type, coalesce(v_payment.provider_reference, v_payment.crypto_tx_reference),
      auth.uid(), auth.uid()
    );
  end if;

  return v_payment;
end;
$$;

comment on function public.review_tenant_payment(uuid, text, text) is
  'The sole authority that can mark a payment APPROVED and activate/extend a subscription — platform-admin only, never automatic, never trusting client-supplied payment status. `for update` + a status re-check after the lock makes two concurrent review calls on the same payment safe: the second always sees payment_already_reviewed rather than double-activating the subscription or double-extending the period.';

create or replace function public.cancel_tenant_subscription(p_workspace_id uuid, p_reason text default null)
returns public.tenant_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.tenant_subscriptions%rowtype;
begin
  if not public.user_has_permission(p_workspace_id, 'billing.manage') then
    raise exception 'insufficient_permission: billing.manage required';
  end if;

  update public.tenant_subscriptions set
    status = 'CANCELLED', cancelled_at = now(), cancellation_reason = p_reason, updated_by = auth.uid()
  where workspace_id = p_workspace_id
  returning * into v_sub;

  if not found then
    raise exception 'No subscription found for this workspace';
  end if;
  return v_sub;
end;
$$;

-- ============================================================
-- PART J — Entitlement enforcement: staff seats (one concrete,
-- real checkpoint — deliberately not retrofitted into every
-- resource-creation path across the system; see migration/report
-- notes on scope).
-- ============================================================

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
  v_max_staff integer;
  v_current_staff integer;
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

  -- Entitlement checkpoint: max_staff counts existing members +
  -- already-pending invitations, so a workspace at its seat limit
  -- cannot route around it by sending N pending invites at once.
  select max_staff into v_max_staff from public.get_workspace_entitlements(p_workspace_id);
  if v_max_staff is not null then
    select
      (select count(distinct ur.user_id) from public.user_roles ur where ur.workspace_id = p_workspace_id)
      + (select count(*) from public.staff_invitations si where si.workspace_id = p_workspace_id and si.status = 'pending' and si.expires_at > now())
    into v_current_staff;
    if v_current_staff >= v_max_staff then
      raise exception 'staff_seat_limit_reached: this workspace''s plan allows at most % staff seats', v_max_staff;
    end if;
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
  'Creates a pending staff invitation and returns the raw token exactly once. Extended in 0039 with a real, enforced staff-seat entitlement check (get_workspace_entitlements) — a workspace with no subscription/max_staff=NULL is treated as unlimited (existing pre-billing workspaces are never retroactively locked out). Deliberately the ONE concrete enforcement checkpoint wired this phase; max_brands/max_orders/max_warehouses/max_landing_pages are read-side complete (get_workspace_entitlements) but not yet enforced at every corresponding creation path — see the final report''s scope notes.';

-- ============================================================
-- PART K — Permissions: new "billing" module
-- ============================================================

insert into public.permissions (module, action, slug, category, description) values
  ('billing', 'view', 'billing.view', 'Billing', 'View this workspace''s subscription, plan, and payment history'),
  ('billing', 'manage', 'billing.manage', 'Billing', 'Subscribe, change plan, submit payment, and cancel this workspace''s subscription')
on conflict (slug) do nothing;

-- Owner: full billing authority over their own workspace.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'owner' and p.module = 'billing'
on conflict do nothing;

-- Admin: same as Owner for billing — consistent with Admin already
-- getting full authority on every other module in this codebase.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'admin' and p.module = 'billing'
on conflict do nothing;

-- Finance: can see the subscription cost as a business expense, but
-- cannot change plans or submit payments — mirrors Finance's
-- view-only relationship to every other operational module.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'finance' and p.slug = 'billing.view'
on conflict do nothing;

-- Manager/Customer Support/Warehouse Staff/Marketing/Affiliate
-- Manager/Viewer intentionally get nothing — billing is a
-- commercial/financial concern outside every one of those roles'
-- existing scope, matching how e.g. withdrawals.approve or
-- workspace.manage are similarly withheld from them.

-- ============================================================
-- PART L — Seed data (explicitly editable defaults, never hardcoded
-- permanently — see subscription_plans/payment_methods_config
-- comments and Part 5 of the brief, which allows default seed values)
-- ============================================================

insert into public.subscription_plans (slug, name, description, monthly_price, annual_price, currency_code, trial_days, max_staff, max_brands, max_landing_pages, entitlements, is_popular, sort_order)
values
  ('starter', 'Starter', 'For a single-brand operation just getting started with GCOS.', 49, 470, 'USD', 14, 5, 1, 3,
    '{"automation_enabled": false, "advanced_reports": false, "marketing_enabled": true, "affiliates_enabled": false, "integrations_enabled": false, "realtime_enabled": true, "api_access": false, "custom_domain": false, "priority_support": false}'::jsonb,
    false, 1),
  ('growth', 'Growth', 'For a growing team running multiple brands and campaigns.', 149, 1430, 'USD', 14, 20, 3, 15,
    '{"automation_enabled": true, "advanced_reports": true, "marketing_enabled": true, "affiliates_enabled": true, "integrations_enabled": true, "realtime_enabled": true, "api_access": false, "custom_domain": false, "priority_support": false}'::jsonb,
    true, 2),
  ('scale', 'Scale', 'For a high-volume operation needing every module without limits.', 349, 3350, 'USD', 14, null, null, null,
    '{"automation_enabled": true, "advanced_reports": true, "marketing_enabled": true, "affiliates_enabled": true, "integrations_enabled": true, "realtime_enabled": true, "api_access": true, "custom_domain": true, "priority_support": true}'::jsonb,
    false, 3)
on conflict (slug) do nothing;

insert into public.payment_methods_config (method_type, display_label, is_active, sort_order) values
  ('manual', 'Manual (admin-confirmed)', true, 1),
  ('crypto', 'Cryptocurrency', false, 2),
  ('card', 'Card', false, 3),
  ('bank_transfer', 'Bank Transfer', false, 4),
  ('gateway', 'Payment Gateway', false, 5)
on conflict do nothing;

comment on column public.payment_methods_config.is_active is
  'manual ships active (requires no external configuration — a platform admin reviews payments directly). crypto ships inactive until a platform admin configures at least one crypto_payment_configs row and activates it. card/bank_transfer/gateway ship inactive: NOT CONFIGURED — no gateway integration exists in this codebase; activating one requires the corresponding provider integration to actually be built first, never faked.';

-- ============================================================
-- DEPLOYMENT NOTE — provisioning the first platform admin
-- ============================================================
-- No RPC in this migration (or anywhere else) can set
-- is_platform_admin on the caller's own row — that would be a
-- self-service privilege escalation. The first platform admin must
-- be provisioned manually, once, via direct database access (the
-- Supabase SQL editor, using the project's own credentials — never
-- the anon/authenticated role):
--
--   update public.profiles set is_platform_admin = true where email = 'you@yourcompany.com';
--
-- This is a manual production deployment step (see the final
-- engineering report), exactly as unavoidable as bootstrapping the
-- very first workspace Owner already is in this codebase.
