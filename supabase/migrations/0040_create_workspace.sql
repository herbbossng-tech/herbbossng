-- ============================================================
-- Surgical fix: multi-workspace creation was never actually
-- possible. The database model (workspaces <-> user_roles many-to-
-- many) has always fully supported one user belonging to several
-- independent workspaces, and WorkspaceContext already fetches
-- every workspace RLS lets the caller see (never assumes exactly
-- one) — audited, both are correct. What never existed anywhere in
-- the system is a way to actually INSERT a second workspace: there
-- is no create-workspace RPC and no "New Workspace" UI. The only
-- self-service workspace-scoped form in the app is Workspace
-- Settings, which UPDATEs the caller's one existing workspace's
-- country/currency/etc — so "creating Kenya" was, in reality,
-- overwriting Nigeria's row. That is the entire root cause. This
-- migration adds the single missing piece: a safe, self-service
-- create_workspace() RPC. No existing table, RLS policy, or
-- workspace-scoped RPC needed to change.
-- ============================================================

create or replace function public.create_workspace(
  p_name text,
  p_country_code text,
  p_currency_code text,
  p_timezone text default null,
  p_brand_name text default null
)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws public.workspaces;
  v_owner_role_id uuid;
  v_slug text;
  v_brand_name text;
begin
  -- Any authenticated user may create a brand-new workspace for
  -- themselves — this is the standalone "start a new tenant" action
  -- every multi-tenant SaaS exposes (Slack/Notion "create a
  -- workspace" equivalent). It is not gated by any permission
  -- because the caller has no role in a workspace that does not yet
  -- exist; the RPC can only ever grant them Owner of the workspace
  -- it itself just created, never access to anyone else's.
  if v_uid is null then
    raise exception 'authentication_required: must be signed in to create a workspace';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'invalid_name: workspace name is required';
  end if;
  if length(p_name) > 120 then
    raise exception 'invalid_name: workspace name must be 120 characters or fewer';
  end if;

  if not exists (select 1 from public.countries where code = p_country_code and is_active) then
    raise exception 'invalid_country: % is not a supported, active country', p_country_code;
  end if;
  if not exists (select 1 from public.currencies where code = p_currency_code and is_active) then
    raise exception 'invalid_currency: % is not a supported, active currency', p_currency_code;
  end if;

  -- Slug derived from the name, de-duplicated with a short random
  -- suffix on collision (workspaces.slug is unique) rather than
  -- failing outright — a user should never be blocked from creating
  -- "Golden COD" a second time just because the slug collides.
  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  if exists (select 1 from public.workspaces where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  end if;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone, created_by)
  values (trim(p_name), v_slug, p_country_code, p_currency_code, coalesce(nullif(trim(p_timezone), ''), 'UTC'), v_uid)
  returning * into v_ws;

  -- A workspace needs at least one brand to be usable anywhere in
  -- the app (orders/landing pages/products are all brand-scoped) —
  -- create a sensible default the user can rename or add siblings to
  -- from Brands, exactly like the very first workspace's brand.
  v_brand_name := coalesce(nullif(trim(p_brand_name), ''), trim(p_name));
  insert into public.brands (workspace_id, name, slug, created_by)
  values (v_ws.id, v_brand_name, v_slug, v_uid);

  select id into v_owner_role_id from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id, created_by)
  values (v_uid, v_owner_role_id, v_ws.id, v_uid);

  -- Only backfill a default workspace if the caller doesn't already
  -- have one selected — creating a second/third workspace must never
  -- silently switch the user's default away from their first.
  update public.profiles set default_workspace_id = coalesce(default_workspace_id, v_ws.id) where id = v_uid;

  return v_ws;
end;
$$;

comment on function public.create_workspace(text, text, text, text, text) is
  'Self-service creation of a brand-new, independent workspace for the calling user, who becomes its Owner. Any authenticated user may call this — it can only ever create a new tenant and grant the caller Owner of that new tenant, never touch or grant access to an existing workspace. Existing workspaces the caller already belongs to are completely unaffected (this is a pure INSERT, never an UPDATE on any prior row) — fixes the reported "creating Kenya replaces Nigeria" bug, which was actually the absence of any creation path at all (Workspace Settings only ever UPDATEs the caller''s current workspace).';
