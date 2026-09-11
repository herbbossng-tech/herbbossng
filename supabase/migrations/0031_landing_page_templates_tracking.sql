-- ============================================================
-- GOLDEN COMMERCE OS — Landing Page Template Engine & Conversion
-- Tracking (0031)
--
-- Extends the EXISTING landing page engine (0021: landing_pages /
-- landing_page_sections / landing_page_packages / landing_page_events
-- / create_public_order() / track_landing_page_event()) rather than
-- rebuilding it. That engine already has: real relational sections,
-- a genuine price-authority packages table, and a public order RPC
-- that resolves price server-side and has never trusted the client.
-- None of that is touched structurally — it is extended.
--
-- What already existed and is REUSED, not duplicated:
--   * landing_pages/landing_page_sections/landing_page_packages —
--     the section/package model itself is unchanged.
--   * create_public_order() — extended (new optional params), not
--     replaced with a second order path.
--   * compute_shipping_fee(), adjust_inventory(),
--     generate_order_number() — untouched. find_or_create_customer()
--     gets one additive, backward-compatible new trailing parameter
--     (see PART F0) so a landing page's own market can drive phone
--     normalization instead of always the workspace's.
--   * countries/currencies (0004) — reused for market validation
--     instead of inventing a second market table.
--   * orders.affiliate_id/affiliate_campaign_id/affiliate_referral_code_used
--     (0024) — the SAME affiliate-attribution columns/resolution
--     pattern used by the internal create_order() is mirrored here,
--     not reimplemented as a second affiliate system.
--   * media_library + the 'landing-pages' storage bucket (0006/0012)
--     — no parallel media table.
--   * log_ops_audit_event() (0025) — reused for the new templates
--     table; tracking secrets are explicitly NEVER audit-logged with
--     their raw values (see PART C).
--
-- What is genuinely new (nothing before this modeled a reusable
-- template, secret-safe tracking config, or a conversion-event
-- ledger):
--   * landing_page_templates — reusable, config-driven templates
--     (system + workspace-cloned), replacing the two-preset
--     page_type/starterSections() scheme as the seed source for new
--     pages (page_type is kept, unused going forward, to avoid a
--     breaking change to existing rows).
--   * brand_tracking_secrets / landing_page_tracking_secrets — secret
--     storage with ZERO client-readable RLS policy (SECURITY DEFINER
--     RPCs only). This also FIXES a real pre-existing issue: the
--     brands table's meta_capi_access_token/meta_capi_test_event_code
--     columns were being sent to the browser on every plain
--     `select('*')` staff fetch of a brand. Those two columns are
--     migrated into the new secrets table and dropped from `brands`.
--   * tracking_dispatch_log — an honest, idempotent event ledger for
--     Meta CAPI / TikTok Events API dispatch (status is
--     not_configured/pending/sent/failed — never a fabricated
--     "sent" for an unconfigured or failed provider call). The actual
--     outbound HTTP call happens in a Supabase Edge Function (not
--     Postgres — Postgres has no business holding ad-platform HTTP
--     logic), which is written as a real, separate deliverable and
--     documented as a manual deployment step.
--   * orders.utm_source/utm_medium/utm_campaign/utm_term/utm_content/
--     fbclid/ttclid — dedicated attribution columns (previously only
--     UTM values landed ad hoc inside orders.metadata jsonb).
--   * 4 new landing_page_sections.type values (PROBLEM_AWARENESS,
--     INGREDIENTS, COMPARISON, GUARANTEE) needed by the new template
--     architectures — added to the existing check constraint, not a
--     parallel section table.
-- ============================================================


-- ---------------------------------------------------------------
-- PART A — new permissions: landing_pages.templates.*, landing_pages.tracking.*
-- ---------------------------------------------------------------
insert into public.permissions (module, action, slug, category, description) values
  ('landing_pages', 'view', 'landing_pages.templates.view', 'Landing Pages', 'View landing page templates'),
  ('landing_pages', 'manage', 'landing_pages.templates.manage', 'Landing Pages', 'Create, edit, clone and archive landing page templates'),
  ('landing_pages', 'view', 'landing_pages.tracking.view', 'Landing Pages', 'View landing page tracking/pixel configuration status'),
  ('landing_pages', 'manage', 'landing_pages.tracking.manage', 'Landing Pages', 'Configure Meta/TikTok pixel IDs and conversion API credentials')
on conflict (slug) do nothing;

-- Owner/Admin — explicit grant (their 0008 cross-join predates these rows).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin')
  and p.slug in ('landing_pages.templates.view', 'landing_pages.templates.manage', 'landing_pages.tracking.view', 'landing_pages.tracking.manage')
on conflict do nothing;

-- Manager: sees templates and tracking status, does not reconfigure
-- pixels/tokens or manage the template catalogue — mirrors 0008's own
-- Manager convention (view, not manage).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and p.slug in ('landing_pages.templates.view', 'landing_pages.tracking.view')
on conflict do nothing;

-- Marketing: landing pages ARE their module (0008 already grants them
-- the whole landing_pages module) — full templates + tracking reach,
-- including pixel/CAPI configuration.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'marketing'
  and p.slug in ('landing_pages.templates.view', 'landing_pages.templates.manage', 'landing_pages.tracking.view', 'landing_pages.tracking.manage')
on conflict do nothing;

-- Affiliate Manager: enough visibility to understand which landing
-- pages/templates affiliate campaigns are pointed at — no tracking
-- secrets, no template management.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'affiliate-manager'
  and p.slug = 'landing_pages.templates.view'
on conflict do nothing;

-- Viewer: read-only, consistent with its existing "every action='view'" grant.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer'
  and p.slug in ('landing_pages.templates.view', 'landing_pages.tracking.view')
on conflict do nothing;

-- Deliberately NOT granted to Customer Support (view-only elsewhere,
-- not operationally needed here), Warehouse Staff (no landing-page
-- management of any kind), or Finance (not in scope for this module).


-- ---------------------------------------------------------------
-- PART B — landing_page_templates: reusable, config-driven templates.
-- System templates (workspace_id null) are visible to every
-- workspace and immutable via RLS; a workspace clones one into its
-- own row to customize it. starter_sections mirrors the exact shape
-- landing_page_sections rows are created from: [{type, config}, ...].
-- ---------------------------------------------------------------
create table public.landing_page_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  template_key text,
  preview_image_url text,
  is_system boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  starter_sections jsonb not null default '[]'::jsonb,
  default_theme jsonb not null default '{}'::jsonb,
  source_template_id uuid references public.landing_page_templates (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.landing_page_templates is
  'Reusable landing-page starter configurations. System templates (workspace_id null) are read-only and visible to every workspace; a workspace clones one into an owned, editable row via clone_landing_page_template(). starter_sections seeds landing_page_sections at page-creation time — the template does not constrain the page afterward, same discipline the old page_type/starterSections() preset had.';

create unique index landing_page_templates_system_slug_idx on public.landing_page_templates (slug)
  where workspace_id is null and deleted_at is null;
create unique index landing_page_templates_workspace_slug_idx on public.landing_page_templates (workspace_id, slug)
  where workspace_id is not null and deleted_at is null;
create index landing_page_templates_workspace_id_idx on public.landing_page_templates (workspace_id) where deleted_at is null;

create trigger set_landing_page_templates_updated_at
  before update on public.landing_page_templates
  for each row execute function public.set_updated_at();

-- landing_page_templates is workspace-scoped, not brand-scoped (a
-- template isn't owned by one brand), so the generic
-- log_ops_audit_event() (which unconditionally references
-- new.brand_id) doesn't fit — this is the same small dedicated
-- trigger pattern used elsewhere for tables with a different shape
-- than the generic one assumes (e.g. ad_costs in 0024).
create or replace function public.log_landing_page_template_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  v_action := case when TG_OP = 'INSERT' then 'create' else 'update' end;
  insert into public.audit_logs (workspace_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    new.workspace_id, auth.uid(), 'landing_pages', v_action, 'landing_page_template', new.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new)
  );
  return new;
end;
$$;

create trigger audit_landing_page_templates
  after insert or update on public.landing_page_templates
  for each row execute function public.log_landing_page_template_audit_event();

alter table public.landing_page_templates enable row level security;

create policy "select_landing_page_templates" on public.landing_page_templates
  for select to authenticated
  using (
    status = 'active'
    and deleted_at is null
    and (
      workspace_id is null
      or (workspace_id in (select public.user_workspace_ids()) and public.user_has_permission(workspace_id, 'landing_pages.templates.view'))
    )
  );

-- Insert/update/delete are workspace-owned rows only — system
-- templates (workspace_id null) can never be targeted by these
-- policies, so they are immutable to every client regardless of role.
create policy "insert_landing_page_templates" on public.landing_page_templates
  for insert to authenticated
  with check (
    workspace_id is not null
    and workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.templates.manage')
  );

create policy "update_landing_page_templates" on public.landing_page_templates
  for update to authenticated
  using (
    workspace_id is not null
    and workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.templates.manage')
  )
  with check (
    workspace_id is not null
    and workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.templates.manage')
  );

create policy "delete_landing_page_templates" on public.landing_page_templates
  for delete to authenticated
  using (
    workspace_id is not null
    and workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.templates.manage')
  );


create or replace function public.clone_landing_page_template(p_template_id uuid, p_workspace_id uuid, p_name text)
returns public.landing_page_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.landing_page_templates%rowtype;
  v_new public.landing_page_templates%rowtype;
  v_slug text;
  v_suffix int := 0;
begin
  if not (public.user_has_permission(p_workspace_id, 'landing_pages.templates.manage')) then
    raise exception 'insufficient_permission: landing_pages.templates.manage required';
  end if;

  select * into v_source from public.landing_page_templates where id = p_template_id and deleted_at is null;
  if not found then
    raise exception 'Template not found';
  end if;
  if not (v_source.is_system or v_source.workspace_id = p_workspace_id) then
    raise exception 'Cannot clone a template belonging to another workspace';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required';
  end if;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  while exists (
    select 1 from public.landing_page_templates
    where workspace_id = p_workspace_id and slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end and deleted_at is null
  ) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then v_slug := v_slug || '-' || v_suffix; end if;

  insert into public.landing_page_templates (
    workspace_id, name, slug, description, template_key, preview_image_url,
    is_system, status, starter_sections, default_theme, source_template_id,
    created_by, updated_by
  ) values (
    p_workspace_id, trim(p_name), v_slug, v_source.description, null, v_source.preview_image_url,
    false, 'active', v_source.starter_sections, v_source.default_theme, v_source.id,
    auth.uid(), auth.uid()
  )
  returning * into v_new;

  return v_new;
end;
$$;

comment on function public.clone_landing_page_template(uuid, uuid, text) is
  'Duplicates a system template (or the calling workspace''s own template) into a new, workspace-owned, editable template row — the foundation for "duplicate template -> modify -> save as custom template" and, eventually, custom templates created entirely from scratch.';


-- ---------------------------------------------------------------
-- PART C — secret-safe tracking configuration.
--
-- Two secret-storage tables, both with RLS enabled and ZERO policies
-- for authenticated/anon — meaning no client role can select, insert,
-- update or delete a row here under any circumstance. The only way in
-- or out is the SECURITY DEFINER functions below, which never return
-- a raw token, only a "configured: boolean" status.
-- ---------------------------------------------------------------
create table public.brand_tracking_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  meta_capi_access_token text,
  meta_capi_test_event_code text,
  tiktok_access_token text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (brand_id)
);

comment on table public.brand_tracking_secrets is
  'Brand-level Meta CAPI / TikTok Events API secrets. RLS enabled with NO policies for any client role — reachable only through set_brand_meta_tracking()/set_brand_tiktok_tracking() (write) and get_landing_page_tracking_status() (read, tokens never returned). Never select this table directly from the frontend.';

alter table public.brand_tracking_secrets enable row level security;

create table public.landing_page_tracking_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  landing_page_id uuid not null references public.landing_pages (id) on delete cascade,
  meta_capi_access_token text,
  meta_capi_test_event_code text,
  tiktok_access_token text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (landing_page_id)
);

comment on table public.landing_page_tracking_secrets is
  'Optional PAGE-LEVEL override of brand_tracking_secrets — e.g. Landing Page A uses Pixel A / CAPI Token A while the brand default uses a different pixel entirely. Same zero-client-access RLS discipline as brand_tracking_secrets.';

alter table public.landing_page_tracking_secrets enable row level security;

-- Migrate any existing brand-level secret values out of `brands`
-- before dropping the columns — those two columns have been sitting
-- on `brands` since 0002 and are returned to the browser on every
-- plain `select('*')` fetch of a brand (a real pre-existing leak,
-- fixed here).
insert into public.brand_tracking_secrets (workspace_id, brand_id, meta_capi_access_token, meta_capi_test_event_code)
select workspace_id, id, meta_capi_access_token, meta_capi_test_event_code
from public.brands
where meta_capi_access_token is not null or meta_capi_test_event_code is not null
on conflict (brand_id) do nothing;

alter table public.brands drop column meta_capi_access_token;
alter table public.brands drop column meta_capi_test_event_code;
-- tiktok_pixel_id is NOT a secret (same public-ID class as
-- meta_pixel_id, which stays on brands) — only the TikTok access
-- token is secret and lives in brand_tracking_secrets.
alter table public.brands add column tiktok_pixel_id text;


create or replace function public.set_brand_meta_tracking(
  p_brand_id uuid,
  p_pixel_id text default null,
  p_capi_access_token text default null,
  p_capi_test_event_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand public.brands%rowtype;
begin
  select * into v_brand from public.brands where id = p_brand_id and deleted_at is null;
  if not found then
    raise exception 'Brand not found';
  end if;
  if not public.user_has_permission(v_brand.workspace_id, 'landing_pages.tracking.manage') then
    raise exception 'insufficient_permission: landing_pages.tracking.manage required';
  end if;

  update public.brands set meta_pixel_id = nullif(trim(coalesce(p_pixel_id, meta_pixel_id)), '') where id = p_brand_id;

  -- NULL param = leave unchanged; empty string = explicitly clear.
  insert into public.brand_tracking_secrets (workspace_id, brand_id, meta_capi_access_token, meta_capi_test_event_code, updated_by)
  values (v_brand.workspace_id, p_brand_id, nullif(p_capi_access_token, ''), nullif(p_capi_test_event_code, ''), auth.uid())
  on conflict (brand_id) do update set
    meta_capi_access_token = case when p_capi_access_token is null then brand_tracking_secrets.meta_capi_access_token else nullif(p_capi_access_token, '') end,
    meta_capi_test_event_code = case when p_capi_test_event_code is null then brand_tracking_secrets.meta_capi_test_event_code else nullif(p_capi_test_event_code, '') end,
    updated_at = now(), updated_by = auth.uid();

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (
    v_brand.workspace_id, p_brand_id, auth.uid(), 'landing_pages', 'update', 'brand_tracking', p_brand_id,
    jsonb_build_object('provider', 'meta', 'pixel_id', p_pixel_id, 'capi_token_set', p_capi_access_token is not null and p_capi_access_token <> '')
  );
end;
$$;

comment on function public.set_brand_meta_tracking(uuid, text, text, text) is
  'The only write path for brand-level Meta tracking config. Audit logs record which fields changed and WHETHER a token was set — never the token value itself.';


create or replace function public.set_brand_tiktok_tracking(
  p_brand_id uuid,
  p_pixel_id text default null,
  p_access_token text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand public.brands%rowtype;
begin
  select * into v_brand from public.brands where id = p_brand_id and deleted_at is null;
  if not found then
    raise exception 'Brand not found';
  end if;
  if not public.user_has_permission(v_brand.workspace_id, 'landing_pages.tracking.manage') then
    raise exception 'insufficient_permission: landing_pages.tracking.manage required';
  end if;

  update public.brands set tiktok_pixel_id = nullif(trim(coalesce(p_pixel_id, tiktok_pixel_id)), '') where id = p_brand_id;

  insert into public.brand_tracking_secrets (workspace_id, brand_id, tiktok_access_token, updated_by)
  values (v_brand.workspace_id, p_brand_id, nullif(p_access_token, ''), auth.uid())
  on conflict (brand_id) do update set
    tiktok_access_token = case when p_access_token is null then brand_tracking_secrets.tiktok_access_token else nullif(p_access_token, '') end,
    updated_at = now(), updated_by = auth.uid();

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (
    v_brand.workspace_id, p_brand_id, auth.uid(), 'landing_pages', 'update', 'brand_tracking', p_brand_id,
    jsonb_build_object('provider', 'tiktok', 'pixel_id', p_pixel_id, 'access_token_set', p_access_token is not null and p_access_token <> '')
  );
end;
$$;


create or replace function public.set_landing_page_tracking(
  p_landing_page_id uuid,
  p_meta_enabled boolean default null,
  p_meta_pixel_id text default null,
  p_meta_capi_access_token text default null,
  p_meta_capi_test_event_code text default null,
  p_tiktok_enabled boolean default null,
  p_tiktok_pixel_id text default null,
  p_tiktok_access_token text default null
)
returns public.landing_pages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.landing_pages%rowtype;
  v_config jsonb;
  v_has_meta_secret boolean;
  v_has_tiktok_secret boolean;
begin
  select * into v_page from public.landing_pages where id = p_landing_page_id and deleted_at is null;
  if not found then
    raise exception 'Landing page not found';
  end if;
  if not public.user_has_permission(v_page.workspace_id, 'landing_pages.tracking.manage') then
    raise exception 'insufficient_permission: landing_pages.tracking.manage required';
  end if;

  -- jsonb_set() silently no-ops when an intermediate path key (here,
  -- "meta"/"tiktok") doesn't already exist as an object — exactly the
  -- case for a fresh tracking_config of '{}' — so the nested objects
  -- are built directly with jsonb_build_object rather than via
  -- incremental jsonb_set() calls into a possibly-missing path.
  v_config := coalesce(v_page.tracking_config, '{}'::jsonb);
  v_config := jsonb_set(
    v_config, '{meta}',
    jsonb_build_object(
      'enabled', coalesce(p_meta_enabled, (v_config #>> '{meta,enabled}')::boolean, false),
      'pixel_id', coalesce(nullif(p_meta_pixel_id, ''), v_config #>> '{meta,pixel_id}')
    ),
    true
  );
  v_config := jsonb_set(
    v_config, '{tiktok}',
    jsonb_build_object(
      'enabled', coalesce(p_tiktok_enabled, (v_config #>> '{tiktok,enabled}')::boolean, false),
      'pixel_id', coalesce(nullif(p_tiktok_pixel_id, ''), v_config #>> '{tiktok,pixel_id}')
    ),
    true
  );

  update public.landing_pages set tracking_config = v_config, updated_by = auth.uid() where id = p_landing_page_id
    returning * into v_page;

  if p_meta_capi_access_token is not null or p_meta_capi_test_event_code is not null then
    insert into public.landing_page_tracking_secrets (workspace_id, brand_id, landing_page_id, meta_capi_access_token, meta_capi_test_event_code, updated_by)
    values (v_page.workspace_id, v_page.brand_id, p_landing_page_id, nullif(p_meta_capi_access_token, ''), nullif(p_meta_capi_test_event_code, ''), auth.uid())
    on conflict (landing_page_id) do update set
      meta_capi_access_token = case when p_meta_capi_access_token is null then landing_page_tracking_secrets.meta_capi_access_token else nullif(p_meta_capi_access_token, '') end,
      meta_capi_test_event_code = case when p_meta_capi_test_event_code is null then landing_page_tracking_secrets.meta_capi_test_event_code else nullif(p_meta_capi_test_event_code, '') end,
      updated_at = now(), updated_by = auth.uid();
  end if;

  if p_tiktok_access_token is not null then
    insert into public.landing_page_tracking_secrets (workspace_id, brand_id, landing_page_id, tiktok_access_token, updated_by)
    values (v_page.workspace_id, v_page.brand_id, p_landing_page_id, nullif(p_tiktok_access_token, ''), auth.uid())
    on conflict (landing_page_id) do update set
      tiktok_access_token = nullif(p_tiktok_access_token, ''),
      updated_at = now(), updated_by = auth.uid();
  end if;

  select (meta_capi_access_token is not null) into v_has_meta_secret from public.landing_page_tracking_secrets where landing_page_id = p_landing_page_id;
  select (tiktok_access_token is not null) into v_has_tiktok_secret from public.landing_page_tracking_secrets where landing_page_id = p_landing_page_id;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (
    v_page.workspace_id, v_page.brand_id, auth.uid(), 'landing_pages', 'update', 'landing_page_tracking', p_landing_page_id,
    jsonb_build_object(
      'meta_enabled', v_config #>> '{meta,enabled}', 'meta_pixel_id', v_config #>> '{meta,pixel_id}', 'meta_capi_token_set', coalesce(v_has_meta_secret, false),
      'tiktok_enabled', v_config #>> '{tiktok,enabled}', 'tiktok_pixel_id', v_config #>> '{tiktok,pixel_id}', 'tiktok_token_set', coalesce(v_has_tiktok_secret, false)
    )
  );

  return v_page;
end;
$$;

comment on function public.set_landing_page_tracking(uuid, boolean, text, text, text, boolean, text, text) is
  'Page-level tracking override, resolved by get_landing_page_tracking_status() as: page override (if enabled+pixel_id set) else brand default. Tokens follow the NULL=unchanged/empty-string=clear convention, same as set_brand_meta_tracking().';


-- Same split as adjust_inventory()/adjust_inventory_internal() (PART
-- E1) and for the identical reason: enqueue_tracking_event() (called
-- from create_public_order(), i.e. potentially by a genuinely
-- anonymous visitor) needs this resolution logic WITHOUT a staff
-- permission check, while the settings UI needs the exact same logic
-- WITH one. resolve_landing_page_tracking_status_internal() has no
-- permission check and is not directly callable by any client role;
-- get_landing_page_tracking_status() is the permission-checked public
-- entrypoint every staff caller keeps using, unchanged.
create or replace function public.resolve_landing_page_tracking_status_internal(p_landing_page_id uuid)
returns table (
  meta_enabled boolean,
  meta_pixel_id text,
  meta_capi_configured boolean,
  meta_source text,
  tiktok_enabled boolean,
  tiktok_pixel_id text,
  tiktok_events_configured boolean,
  tiktok_source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page public.landing_pages%rowtype;
  v_brand public.brands%rowtype;
  v_page_secret public.landing_page_tracking_secrets%rowtype;
  v_brand_secret public.brand_tracking_secrets%rowtype;
  v_page_meta_enabled boolean;
  v_page_meta_pixel text;
  v_page_tiktok_enabled boolean;
  v_page_tiktok_pixel text;
begin
  select * into v_page from public.landing_pages where id = p_landing_page_id and deleted_at is null;
  if not found then
    raise exception 'Landing page not found';
  end if;

  select * into v_brand from public.brands where id = v_page.brand_id;
  select * into v_page_secret from public.landing_page_tracking_secrets where landing_page_id = p_landing_page_id;
  select * into v_brand_secret from public.brand_tracking_secrets where brand_id = v_page.brand_id;

  v_page_meta_enabled := coalesce((v_page.tracking_config #>> '{meta,enabled}')::boolean, false);
  v_page_meta_pixel := v_page.tracking_config #>> '{meta,pixel_id}';
  v_page_tiktok_enabled := coalesce((v_page.tracking_config #>> '{tiktok,enabled}')::boolean, false);
  v_page_tiktok_pixel := v_page.tracking_config #>> '{tiktok,pixel_id}';

  return query select
    coalesce(v_page_meta_enabled, v_brand.meta_pixel_id is not null),
    coalesce(v_page_meta_pixel, v_brand.meta_pixel_id),
    coalesce(v_page_secret.meta_capi_access_token, v_brand_secret.meta_capi_access_token) is not null,
    case
      when v_page_meta_enabled and v_page_meta_pixel is not null then 'page'
      when v_brand.meta_pixel_id is not null then 'brand'
      else 'none'
    end,
    coalesce(v_page_tiktok_enabled, v_brand.tiktok_pixel_id is not null),
    coalesce(v_page_tiktok_pixel, v_brand.tiktok_pixel_id),
    coalesce(v_page_secret.tiktok_access_token, v_brand_secret.tiktok_access_token) is not null,
    case
      when v_page_tiktok_enabled and v_page_tiktok_pixel is not null then 'page'
      when v_brand.tiktok_pixel_id is not null then 'brand'
      else 'none'
    end;
end;
$$;

revoke execute on function public.resolve_landing_page_tracking_status_internal(uuid) from public, anon, authenticated;

create or replace function public.get_landing_page_tracking_status(p_landing_page_id uuid)
returns table (
  meta_enabled boolean,
  meta_pixel_id text,
  meta_capi_configured boolean,
  meta_source text,
  tiktok_enabled boolean,
  tiktok_pixel_id text,
  tiktok_events_configured boolean,
  tiktok_source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.landing_pages where id = p_landing_page_id and deleted_at is null;
  if not found then
    raise exception 'Landing page not found';
  end if;
  if not public.user_has_permission(v_workspace_id, 'landing_pages.tracking.view') then
    raise exception 'insufficient_permission: landing_pages.tracking.view required';
  end if;

  return query select * from public.resolve_landing_page_tracking_status_internal(p_landing_page_id);
end;
$$;

comment on function public.get_landing_page_tracking_status(uuid) is
  'Staff-facing tracking status for the settings UI — resolves the page-override-then-brand-default inheritance and reports whether a CAPI/Events-API token exists, but NEVER returns a token value. permission-gated (landing_pages.tracking.view). Delegates to resolve_landing_page_tracking_status_internal(), the same permission-free resolver enqueue_tracking_event() uses for anonymous public-order callers.';


-- Anon-callable, deliberately narrow: only the two public pixel IDs a
-- browser needs to load the Meta/TikTok base pixel script. No secrets,
-- no "configured" booleans, nothing else.
create or replace function public.get_landing_page_public_tracking(p_landing_page_slug text)
returns table (meta_pixel_id text, tiktok_pixel_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page public.landing_pages%rowtype;
  v_brand public.brands%rowtype;
  v_meta_enabled boolean;
  v_meta_pixel text;
  v_tiktok_enabled boolean;
  v_tiktok_pixel text;
begin
  select * into v_page from public.landing_pages where slug = p_landing_page_slug and status = 'published' and deleted_at is null;
  if not found then
    return;
  end if;
  select * into v_brand from public.brands where id = v_page.brand_id;

  v_meta_enabled := coalesce((v_page.tracking_config #>> '{meta,enabled}')::boolean, false);
  v_meta_pixel := v_page.tracking_config #>> '{meta,pixel_id}';
  v_tiktok_enabled := coalesce((v_page.tracking_config #>> '{tiktok,enabled}')::boolean, false);
  v_tiktok_pixel := v_page.tracking_config #>> '{tiktok,pixel_id}';

  return query select
    case when v_meta_enabled and v_meta_pixel is not null then v_meta_pixel when v_brand.meta_pixel_id is not null then v_brand.meta_pixel_id else null end,
    case when v_tiktok_enabled and v_tiktok_pixel is not null then v_tiktok_pixel when v_brand.tiktok_pixel_id is not null then v_brand.tiktok_pixel_id else null end;
end;
$$;

grant execute on function public.get_landing_page_public_tracking(text) to anon, authenticated;


-- ---------------------------------------------------------------
-- PART D — tracking_dispatch_log: the honest, idempotent conversion-
-- event ledger. Rows are enqueued server-side (PART F triggers); the
-- actual Meta CAPI / TikTok Events API HTTP call happens in a
-- Supabase Edge Function (supabase/functions/dispatch-tracking-event)
-- which reads secrets via service_role and updates status here. This
-- migration builds the queue and the honest status vocabulary; it
-- does not and cannot make outbound HTTP calls from Postgres.
-- ---------------------------------------------------------------
create table public.tracking_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  landing_page_id uuid references public.landing_pages (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,

  provider text not null check (provider in ('meta', 'tiktok')),
  event_type text not null check (event_type in (
    'PAGE_VIEW', 'VIEW_CONTENT', 'SELECT_PACKAGE', 'INITIATE_CHECKOUT', 'FORM_START',
    'ORDER_CREATED', 'ORDER_CONFIRMED', 'PURCHASE', 'ORDER_CANCELLED'
  )),
  event_id text not null,
  status text not null default 'pending' check (status in ('not_configured', 'pending', 'sent', 'failed')),
  provider_response jsonb,
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tracking_dispatch_log is
  'Server-side conversion event queue for Meta CAPI / TikTok Events API. event_id is the dedup key (provider, event_id) is unique — the same order/event/provider combination is enqueued at most once regardless of retries, webhook replays, or repeated status transitions. status is never fabricated: not_configured means no token exists for that provider on this page/brand, pending means enqueued but not yet dispatched, sent/failed reflect the real Edge Function outcome.';

create unique index tracking_dispatch_log_dedup_idx on public.tracking_dispatch_log (provider, event_id);
create index tracking_dispatch_log_status_idx on public.tracking_dispatch_log (status) where status = 'pending';
create index tracking_dispatch_log_workspace_id_idx on public.tracking_dispatch_log (workspace_id);
create index tracking_dispatch_log_order_id_idx on public.tracking_dispatch_log (order_id) where order_id is not null;

create trigger set_tracking_dispatch_log_updated_at
  before update on public.tracking_dispatch_log
  for each row execute function public.set_updated_at();

alter table public.tracking_dispatch_log enable row level security;

create policy "select_tracking_dispatch_log" on public.tracking_dispatch_log
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.tracking.view') or public.user_has_permission(workspace_id, 'landing_pages.tracking.manage'))
  );

-- No client insert/update/delete policy — the queue is exclusively
-- written by enqueue_tracking_event() (below, SECURITY DEFINER) and
-- updated only by the Edge Function via the service_role key, which
-- bypasses RLS entirely (never by an authenticated staff session).


create or replace function public.enqueue_tracking_event(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_landing_page_id uuid,
  p_order_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status record;
  v_meta_status text;
  v_tiktok_status text;
begin
  if p_landing_page_id is null then
    return;
  end if;

  select * into v_status from public.resolve_landing_page_tracking_status_internal(p_landing_page_id);

  v_meta_status := case when v_status.meta_enabled and v_status.meta_pixel_id is not null then
    case when v_status.meta_capi_configured then 'pending' else 'not_configured' end
  else null end;
  v_tiktok_status := case when v_status.tiktok_enabled and v_status.tiktok_pixel_id is not null then
    case when v_status.tiktok_events_configured then 'pending' else 'not_configured' end
  else null end;

  if v_meta_status is not null then
    insert into public.tracking_dispatch_log (workspace_id, brand_id, landing_page_id, order_id, provider, event_type, event_id, status)
    values (p_workspace_id, p_brand_id, p_landing_page_id, p_order_id, 'meta', p_event_type,
      p_event_type || ':meta:' || coalesce(p_order_id::text, p_landing_page_id::text), v_meta_status)
    on conflict (provider, event_id) do nothing;
  end if;

  if v_tiktok_status is not null then
    insert into public.tracking_dispatch_log (workspace_id, brand_id, landing_page_id, order_id, provider, event_type, event_id, status)
    values (p_workspace_id, p_brand_id, p_landing_page_id, p_order_id, 'tiktok', p_event_type,
      p_event_type || ':tiktok:' || coalesce(p_order_id::text, p_landing_page_id::text), v_tiktok_status)
    on conflict (provider, event_id) do nothing;
  end if;
end;
$$;

comment on function public.enqueue_tracking_event(uuid, uuid, uuid, uuid, text) is
  'Called from order-lifecycle triggers (PART F) to enqueue a conversion event per enabled+configured provider. event_id = event_type:provider:order_id is deterministic, so re-enqueueing the same fact (e.g. a retried trigger) is a guaranteed no-op via the unique (provider, event_id) index — this IS the dedup mechanism, and it also protects Meta/TikTok-side dedup since the same key is reused as the outbound event_id.';


-- ---------------------------------------------------------------
-- PART E — order-level attribution columns + 4 new section types.
-- ---------------------------------------------------------------
alter table public.orders add column if not exists utm_source text;
alter table public.orders add column if not exists utm_medium text;
alter table public.orders add column if not exists utm_campaign text;
alter table public.orders add column if not exists utm_term text;
alter table public.orders add column if not exists utm_content text;
alter table public.orders add column if not exists fbclid text;
alter table public.orders add column if not exists ttclid text;

comment on column public.orders.fbclid is 'Meta click identifier captured from the landing page URL at order creation — used only for CAPI attribution, never treated as a payment/tracking source of truth.';
comment on column public.orders.ttclid is 'TikTok click identifier, same discipline as fbclid.';

alter table public.landing_page_sections drop constraint landing_page_sections_type_check;
alter table public.landing_page_sections add constraint landing_page_sections_type_check
  check (type in (
    'HERO', 'TRUST_STRIP', 'TEXT', 'IMAGE_TEXT', 'BENEFITS', 'HOW_IT_WORKS',
    'TESTIMONIALS', 'FAQ', 'CTA_BANNER', 'PACKAGE_SELECTOR', 'ORDER_FORM',
    'PROBLEM_AWARENESS', 'INGREDIENTS', 'COMPARISON', 'GUARANTEE'
  ));

comment on constraint landing_page_sections_type_check on public.landing_page_sections is
  'PROBLEM_AWARENESS/INGREDIENTS/COMPARISON/GUARANTEE added in 0031 for the new template architectures (root-cause/formula-explanation/comparison-table/risk-reversal sections) — additive, no existing row is affected.';


-- ---------------------------------------------------------------
-- PART F0 — find_or_create_customer(): add an optional market
-- country-code override. Unchanged for create_order() (which never
-- passes it, so v_workspace_country still drives phone normalization
-- exactly as before) — but create_public_order() must now pass the
-- PAGE's own market_country_code, since a page's market can differ
-- from its workspace's default. Without this fix, a Kenya-market
-- landing page would silently normalize customer phone numbers using
-- the workspace's (e.g. Nigeria) dial code.
-- ---------------------------------------------------------------
drop function if exists public.find_or_create_customer(uuid, uuid, text, text, text, text, text, text, text);

create or replace function public.find_or_create_customer(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_address text default null,
  p_acquisition_source text default null,
  p_country_code text default null
)
returns table (customer_id uuid, is_repeat boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text;
  v_dial_code text;
  v_canonical_phone text;
  v_first_name text;
  v_last_name text;
  v_customer_id uuid;
  v_is_repeat boolean;
begin
  if p_country_code is not null then
    v_country := p_country_code;
  else
    select country_code into v_country from public.workspaces where id = p_workspace_id;
  end if;
  select dial_code into v_dial_code from public.countries where code = v_country;

  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select c.id into v_customer_id from public.customers c
    where c.workspace_id = p_workspace_id and c.brand_id = p_brand_id
      and c.canonical_phone = v_canonical_phone and c.deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, acquisition_source, created_by, updated_by
    ) values (
      p_workspace_id, p_brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      p_customer_email, v_country, p_customer_state, p_customer_city, p_customer_address, p_acquisition_source,
      auth.uid(), auth.uid()
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders o where o.customer_id = v_customer_id and o.deleted_at is null
  ) into v_is_repeat;

  return query select v_customer_id, v_is_repeat;
end;
$$;

comment on function public.find_or_create_customer(uuid, uuid, text, text, text, text, text, text, text, text) is
  'Shared customer find-or-create by canonical phone, used by both create_order() and create_public_order(). p_country_code lets a caller override the workspace''s own country (e.g. a landing page whose market differs from its workspace) for phone normalization; create_order() never passes it, so its behavior is unchanged.';


-- ---------------------------------------------------------------
-- PART E1 — a genuine pre-existing bug, found by testing
-- create_public_order() as an actual anonymous caller (auth.uid() is
-- NULL for a real public visitor — every prior test of this RPC, in
-- 0021 and since, appears to have run as an authenticated stand-in
-- user instead, which never exercised this path).
--
-- adjust_inventory()'s permission check (0015) accepts orders.create/
-- orders.update for reference_type='order' movements, but that check
-- is user_has_permission(), which resolves against auth.uid() — NULL
-- for anon. So EVERY public COD order for a product with
-- track_inventory=true (the default) has been failing at the
-- inventory-reservation step since 0021 shipped. This blocks the
-- core "COD form works" / "public order creation" acceptance
-- criteria this phase is required to certify.
--
-- Fix: split adjust_inventory() into a private, permission-free
-- mutation core (adjust_inventory_internal — EXECUTE revoked from
-- anon/authenticated, callable only from another SECURITY DEFINER
-- function, which runs as the table owner regardless of who the
-- original client was) and a public wrapper that keeps the EXACT
-- same permission check as before for every existing caller.
-- create_public_order() calls the internal core directly, trusting
-- the legitimacy checks it already performed (published page,
-- enabled package, active product) instead of re-deriving permission
-- from an auth.uid() that is correctly, legitimately NULL. No
-- existing caller of adjust_inventory() changes behavior at all.
-- ---------------------------------------------------------------
create or replace function public.adjust_inventory_internal(
  p_product_id uuid,
  p_transaction_type text,
  p_quantity integer,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_prev_quantity integer;
  v_new_quantity integer;
  v_new_stock integer;
  v_new_reserved integer;
  v_txn public.inventory_transactions;
begin
  if p_transaction_type not in ('STOCK_IN', 'STOCK_OUT', 'RESERVED', 'RELEASED', 'SOLD', 'RETURNED', 'DAMAGED', 'ADJUSTMENT') then
    raise exception 'Unknown transaction_type %', p_transaction_type;
  end if;

  if p_transaction_type <> 'ADJUSTMENT' and (p_quantity is null or p_quantity <= 0) then
    raise exception 'quantity must be positive for transaction_type %', p_transaction_type;
  end if;

  if p_transaction_type = 'ADJUSTMENT' and (p_quantity is null or p_quantity = 0) then
    raise exception 'quantity must be non-zero for an ADJUSTMENT';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

  v_new_stock := v_product.stock_quantity;
  v_new_reserved := v_product.reserved_quantity;

  case p_transaction_type
    when 'STOCK_IN' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := v_product.stock_quantity + p_quantity;
      v_new_quantity := v_new_stock;
    when 'STOCK_OUT' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := greatest(v_product.stock_quantity - p_quantity, 0);
      v_new_quantity := v_new_stock;
    when 'RESERVED' then
      v_prev_quantity := v_product.reserved_quantity;
      v_new_reserved := v_product.reserved_quantity + p_quantity;
      v_new_quantity := v_new_reserved;
    when 'RELEASED' then
      v_prev_quantity := v_product.reserved_quantity;
      v_new_reserved := greatest(v_product.reserved_quantity - p_quantity, 0);
      v_new_quantity := v_new_reserved;
    when 'SOLD' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_reserved := greatest(v_product.reserved_quantity - p_quantity, 0);
      v_new_stock := greatest(v_product.stock_quantity - p_quantity, 0);
      v_new_quantity := v_new_stock;
    when 'RETURNED' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := v_product.stock_quantity + p_quantity;
      v_new_quantity := v_new_stock;
    when 'DAMAGED' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := greatest(v_product.stock_quantity - p_quantity, 0);
      v_new_quantity := v_new_stock;
    when 'ADJUSTMENT' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := greatest(v_product.stock_quantity + p_quantity, 0);
      v_new_quantity := v_new_stock;
  end case;

  perform set_config('gcos.allow_stock_write', 'on', true);
  update public.products
    set stock_quantity = v_new_stock, reserved_quantity = v_new_reserved
    where id = p_product_id;
  perform set_config('gcos.allow_stock_write', 'off', true);

  insert into public.inventory_transactions (
    workspace_id, brand_id, product_id, transaction_type, quantity,
    previous_quantity, new_quantity, reason, reference_type, reference_id, created_by
  ) values (
    v_product.workspace_id, v_product.brand_id, p_product_id, p_transaction_type, p_quantity,
    v_prev_quantity, v_new_quantity, p_reason, p_reference_type, p_reference_id, auth.uid()
  )
  returning * into v_txn;

  if v_product.track_inventory and v_new_stock <= v_product.low_stock_threshold then
    if not exists (
      select 1 from public.notifications
      where workspace_id = v_product.workspace_id
        and type = 'inventory_low'
        and is_archived = false
        and is_read = false
        and (metadata ->> 'product_id')::uuid = p_product_id
    ) then
      insert into public.notifications (workspace_id, brand_id, type, title, message, priority, link, metadata)
      values (
        v_product.workspace_id,
        v_product.brand_id,
        'inventory_low',
        'Low stock: ' || v_product.name,
        'Available stock (' || v_new_stock || ') is at or below the low stock threshold (' || v_product.low_stock_threshold || ').',
        'high',
        '/products/inventory',
        jsonb_build_object('product_id', p_product_id, 'stock_quantity', v_new_stock, 'low_stock_threshold', v_product.low_stock_threshold)
      );
    end if;
  end if;

  return v_txn;
end;
$$;

comment on function public.adjust_inventory_internal(uuid, text, integer, text, text, uuid) is
  'The actual stock-mutation core, with NO permission check of its own — it trusts that whichever SECURITY DEFINER function called it already established legitimacy. Not directly callable by any client role (see the REVOKE below); adjust_inventory() is the permission-checked public entrypoint for every staff-facing caller, and create_public_order() calls this directly for the one legitimate case where the caller is correctly, deliberately unauthenticated.';

revoke execute on function public.adjust_inventory_internal(uuid, text, integer, text, text, uuid) from public, anon, authenticated;

create or replace function public.adjust_inventory(
  p_product_id uuid,
  p_transaction_type text,
  p_quantity integer,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.products where id = p_product_id;
  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

  if not (
    public.user_has_permission(v_workspace_id, 'inventory.update')
    or public.user_has_permission(v_workspace_id, 'inventory.create')
    or (
      p_reference_type = 'order'
      and (
        public.user_has_permission(v_workspace_id, 'orders.create')
        or public.user_has_permission(v_workspace_id, 'orders.update')
      )
    )
  ) then
    raise exception 'insufficient_permission: inventory.update, inventory.create, or orders.create/orders.update (for order-referenced movements) required';
  end if;

  return public.adjust_inventory_internal(p_product_id, p_transaction_type, p_quantity, p_reason, p_reference_type, p_reference_id);
end;
$$;

comment on function public.adjust_inventory(uuid, text, integer, text, text, uuid) is
  'The only sanctioned way for a STAFF-authenticated caller to move product stock — byte-identical permission behavior to 0015. Delegates the actual mutation to adjust_inventory_internal(). A genuinely anonymous public-order caller never reaches this function at all (see create_public_order(), which calls adjust_inventory_internal() directly).';


-- ---------------------------------------------------------------
-- PART F — create_public_order(): rebuilt on top of the 0022 baseline
-- (the TRUE latest prior definition — 0022 already fixed
-- order_items.unit_cost/package_id/package_name snapshotting, nullable
-- v_page.product_id, and an inline market-aware customer upsert; an
-- earlier draft of this migration mistakenly rebased on the STALE 0021
-- version and regressed all three, breaking 101_finance_smoke_test.sql).
-- Layered on top: fbclid/ttclid, an affiliate referral code (mirroring
-- create_order()'s EXACT resolution pattern from 0024 — not a second
-- affiliate system), and an ORDER_CREATED tracking-event enqueue. Price
-- resolution is UNCHANGED: still landing_page_packages.price, resolved
-- server-side only — the client never supplies a price.
-- ---------------------------------------------------------------
drop function if exists public.create_public_order(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.create_public_order(
  p_landing_page_slug text,
  p_package_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_email text default null,
  p_customer_address_2 text default null,
  p_landmark text default null,
  p_customer_notes text default null,
  p_submission_token text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_fbclid text default null,
  p_ttclid text default null,
  p_affiliate_referral_code text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.landing_pages%rowtype;
  v_package public.landing_page_packages%rowtype;
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_dial_code text;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_is_repeat boolean;
  v_order_number text;
  v_shipping numeric;
  v_total numeric;
  v_unit_price numeric;
  v_affiliate public.affiliates%rowtype;
  v_affiliate_id uuid;
begin
  select * into v_page from public.landing_pages
    where slug = p_landing_page_slug and status = 'published' and deleted_at is null;
  if not found then
    raise exception 'This page is not available';
  end if;

  select * into v_package from public.landing_page_packages
    where id = p_package_id and landing_page_id = v_page.id and enabled = true;
  if not found then
    raise exception 'This package is not available';
  end if;

  if v_page.product_id is not null then
    select * into v_product from public.products
      where id = v_page.product_id and deleted_at is null;
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Full name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'Phone number is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'Delivery address is required';
  end if;

  if p_submission_token is not null then
    select * into v_existing from public.orders
      where workspace_id = v_page.workspace_id and idempotency_key = p_submission_token;
    if found then
      return v_existing;
    end if;
  end if;

  -- Same affiliate-resolution pattern as create_order() (0024): a
  -- referral code that doesn't resolve to an approved/active affiliate
  -- in THIS workspace is silently ignored (v_affiliate_id stays null)
  -- rather than rejecting the order — an invalid/expired ?ref= code
  -- must never block a real customer from checking out.
  if coalesce(trim(p_affiliate_referral_code), '') <> '' then
    select * into v_affiliate from public.affiliates
      where workspace_id = v_page.workspace_id and referral_code = upper(trim(p_affiliate_referral_code))
        and approval_status = 'approved' and status = 'active' and deleted_at is null;
    if found then
      v_affiliate_id := v_affiliate.id;
    end if;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_page.market_country_code;
  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select id into v_customer_id from public.customers
    where workspace_id = v_page.workspace_id and brand_id = v_page.brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, address_2, landmark, acquisition_source,
      created_by, updated_by
    ) values (
      v_page.workspace_id, v_page.brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      nullif(trim(p_customer_email), ''), v_page.market_country_code, p_customer_state, p_customer_city,
      trim(p_customer_address), p_customer_address_2, p_landmark, 'landing_page',
      null, null
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  v_shipping := public.compute_shipping_fee(v_package.shipping_rule, p_customer_state);
  v_total := v_package.price + v_shipping;

  v_order_number := public.generate_order_number(v_page.workspace_id);
  v_unit_price := case when v_package.quantity > 0 then round(v_package.price / v_package.quantity, 2) else v_package.price end;

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    landing_page_id, source_detail, metadata, idempotency_key, is_repeat_customer,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, ttclid,
    affiliate_id, affiliate_referral_code_used,
    created_by, updated_by
  ) values (
    v_page.workspace_id, v_page.brand_id, v_order_number, 'landing_page', 'NEW', 'normal',
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), v_page.market_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2, p_customer_notes,
    v_page.market_currency_code, v_package.price, v_shipping, 0, v_total,
    coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_package.price - coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_page.id, v_page.name,
    jsonb_build_object('landing_page_package_id', v_package.id, 'landmark', p_landmark),
    p_submission_token, v_is_repeat,
    nullif(trim(p_utm_source), ''), nullif(trim(p_utm_medium), ''), nullif(trim(p_utm_campaign), ''),
    nullif(trim(p_utm_term), ''), nullif(trim(p_utm_content), ''), nullif(trim(p_fbclid), ''), nullif(trim(p_ttclid), ''),
    v_affiliate_id, case when v_affiliate_id is not null then upper(trim(p_affiliate_referral_code)) else null end,
    null, null
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, workspace_id, brand_id, product_id, product_name, sku, package_id, package_name,
    quantity, unit_price, unit_cost, compare_price, total_amount, metadata
  ) values (
    v_order.id, v_page.workspace_id, v_page.brand_id, v_page.product_id, coalesce(v_product.name, v_package.name), v_product.sku,
    v_package.id, v_package.name,
    v_package.quantity, v_unit_price, v_product.cost_price, v_package.compare_at_price, v_package.price,
    jsonb_build_object('landing_page_package_id', v_package.id, 'package_name', v_package.name)
  );

  if v_product.id is not null and v_product.track_inventory then
    -- adjust_inventory_internal(), not adjust_inventory(): a real
    -- public visitor has no auth.uid() at all, so the permission
    -- check in adjust_inventory() can never pass for them — see PART
    -- E1. Legitimacy here was already established above (published
    -- page, enabled package, active product), which is the correct
    -- gate for an anonymous order, not a staff permission.
    perform public.adjust_inventory_internal(
      v_product.id, 'RESERVED', v_package.quantity,
      'Order ' || v_order_number || ' created (landing page: ' || v_page.name || ')', 'order', v_order.id
    );
  end if;

  perform public.enqueue_tracking_event(v_page.workspace_id, v_page.brand_id, v_page.id, v_order.id, 'ORDER_CREATED');

  return v_order;
end;
$$;

comment on function public.create_public_order(
  text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) is
  'The only way an anonymous visitor can create an order. Price/cost always resolved server-side from landing_page_packages/products — p_package_id carries no price, and the client cannot influence it (a browser sending price=1 has no effect: the RPC never accepts a price parameter at all). Snapshots order_items.unit_cost/package_id/package_name for Product Performance COGS attribution. Supports product-less pages (v_page.product_id nullable). fbclid/ttclid/UTM land in dedicated orders columns; affiliate_referral_code resolves through the exact same rules as the internal create_order().';


-- ---------------------------------------------------------------
-- PART G — order-lifecycle tracking enqueue triggers. ORDER_CREATED
-- is already enqueued inline by create_public_order() above (PART F)
-- — these two cover the two status transitions COD tracking actually
-- cares about: confirmation, and the ONLY point revenue is realized
-- (delivered + cash collected). CANCELLED is logged for suppression
-- bookkeeping, never as a conversion.
-- ---------------------------------------------------------------
create or replace function public.enqueue_order_tracking_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.landing_page_id is null then
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'PENDING' then
    perform public.enqueue_tracking_event(new.workspace_id, new.brand_id, new.landing_page_id, new.id, 'ORDER_CONFIRMED');
  end if;

  -- The ONLY Purchase-equivalent event: delivered AND cash actually
  -- collected — order creation/confirmation/dispatch never fire this,
  -- exactly per the existing Finance delivered-revenue rule (see
  -- get_finance_summary()). A delivered order with an outstanding or
  -- partial cash_collection_status never enqueues PURCHASE.
  if new.status = 'DELIVERED' and new.cash_collection_status = 'collected'
     and (old.status is distinct from new.status or old.cash_collection_status is distinct from new.cash_collection_status) then
    perform public.enqueue_tracking_event(new.workspace_id, new.brand_id, new.landing_page_id, new.id, 'PURCHASE');
  end if;

  if new.status is distinct from old.status and new.status = 'CANCELLED' then
    perform public.enqueue_tracking_event(new.workspace_id, new.brand_id, new.landing_page_id, new.id, 'ORDER_CANCELLED');
  end if;

  return new;
end;
$$;

comment on function public.enqueue_order_tracking_events() is
  'COD discipline: Order Created != Revenue, Confirmed != Revenue, Delivered-but-not-collected != Revenue. PURCHASE is enqueued ONLY on delivered+collected, mirroring the existing Finance definition of delivered revenue exactly — this migration does not introduce a second definition of revenue.';

create trigger orders_enqueue_tracking_events
  after update on public.orders
  for each row execute function public.enqueue_order_tracking_events();


-- ---------------------------------------------------------------
-- PART H — seed the 4 system templates. starter_sections uses the
-- SAME section types/config shape landing_page_sections already
-- accepts; content is placeholder/example copy the workspace edits
-- before publishing (never auto-published). Template 4's content is
-- adapted specifically for Ginseng Five Treasures Tea per the brief,
-- and deliberately avoids disease-treatment/cure/guaranteed-outcome
-- claims — every claim is editable copy in `config`, not engine logic.
-- ---------------------------------------------------------------
insert into public.landing_page_templates (workspace_id, name, slug, description, template_key, is_system, status, starter_sections, default_theme) values
(
  null, 'Wellness COD Funnel', 'wellness-cod-funnel',
  'Long-form COD wellness funnel: urgency banner, hero, social proof, problem/root-cause, formula explanation, benefits, comparison, transformation, FAQ, order form.',
  'template_1', true, 'active',
  '[
    {"type":"CTA_BANNER","config":{"style":"urgency_banner","text":"Limited Stock — Pay on Delivery, Nationwide","cta_label":"Order Now","anchor":"order-form"}},
    {"type":"HERO","config":{"headline":"Feel the Difference in Weeks, Not Months","subheadline":"A daily wellness ritual thousands of customers trust.","cta_label":"Order Now — Pay on Delivery","anchor":"order-form","image_url":null}},
    {"type":"TRUST_STRIP","config":{"items":["Pay on Delivery","Fast Nationwide Shipping","Thousands of Happy Customers"]}},
    {"type":"PROBLEM_AWARENESS","config":{"headline":"Why You Might Be Feeling Off","body":"Modern routines can quietly drain daily energy and wellness — most people never trace it back to the real cause."}},
    {"type":"TEXT","config":{"headline":"The Root Cause, Explained","body":"Describe the underlying wellness gap this product addresses, in plain language."}},
    {"type":"INGREDIENTS","config":{"headline":"What Is Inside", "items":[{"name":"Ingredient 1","description":"Traditional herbal ingredient and its role."},{"name":"Ingredient 2","description":"Traditional herbal ingredient and its role."}]}},
    {"type":"BENEFITS","config":{"headline":"What You Can Expect","items":["Daily energy support","General wellness support","Digestive comfort"]}},
    {"type":"COMPARISON","config":{"headline":"Why This, Not That","rows":[{"label":"Convenience","us":"Simple daily ritual","them":"Complicated regimens"},{"label":"Ingredients","us":"Traditional herbal blend","them":"Unclear formulations"}]}},
    {"type":"HOW_IT_WORKS","config":{"headline":"Your Transformation, Step by Step","steps":["Order today, pay on delivery","Start your daily ritual","Feel the difference over weeks of consistent use"]}},
    {"type":"FAQ","config":{"items":[{"q":"Is this safe to use daily?","a":"Follow the label instructions; consult a healthcare professional if you have a medical condition."},{"q":"How is it shipped?","a":"Nationwide delivery, pay when it arrives."}]}},
    {"type":"CTA_BANNER","config":{"style":"final_cta","text":"Ready to Feel the Difference?","cta_label":"Order Now","anchor":"order-form"}},
    {"type":"PACKAGE_SELECTOR","config":{}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb,
  '{"primaryColor":"#166534","radius":"lg"}'::jsonb
),
(
  null, 'Editorial Apothecary Funnel', 'editorial-apothecary-funnel',
  'Premium editorial/apothecary wellness COD funnel: trust strip, hero, product positioning, formula, ritual/how-to-use, differentiation, buyer feedback, package selector, sticky CTA.',
  'template_2', true, 'active',
  '[
    {"type":"TRUST_STRIP","config":{"items":["Traditional Herbal Blend","Pay on Delivery","Crafted in Small Batches"]}},
    {"type":"HERO","config":{"headline":"A Daily Ritual, Rooted in Tradition","subheadline":"Thoughtfully blended for everyday wellness.","cta_label":"Discover the Ritual","anchor":"order-form","image_url":null}},
    {"type":"IMAGE_TEXT","config":{"headline":"Positioned for the Modern Ritual","body":"Describe the products premium positioning and origin story.","image_url":null,"image_side":"right"}},
    {"type":"PROBLEM_AWARENESS","config":{"headline":"The Signs Worth Paying Attention To","body":"Everyday fatigue, sluggish digestion, and low vitality are easy to dismiss — until they are not."}},
    {"type":"INGREDIENTS","config":{"headline":"The Formula","items":[{"name":"Ingredient 1","description":"Role in the blend."},{"name":"Ingredient 2","description":"Role in the blend."}]}},
    {"type":"HOW_IT_WORKS","config":{"headline":"The Ritual","steps":["Prepare your daily serving","Enjoy it as part of your morning or evening routine","Stay consistent for best results over time"]}},
    {"type":"BENEFITS","config":{"headline":"What This Ritual Supports","items":["Daily vitality","Digestive wellness","A calm, consistent routine"]}},
    {"type":"COMPARISON","config":{"headline":"Why This Blend Is Different","rows":[{"label":"Sourcing","us":"Traditional herbal ingredients","them":"Unclear sourcing"}]}},
    {"type":"TEXT","config":{"headline":"A Ritual, Over Time","body":"Describe how the experience is intended to build over weeks of consistent use."}},
    {"type":"FAQ","config":{"items":[{"q":"How do I prepare it?","a":"Follow the on-pack preparation instructions."},{"q":"Is it safe alongside other routines?","a":"Consult a healthcare professional if you have a medical condition or take medication."}]}},
    {"type":"TESTIMONIALS","config":{"items":[]}},
    {"type":"PACKAGE_SELECTOR","config":{}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb,
  '{"primaryColor":"#7c2d12","radius":"md"}'::jsonb
),
(
  null, 'Product Spotlight Funnel', 'product-spotlight-funnel',
  'Product-focused COD page: hero, product explanation, results, testimonials, package selector, pricing, mobile sticky CTA.',
  'template_3', true, 'active',
  '[
    {"type":"HERO","config":{"headline":"Meet Your New Daily Essential","subheadline":"See why customers keep coming back.","cta_label":"Shop Now","anchor":"order-form","image_url":null}},
    {"type":"IMAGE_TEXT","config":{"headline":"What Makes It Work","body":"Explain the product mechanism/formulation in plain language.","image_url":null,"image_side":"left"}},
    {"type":"BENEFITS","config":{"headline":"Results You Can Expect","items":["Benefit 1","Benefit 2","Benefit 3"]}},
    {"type":"TESTIMONIALS","config":{"items":[]}},
    {"type":"COMPARISON","config":{"headline":"How It Compares","rows":[{"label":"Ease of Use","us":"Simple daily use","them":"Complicated alternatives"}]}},
    {"type":"FAQ","config":{"items":[{"q":"How long until I see results?","a":"Individual results vary; consistent daily use over several weeks is recommended."}]}},
    {"type":"CTA_BANNER","config":{"style":"final_cta","text":"Get Yours Today","cta_label":"Order Now","anchor":"order-form"}},
    {"type":"PACKAGE_SELECTOR","config":{}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb,
  '{"primaryColor":"#1d4ed8","radius":"lg"}'::jsonb
),
(
  null, 'Ginseng Five Treasures Tea — Conversion Funnel', 'ginseng-five-treasures-conversion-funnel',
  'High-conversion long-form architecture (attention bar -> hero -> proof -> problem/root-cause -> formula -> benefits -> differentiation -> trust -> offer/package selector -> risk reversal -> FAQ -> final CTA). Original GCOS copy — not a copy of any third-party page.',
  'template_4', true, 'active',
  '[
    {"type":"CTA_BANNER","config":{"style":"urgency_banner","text":"Today Only: Pay on Delivery + Fast Nationwide Shipping","cta_label":"Claim Yours","anchor":"order-form"}},
    {"type":"HERO","config":{"headline":"The Daily Ritual Behind Real, Lasting Wellness","subheadline":"Ginseng Five Treasures Tea — a traditional herbal blend for everyday vitality.","cta_label":"Claim Yours Now","anchor":"order-form","image_url":null}},
    {"type":"TRUST_STRIP","config":{"items":["Pay on Delivery","Traditional Herbal Blend","Nationwide Delivery"]}},
    {"type":"TEXT","config":{"headline":"Why This Matters","body":"Everyday energy, digestion, and overall vitality are easy to take for granted — until a routine starts to feel harder than it should."}},
    {"type":"PROBLEM_AWARENESS","config":{"headline":"The Root of the Problem","body":"Low daily energy and sluggish digestion are rarely random — they are often the quiet result of routines that never leave room for real wellness support."}},
    {"type":"TEXT","config":{"headline":"What Happens If It Is Ignored","body":"Left unaddressed, everyday fatigue and low vitality tend to compound over time rather than resolve on their own."}},
    {"type":"INGREDIENTS","config":{"headline":"Five Treasures, One Daily Ritual","items":[
      {"name":"Treasure 1","description":"Traditional herbal ingredient supporting daily energy."},
      {"name":"Treasure 2","description":"Traditional herbal ingredient supporting digestive wellness."},
      {"name":"Treasure 3","description":"Traditional herbal ingredient supporting overall vitality."},
      {"name":"Treasure 4","description":"Traditional herbal ingredient traditionally associated with kidney wellness support."},
      {"name":"Treasure 5","description":"Traditional herbal ingredient traditionally associated with liver wellness support."}
    ]}},
    {"type":"BENEFITS","config":{"headline":"What This Ritual Supports","items":["Daily energy and vitality","Digestive wellness","General wellness as part of a healthy routine","A simple, consistent daily ritual"]}},
    {"type":"TEXT","config":{"headline":"Who This Is For","body":"For anyone looking to add a simple, traditional wellness ritual to their daily routine — not a substitute for medical care."}},
    {"type":"COMPARISON","config":{"headline":"Why Ginseng Five Treasures Tea","rows":[
      {"label":"Ingredients","us":"Traditional five-ingredient herbal blend","them":"Unclear or single-ingredient formulas"},
      {"label":"Ritual","us":"Simple daily preparation","them":"Complicated regimens"},
      {"label":"Ordering","us":"Pay on delivery","them":"Prepay required"}
    ]}},
    {"type":"TESTIMONIALS","config":{"items":[]}},
    {"type":"GUARANTEE","config":{"headline":"Order With Confidence","body":"Pay only when your order arrives at your door — no upfront payment required."}},
    {"type":"FAQ","config":{"items":[
      {"q":"Is this a treatment for a medical condition?","a":"No. Ginseng Five Treasures Tea is a wellness ritual, not a treatment, cure, or substitute for medical care. Speak with a healthcare professional about any medical condition."},
      {"q":"How do I prepare it?","a":"Follow the on-pack preparation instructions for a simple daily ritual."},
      {"q":"How does delivery work?","a":"We deliver nationwide — you pay in cash when your order arrives."}
    ]}},
    {"type":"CTA_BANNER","config":{"style":"final_cta","text":"Start Your Daily Ritual Today","cta_label":"Claim Yours Now","anchor":"order-form"}},
    {"type":"PACKAGE_SELECTOR","config":{}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb,
  '{"primaryColor":"#065f46","radius":"lg"}'::jsonb
)
on conflict do nothing;


-- ---------------------------------------------------------------
-- PART I — landing_pages.template_id: additive, nullable (existing
-- rows are unaffected; page_type/starterSections() keeps working as
-- the legacy fallback for any code path that doesn't pass a template).
-- ---------------------------------------------------------------
alter table public.landing_pages add column if not exists template_id uuid references public.landing_page_templates (id) on delete set null;
create index landing_pages_template_id_idx on public.landing_pages (template_id) where template_id is not null;


-- ---------------------------------------------------------------
-- PART J — independent per-page market selection. Until now
-- set_landing_page_market() unconditionally overwrote
-- market_country_code/market_currency_code from the owning workspace
-- on every insert, so every landing page in a workspace was locked to
-- that one workspace's market. This is exactly the gap the brief
-- calls out: "Ginseng Five Tea — Kenya" and "Ginseng Five Tea —
-- Nigeria" must be able to coexist as two pages in the SAME
-- workspace/brand with different markets. The fix is additive and
-- backward compatible: if a market is explicitly supplied at insert
-- time, it is validated against the (already-seeded) countries/
-- currencies reference tables and used as-is; if not supplied (every
-- existing insert path today), behavior is byte-identical to before —
-- copy from the workspace.
-- ---------------------------------------------------------------
create or replace function public.set_landing_page_market()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country public.countries%rowtype;
begin
  if new.market_country_code is not null then
    select * into v_country from public.countries where code = new.market_country_code and is_active = true;
    if not found then
      raise exception 'Unknown or inactive market country_code: %', new.market_country_code;
    end if;
    new.market_currency_code := coalesce(new.market_currency_code, v_country.currency_code);
    return new;
  end if;

  select country_code, currency_code into new.market_country_code, new.market_currency_code
    from public.workspaces where id = new.workspace_id;
  return new;
end;
$$;

comment on function public.set_landing_page_market() is
  'If market_country_code is explicitly supplied at insert time, it is validated against countries.is_active and used as the page''s own market (market_currency_code defaults to that country''s currency unless also explicitly overridden). Otherwise, unchanged from 0021: copy the owning workspace''s market once, at insert time. This lets one product have distinct per-market landing pages within a single workspace/brand.';


-- ---------------------------------------------------------------
-- PART K — fix a genuine pre-existing defect found while validating
-- this migration locally: audit_landing_page_sections and
-- audit_landing_page_packages (0021) were wired to the GENERIC
-- log_audit_event(), whose UPDATE branch unconditionally references
-- new.deleted_at — a column that has never existed on either table.
-- The result: ANY update to a section or package (reorder, enable/
-- disable, edit content, delete-via-status) raises "record new has
-- no field deleted_at" and rolls back. This was never caught because
-- the original 0021 smoke test never exercised an UPDATE on either
-- table. Fixed the smallest possible way: point both triggers at the
-- SAME safe, dedicated log_ops_audit_event() already used by every
-- other no-soft-delete table (order_tasks, waybills,
-- delivery_attempts, assignment_rules, ...) — no change to
-- log_audit_event() itself, which is correct for every table that
-- DOES have deleted_at (products, categories, landing_pages).
-- ---------------------------------------------------------------
-- log_ops_audit_event() itself is INSERT/UPDATE-only (every existing
-- trigger using it is declared "after insert or update", never
-- delete) — sections/packages support a real hard DELETE (the
-- editor's remove-section/delete-package actions), which the OLD
-- generic log_audit_event() DID correctly audit (its DELETE branch
-- never touched deleted_at). So this table gets its own tiny
-- dedicated function rather than either reusing log_ops_audit_event()
-- (would silently under-log deletes) or touching the widely-shared
-- log_audit_event() (used correctly today by products/categories/
-- landing_pages, which DO have deleted_at).
create or replace function public.log_landing_page_content_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if TG_OP = 'DELETE' then
    insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value)
    values (old.workspace_id, old.brand_id, auth.uid(), TG_ARGV[0], 'delete', TG_ARGV[0], old.id, to_jsonb(old));
    return old;
  end if;
  v_action := case when TG_OP = 'INSERT' then 'create' else 'update' end;
  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value)
  values (
    new.workspace_id, new.brand_id, auth.uid(), TG_ARGV[0], v_action, TG_ARGV[0], new.id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists audit_landing_page_sections on public.landing_page_sections;
create trigger audit_landing_page_sections
  after insert or update or delete on public.landing_page_sections
  for each row execute function public.log_landing_page_content_audit_event('landing_pages');

drop trigger if exists audit_landing_page_packages on public.landing_page_packages;
create trigger audit_landing_page_packages
  after insert or update or delete on public.landing_page_packages
  for each row execute function public.log_landing_page_content_audit_event('landing_pages');
