-- ================================================================
-- GCOS PHASE 11 — PRODUCTION INTEGRATION, TRACKING DISPATCH,
-- REALTIME & COMMUNICATION EXECUTION
--
-- This migration does NOT create a second tracking queue, a second
-- automation engine, or a second communication system. It extends
-- three things that already exist:
--
--   * tracking_dispatch_log (0031)        -> claim/retry/backoff
--   * communication_log (0028)            -> claim/retry/backoff +
--                                             real provider config
--   * execute_automation_action()/        -> SEND_* actions now queue
--     process_automation_event() (0028)      a real dispatch instead
--                                             of always being a no-op
--
-- The actual outbound HTTP calls to Meta CAPI, TikTok Events API, and
-- Resend happen in Supabase Edge Functions
-- (supabase/functions/dispatch-tracking-event,
-- supabase/functions/dispatch-communication) — Postgres cannot make
-- outbound HTTP calls in this project, and Phase 10 already documented
-- this on tracking_dispatch_log's own table comment. This migration
-- builds the claim/record RPCs those functions call via the
-- service_role key, plus the honest, non-fabricating status
-- vocabulary and idempotency/backoff machinery around them.
--
-- REUSED, NOT DUPLICATED:
--   * automation_rules/automation_executions/automation_execution_actions (0028)
--   * communication_log (0028) — extended, not replaced
--   * tracking_dispatch_log (0031) — extended, not replaced
--   * brand_tracking_secrets/landing_page_tracking_secrets (0031) —
--     read as-is by the new claim RPC, not duplicated
--   * brands.email_sender_name/email_sender_address (0002) — reused
--     as the Resend "from" identity; NOT re-added on the new secrets
--     table
--   * email_templates (0006) — reused by the Resend adapter
--   * user_has_permission_for() (0028) — reused for rule-owner checks
--   * FOR UPDATE SKIP LOCKED (already the pattern in
--     retry_pending_automation_executions(), 0028) — reused for the
--     new claim RPCs rather than inventing a different locking scheme
--   * the internal/public SECURITY DEFINER split pattern established
--     in 0031 (adjust_inventory_internal, resolve_landing_page_tracking_status_internal)
--   * the supabase_realtime publication guard pattern from 0023
-- ================================================================


-- ================================================================
-- PART A — PERMISSIONS. integrations.* is a new, deliberately coarse
-- cross-cutting "can see the health rollup" permission — it does not
-- expose anything beyond what landing_pages.tracking.view/
-- communications.view/automation.view already individually gate.
-- communications.* is new because configuring a Resend/SMS/WhatsApp
-- credential is a materially more sensitive capability than
-- automation.manage (authoring WHEN/IF/THEN rules) already grants.
-- Neither duplicates an existing permission — checked against the
-- full catalogue before adding these.
-- ================================================================
insert into public.permissions (module, action, slug, category, description) values
  ('integrations', 'view', 'integrations.view', 'Integrations', 'View the Integration Health Center (tracking dispatch, communications, automation retry queues)'),
  ('integrations', 'manage', 'integrations.manage', 'Integrations', 'Manually retry failed tracking/communication dispatches'),
  ('communications', 'view', 'communications.view', 'Communications', 'View outbound SMS/WhatsApp/email delivery status'),
  ('communications', 'manage', 'communications.manage', 'Communications', 'Configure email/SMS/WhatsApp provider credentials and manually retry failed sends')
on conflict (slug) do nothing;

-- Owner/Admin: everything in both new modules.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug in ('owner', 'admin') and p.module in ('integrations', 'communications')
on conflict do nothing;

-- Manager/Marketing/Viewer: view-only, same posture as automation.view
-- in 0028 — configuring provider credentials is an Owner/Admin decision.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug in ('manager', 'marketing', 'viewer') and p.slug in ('integrations.view', 'communications.view')
on conflict do nothing;

-- Customer Support, Warehouse Staff, Finance, Affiliate Manager get
-- nothing from either module — deliberate, matching the automation
-- module boundary from 0028.


-- ================================================================
-- PART B — tracking_dispatch_log: claim/retry/backoff. Additive
-- columns and an additive status widening only; every existing row
-- and every existing status value (not_configured/pending/sent/failed)
-- keeps its exact meaning.
-- ================================================================
alter table public.tracking_dispatch_log drop constraint tracking_dispatch_log_status_check;
alter table public.tracking_dispatch_log add constraint tracking_dispatch_log_status_check
  check (status in ('not_configured', 'pending', 'processing', 'sent', 'failed', 'retryable', 'permanently_failed'));

alter table public.tracking_dispatch_log add column if not exists attempts integer not null default 0;
alter table public.tracking_dispatch_log add column if not exists max_attempts integer not null default 6;
alter table public.tracking_dispatch_log add column if not exists next_retry_at timestamptz;
alter table public.tracking_dispatch_log add column if not exists claimed_at timestamptz;
alter table public.tracking_dispatch_log add column if not exists claimed_by text;
alter table public.tracking_dispatch_log add column if not exists dispatched_at timestamptz;
alter table public.tracking_dispatch_log add column if not exists failure_category text
  check (failure_category is null or failure_category in ('timeout', 'client_error', 'server_error', 'not_configured', 'unknown'));

create index tracking_dispatch_log_retry_idx on public.tracking_dispatch_log (status, next_retry_at) where status = 'retryable';
create index tracking_dispatch_log_processing_idx on public.tracking_dispatch_log (claimed_at) where status = 'processing';

comment on table public.tracking_dispatch_log is
  'Server-side conversion event queue for Meta CAPI / TikTok Events API. event_id is the dedup key ((provider, event_id) is unique) — the same order/event/provider combination is enqueued at most once. status is never fabricated: not_configured = no token exists for that provider on this page/brand (terminal, correct — never retried); pending/retryable = eligible for claim_tracking_dispatch_batch(); processing = claimed by a worker, mid-dispatch; sent = the Edge Function''s HTTP call to the provider genuinely succeeded; retryable = a transient failure, will be retried with exponential backoff up to max_attempts; permanently_failed = retries exhausted or a non-retryable provider error. A row stuck in processing for more than 10 minutes (worker crash) is reclaimed by the next claim call.';


-- claim_tracking_dispatch_batch(): the ONLY way pending/retryable/
-- stuck-processing rows are picked up. FOR UPDATE SKIP LOCKED is the
-- SAME primitive retry_pending_automation_executions() already uses
-- (0028) — reused here, not reinvented — so two dispatcher invocations
-- (or a crashed worker's row being reclaimed by a fresh one) can never
-- claim the same row twice. Resolves and returns everything the Edge
-- Function needs in ONE call (secrets + order/page context) so the
-- function never has to make a second privileged query per event.
-- SECURITY DEFINER with EXECUTE revoked from public/anon/authenticated
-- — callable only by the Supabase service_role key (Supabase's default
-- project grants leave service_role's EXECUTE untouched by this
-- REVOKE, exactly the same pattern 0031 used for
-- adjust_inventory_internal()/resolve_landing_page_tracking_status_internal()).
create or replace function public.claim_tracking_dispatch_batch(p_worker_id text, p_limit integer default 20)
returns table (
  id uuid,
  provider text,
  event_type text,
  event_id text,
  attempts integer,
  workspace_id uuid,
  brand_id uuid,
  landing_page_id uuid,
  order_id uuid,
  pixel_id text,
  access_token text,
  test_event_code text,
  landing_page_slug text,
  order_total numeric,
  order_currency text,
  customer_phone text,
  customer_email text,
  order_created_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  ttclid text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A single writable-CTE chain: `claimed` does the FOR UPDATE SKIP
  -- LOCKED selection, `updated` performs the UPDATE against exactly
  -- that set and RETURNING only its own columns (RETURNING cannot
  -- reference the extra joins needed for pixel/secret/order
  -- resolution), and the final SELECT joins those in afterward. This
  -- keeps the claim+resolve atomic within one statement without
  -- putting a second FROM after RETURNING, which Postgres rejects.
  return query
  with claimed as (
    select t.id from public.tracking_dispatch_log t
    where t.status = 'pending'
       or (t.status = 'retryable' and t.next_retry_at <= now())
       or (t.status = 'processing' and t.claimed_at < now() - interval '10 minutes')
    order by t.created_at
    limit p_limit
    for update skip locked
  ),
  updated as (
    update public.tracking_dispatch_log t
      set status = 'processing', attempts = t.attempts + 1, claimed_at = now(), claimed_by = p_worker_id, updated_at = now()
      from claimed
      where t.id = claimed.id
      returning t.*
  )
  select
    u.id, u.provider, u.event_type, u.event_id, u.attempts,
    u.workspace_id, u.brand_id, u.landing_page_id, u.order_id,
    case when u.provider = 'meta' then coalesce(lps.meta_pixel_id_override, br.meta_pixel_id) else coalesce(lps.tiktok_pixel_id_override, br.tiktok_pixel_id) end,
    case when u.provider = 'meta' then coalesce(lpts.meta_capi_access_token, bts.meta_capi_access_token) else coalesce(lpts.tiktok_access_token, bts.tiktok_access_token) end,
    case when u.provider = 'meta' then coalesce(lpts.meta_capi_test_event_code, bts.meta_capi_test_event_code) else null end,
    lp.slug,
    o.total_amount, o.currency_code, o.customer_phone, o.customer_email, o.created_at,
    o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content, o.utm_term, o.fbclid, o.ttclid
  from updated u
  left join public.landing_pages lp on lp.id = u.landing_page_id
  left join public.brands br on br.id = u.brand_id
  left join public.landing_page_tracking_secrets lpts on lpts.landing_page_id = u.landing_page_id
  left join public.brand_tracking_secrets bts on bts.brand_id = u.brand_id
  left join lateral (
    select
      (lp.tracking_config #>> '{meta,pixel_id}') as meta_pixel_id_override,
      (lp.tracking_config #>> '{tiktok,pixel_id}') as tiktok_pixel_id_override
  ) lps on true
  left join public.orders o on o.id = u.order_id;
end;
$$;

revoke execute on function public.claim_tracking_dispatch_batch(text, integer) from public, anon, authenticated;

comment on function public.claim_tracking_dispatch_batch(text, integer) is
  'Called only by the dispatch-tracking-event Edge Function via service_role. Atomically claims up to p_limit pending/retryable/stuck rows (FOR UPDATE SKIP LOCKED — two concurrent workers can never claim the same row) and resolves the exact secret/pixel/order data needed to build the provider payload in one round trip. Never callable by anon or authenticated — the secrets it returns must never reach a normal client session.';


create or replace function public.record_tracking_dispatch_result(
  p_id uuid,
  p_success boolean,
  p_provider_response jsonb default null,
  p_error_message text default null,
  p_retryable boolean default true,
  p_failure_category text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tracking_dispatch_log%rowtype;
begin
  select * into v_row from public.tracking_dispatch_log where id = p_id and status = 'processing';
  if not found then
    -- Already resolved (or never claimed) — never let a stale/duplicate
    -- callback flip an already-terminal row back to a different state.
    return;
  end if;

  if p_success then
    update public.tracking_dispatch_log
      set status = 'sent', provider_response = p_provider_response, error_message = null,
          dispatched_at = now(), next_retry_at = null, failure_category = null, updated_at = now()
      where id = p_id;
  elsif p_retryable and v_row.attempts < v_row.max_attempts then
    update public.tracking_dispatch_log
      set status = 'retryable', error_message = left(coalesce(p_error_message, ''), 2000),
          provider_response = p_provider_response,
          next_retry_at = now() + (least(power(2, v_row.attempts)::int * 30, 3600) || ' seconds')::interval,
          failure_category = p_failure_category, updated_at = now()
      where id = p_id;
  else
    update public.tracking_dispatch_log
      set status = 'permanently_failed', error_message = left(coalesce(p_error_message, ''), 2000),
          provider_response = p_provider_response, next_retry_at = null,
          failure_category = coalesce(p_failure_category, 'unknown'), updated_at = now()
      where id = p_id;
  end if;
end;
$$;

revoke execute on function public.record_tracking_dispatch_result(uuid, boolean, jsonb, text, boolean, text) from public, anon, authenticated;

comment on function public.record_tracking_dispatch_result(uuid, boolean, jsonb, text, boolean, text) is
  'Called only by the dispatch-tracking-event Edge Function via service_role, once per claimed row, after the real HTTP call to Meta/TikTok. Only acts on a row currently status=processing — a duplicate or late callback for an already-resolved row is a safe no-op, never a double-transition. Exponential backoff (30s * 2^attempts, capped at 1h) up to max_attempts, then permanently_failed. NEVER writes status=sent unless p_success is true, i.e. unless the caller''s own HTTP call genuinely succeeded.';


-- Staff-facing observability list (safe columns only — provider_response
-- is the PROVIDER''s response to US, never a secret, but is still only
-- exposed to staff holding landing_pages.tracking.view).
create or replace function public.list_tracking_dispatch_events(
  p_workspace_id uuid,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.tracking_dispatch_log
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.user_has_permission(p_workspace_id, 'landing_pages.tracking.view') or public.user_has_permission(p_workspace_id, 'integrations.view')) then
    raise exception 'insufficient_permission: landing_pages.tracking.view or integrations.view required';
  end if;
  return query
    select * from public.tracking_dispatch_log
    where workspace_id = p_workspace_id and (p_status is null or status = p_status)
    order by created_at desc
    limit least(p_limit, 200) offset greatest(p_offset, 0);
end;
$$;


create or replace function public.retry_tracking_dispatch_event(p_id uuid)
returns public.tracking_dispatch_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tracking_dispatch_log%rowtype;
begin
  select * into v_row from public.tracking_dispatch_log where id = p_id;
  if not found then
    raise exception 'Tracking dispatch event not found';
  end if;
  if not (public.user_has_permission(v_row.workspace_id, 'landing_pages.tracking.manage') or public.user_has_permission(v_row.workspace_id, 'integrations.manage')) then
    raise exception 'insufficient_permission: landing_pages.tracking.manage or integrations.manage required';
  end if;
  if v_row.status not in ('retryable', 'permanently_failed') then
    raise exception 'Only a retryable or permanently_failed event can be retried (current status: %)', v_row.status;
  end if;

  update public.tracking_dispatch_log
    set status = 'pending', attempts = 0, next_retry_at = null, error_message = null, failure_category = null, updated_at = now()
    where id = p_id
    returning * into v_row;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (v_row.workspace_id, v_row.brand_id, auth.uid(), 'integrations', 'manual_retry', 'tracking_dispatch_log', p_id,
    jsonb_build_object('provider', v_row.provider, 'event_type', v_row.event_type));

  return v_row;
end;
$$;

comment on function public.retry_tracking_dispatch_event(uuid) is
  'Manual, permission-gated retry: resets a stuck/failed event back to pending with attempts=0 so it is picked up by the next claim_tracking_dispatch_batch() call. Not-configured events cannot be retried this way (retrying them would still fail — the fix is configuring the provider, not resending).';


-- ================================================================
-- PART C — communication provider configuration. Same zero-client-RLS
-- secret-storage discipline as brand_tracking_secrets (0031). Sender
-- IDENTITY (name/address) already exists on brands
-- (email_sender_name/email_sender_address, 0002) and is reused as-is
-- — only the Resend API key and the not-yet-chosen SMS/WhatsApp
-- provider credentials are new.
-- ================================================================
create table public.brand_communication_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  email_provider text not null default 'resend' check (email_provider in ('resend')),
  email_api_key text,

  -- No SMS/WhatsApp provider has been selected anywhere in this
  -- repository (grep across src/supabase/.env.example found none) —
  -- these columns exist so the interface is provider-ready without
  -- GCOS inventing a provider choice on its own initiative. Until a
  -- provider name is set, resolve_brand_communication_config_internal()
  -- reports the channel as not_configured, honestly, regardless of
  -- whether an api_key column happens to be non-null.
  sms_provider text,
  sms_api_key text,
  sms_sender_id text,
  whatsapp_provider text,
  whatsapp_api_key text,
  whatsapp_phone_number_id text,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (brand_id)
);

comment on table public.brand_communication_secrets is
  'Brand-level email/SMS/WhatsApp provider credentials. RLS enabled with NO policies for any client role — reachable only through set_brand_communication_config() (write, tokens never returned), get_communication_config_status() (read, booleans only), resolve_brand_communication_config_internal() (internal resolver used by execute_automation_action() and claim_communication_log_batch()), and the service_role-only claim RPC. Never select this table directly from the frontend.';

alter table public.brand_communication_secrets enable row level security;

create trigger set_brand_communication_secrets_updated_at
  before update on public.brand_communication_secrets
  for each row execute function public.set_updated_at();


create or replace function public.resolve_brand_communication_config_internal(p_brand_id uuid, p_channel text)
returns table (configured boolean, provider text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case p_channel
      when 'email' then (email_provider is not null and email_api_key is not null)
      when 'sms' then (sms_provider is not null and sms_api_key is not null)
      when 'whatsapp' then (whatsapp_provider is not null and whatsapp_api_key is not null)
      else false
    end,
    case p_channel
      when 'email' then email_provider
      when 'sms' then sms_provider
      when 'whatsapp' then whatsapp_provider
      else null
    end
  from public.brand_communication_secrets
  where brand_id = p_brand_id
  union all
  select false, null
  where not exists (select 1 from public.brand_communication_secrets where brand_id = p_brand_id)
  limit 1;
$$;

revoke execute on function public.resolve_brand_communication_config_internal(uuid, text) from public, anon, authenticated;

comment on function public.resolve_brand_communication_config_internal(uuid, text) is
  'Permission-free internal resolver — never callable by anon/authenticated. Used by execute_automation_action() (runs as the SECURITY DEFINER owner, so it can call this directly) to decide queued vs not_configured without needing a staff permission, and by claim_communication_log_batch() for the same reason a genuinely anonymous/service actor cannot hold a staff permission.';


create or replace function public.set_brand_communication_config(
  p_brand_id uuid,
  p_email_api_key text default null,
  p_sms_provider text default null,
  p_sms_api_key text default null,
  p_sms_sender_id text default null,
  p_whatsapp_provider text default null,
  p_whatsapp_api_key text default null,
  p_whatsapp_phone_number_id text default null
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
  if not public.user_has_permission(v_brand.workspace_id, 'communications.manage') then
    raise exception 'insufficient_permission: communications.manage required';
  end if;

  -- NULL param = leave unchanged; empty string = explicitly clear.
  -- email_provider is always 'resend' (the only implemented adapter);
  -- sms_provider/whatsapp_provider are freely settable placeholders —
  -- setting one does not, by itself, make the channel "configured"
  -- unless an api_key is also present (see the resolver above).
  insert into public.brand_communication_secrets (
    workspace_id, brand_id, email_api_key, sms_provider, sms_api_key, sms_sender_id,
    whatsapp_provider, whatsapp_api_key, whatsapp_phone_number_id, updated_by
  ) values (
    v_brand.workspace_id, p_brand_id, nullif(p_email_api_key, ''), nullif(p_sms_provider, ''), nullif(p_sms_api_key, ''), nullif(p_sms_sender_id, ''),
    nullif(p_whatsapp_provider, ''), nullif(p_whatsapp_api_key, ''), nullif(p_whatsapp_phone_number_id, ''), auth.uid()
  )
  on conflict (brand_id) do update set
    email_api_key = case when p_email_api_key is null then brand_communication_secrets.email_api_key else nullif(p_email_api_key, '') end,
    sms_provider = case when p_sms_provider is null then brand_communication_secrets.sms_provider else nullif(p_sms_provider, '') end,
    sms_api_key = case when p_sms_api_key is null then brand_communication_secrets.sms_api_key else nullif(p_sms_api_key, '') end,
    sms_sender_id = case when p_sms_sender_id is null then brand_communication_secrets.sms_sender_id else nullif(p_sms_sender_id, '') end,
    whatsapp_provider = case when p_whatsapp_provider is null then brand_communication_secrets.whatsapp_provider else nullif(p_whatsapp_provider, '') end,
    whatsapp_api_key = case when p_whatsapp_api_key is null then brand_communication_secrets.whatsapp_api_key else nullif(p_whatsapp_api_key, '') end,
    whatsapp_phone_number_id = case when p_whatsapp_phone_number_id is null then brand_communication_secrets.whatsapp_phone_number_id else nullif(p_whatsapp_phone_number_id, '') end,
    updated_at = now(), updated_by = auth.uid();

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (
    v_brand.workspace_id, p_brand_id, auth.uid(), 'communications', 'update', 'brand_communication_config', p_brand_id,
    jsonb_build_object(
      'email_key_set', p_email_api_key is not null and p_email_api_key <> '',
      'sms_provider', p_sms_provider, 'sms_key_set', p_sms_api_key is not null and p_sms_api_key <> '',
      'whatsapp_provider', p_whatsapp_provider, 'whatsapp_key_set', p_whatsapp_api_key is not null and p_whatsapp_api_key <> ''
    )
  );
end;
$$;

comment on function public.set_brand_communication_config(uuid, text, text, text, text, text, text, text) is
  'The only write path for brand-level communication provider credentials. Audit logs record WHETHER a key changed, never the key value. Sender identity (name/address) is NOT managed here — it already exists on brands.email_sender_name/email_sender_address (0002) and is reused as-is by the Resend adapter.';


create or replace function public.get_communication_config_status(p_brand_id uuid)
returns table (email_configured boolean, email_provider text, sms_configured boolean, sms_provider text, whatsapp_configured boolean, whatsapp_provider text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.brands where id = p_brand_id;
  if not found then
    raise exception 'Brand not found';
  end if;
  if not public.user_has_permission(v_workspace_id, 'communications.view') then
    raise exception 'insufficient_permission: communications.view required';
  end if;

  return query
    select e.configured, e.provider, s.configured, s.provider, w.configured, w.provider
    from public.resolve_brand_communication_config_internal(p_brand_id, 'email') e,
         public.resolve_brand_communication_config_internal(p_brand_id, 'sms') s,
         public.resolve_brand_communication_config_internal(p_brand_id, 'whatsapp') w;
end;
$$;

comment on function public.get_communication_config_status(uuid) is
  'Staff-facing configured/not-configured status per channel — never returns a key value. Permission-gated (communications.view). Delegates to resolve_brand_communication_config_internal(), the same permission-free resolver the automation engine and dispatcher use.';


-- ================================================================
-- PART D — communication_log: claim/retry/idempotency. Additive
-- columns and an additive status widening only.
-- ================================================================
alter table public.communication_log drop constraint communication_log_status_check;
alter table public.communication_log add constraint communication_log_status_check
  check (status in ('not_configured', 'unsupported', 'queued', 'processing', 'sent', 'delivered', 'failed', 'retryable', 'permanently_failed'));

alter table public.communication_log add column if not exists idempotency_key text;
alter table public.communication_log add column if not exists attempts integer not null default 0;
alter table public.communication_log add column if not exists max_attempts integer not null default 5;
alter table public.communication_log add column if not exists next_retry_at timestamptz;
alter table public.communication_log add column if not exists claimed_at timestamptz;
alter table public.communication_log add column if not exists claimed_by text;
alter table public.communication_log add column if not exists dispatched_at timestamptz;
alter table public.communication_log add column if not exists failure_category text
  check (failure_category is null or failure_category in ('timeout', 'client_error', 'server_error', 'not_configured', 'unknown'));

create unique index communication_log_idempotency_idx on public.communication_log (idempotency_key) where idempotency_key is not null;
create index communication_log_retry_idx on public.communication_log (status, next_retry_at) where status = 'retryable';
create index communication_log_processing_idx on public.communication_log (claimed_at) where status = 'processing';

comment on table public.communication_log is
  'Every outbound SMS/WhatsApp/email attempt. idempotency_key (unique where not null) is the SAME automation_execution_actions.id that queued it — one action row can never produce two communication_log rows, so an automation retry sweep can never send the same reminder/confirmation twice. status=not_configured/unsupported are terminal (no provider, or a channel with no adapter); queued/retryable are eligible for claim_communication_log_batch(); sent/delivered/failed/permanently_failed reflect a real provider outcome, never fabricated.';


create or replace function public.claim_communication_log_batch(p_worker_id text, p_limit integer default 20)
returns table (
  id uuid,
  channel text,
  recipient text,
  subject text,
  body text,
  attempts integer,
  workspace_id uuid,
  brand_id uuid,
  provider text,
  api_key text,
  sender_id text,
  from_name text,
  from_address text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Same writable-CTE-chain shape as claim_tracking_dispatch_batch()
  -- and for the identical reason: RETURNING cannot reach the extra
  -- joins needed to resolve provider credentials.
  return query
  with claimed as (
    select c.id from public.communication_log c
    where c.status = 'queued'
       or (c.status = 'retryable' and c.next_retry_at <= now())
       or (c.status = 'processing' and c.claimed_at < now() - interval '10 minutes')
    order by c.created_at
    limit p_limit
    for update skip locked
  ),
  updated as (
    update public.communication_log c
      set status = 'processing', attempts = c.attempts + 1, claimed_at = now(), claimed_by = p_worker_id
      from claimed
      where c.id = claimed.id
      returning c.*
  )
  select
    u.id, u.channel, u.recipient, u.subject, u.body, u.attempts, u.workspace_id, u.brand_id,
    case u.channel when 'email' then bcs.email_provider when 'sms' then bcs.sms_provider when 'whatsapp' then bcs.whatsapp_provider end,
    case u.channel when 'email' then bcs.email_api_key when 'sms' then bcs.sms_api_key when 'whatsapp' then bcs.whatsapp_api_key end,
    case u.channel when 'sms' then bcs.sms_sender_id when 'whatsapp' then bcs.whatsapp_phone_number_id else null end,
    br.email_sender_name, br.email_sender_address
  from updated u
  left join public.brand_communication_secrets bcs on bcs.brand_id = u.brand_id
  left join public.brands br on br.id = u.brand_id;
end;
$$;

revoke execute on function public.claim_communication_log_batch(text, integer) from public, anon, authenticated;

comment on function public.claim_communication_log_batch(text, integer) is
  'Called only by the dispatch-communication Edge Function via service_role. Same FOR UPDATE SKIP LOCKED claim pattern as claim_tracking_dispatch_batch() — concurrent workers can never double-send the same queued message.';


create or replace function public.record_communication_dispatch_result(
  p_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error_message text default null,
  p_retryable boolean default true,
  p_failure_category text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.communication_log%rowtype;
begin
  select * into v_row from public.communication_log where id = p_id and status = 'processing';
  if not found then
    return;
  end if;

  if p_success then
    update public.communication_log
      set status = 'sent', provider_message_id = p_provider_message_id, dispatched_at = now(),
          next_retry_at = null, failure_category = null
      where id = p_id;
  elsif p_retryable and v_row.attempts < v_row.max_attempts then
    update public.communication_log
      set status = 'retryable', provider_message_id = p_provider_message_id,
          next_retry_at = now() + (least(power(2, v_row.attempts)::int * 30, 3600) || ' seconds')::interval,
          failure_category = p_failure_category
      where id = p_id;
  else
    update public.communication_log
      set status = 'permanently_failed', provider_message_id = p_provider_message_id, next_retry_at = null,
          failure_category = coalesce(p_failure_category, 'unknown')
      where id = p_id;
  end if;
end;
$$;

revoke execute on function public.record_communication_dispatch_result(uuid, boolean, text, text, boolean, text) from public, anon, authenticated;

comment on function public.record_communication_dispatch_result(uuid, boolean, text, text, boolean, text) is
  'Same discipline as record_tracking_dispatch_result(): only acts on a row currently processing (a duplicate/late callback is a safe no-op), never writes sent unless the real provider call succeeded, exponential backoff up to max_attempts then permanently_failed. error_message/body content is not stored here on purpose — communication_log.body already holds the message; provider error text is not logged verbatim to avoid retaining unnecessary provider-side echoes of customer content, only provider_message_id + a failure_category.';


create or replace function public.list_communication_log(
  p_workspace_id uuid,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.communication_log
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.user_has_permission(p_workspace_id, 'communications.view') or public.user_has_permission(p_workspace_id, 'integrations.view')) then
    raise exception 'insufficient_permission: communications.view or integrations.view required';
  end if;
  return query
    select * from public.communication_log
    where workspace_id = p_workspace_id and (p_status is null or status = p_status)
    order by created_at desc
    limit least(p_limit, 200) offset greatest(p_offset, 0);
end;
$$;


create or replace function public.retry_communication_log_entry(p_id uuid)
returns public.communication_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.communication_log%rowtype;
begin
  select * into v_row from public.communication_log where id = p_id;
  if not found then
    raise exception 'Communication log entry not found';
  end if;
  if not (public.user_has_permission(v_row.workspace_id, 'communications.manage') or public.user_has_permission(v_row.workspace_id, 'integrations.manage')) then
    raise exception 'insufficient_permission: communications.manage or integrations.manage required';
  end if;
  if v_row.status not in ('retryable', 'permanently_failed') then
    raise exception 'Only a retryable or permanently_failed entry can be retried (current status: %)', v_row.status;
  end if;

  update public.communication_log
    set status = 'queued', attempts = 0, next_retry_at = null, failure_category = null
    where id = p_id
    returning * into v_row;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (v_row.workspace_id, v_row.brand_id, auth.uid(), 'communications', 'manual_retry', 'communication_log', p_id,
    jsonb_build_object('channel', v_row.channel));

  return v_row;
end;
$$;


-- ================================================================
-- PART E — execute_automation_action(): the SEND_SMS/SEND_WHATSAPP/
-- SEND_EMAIL branch now genuinely queues a real dispatch when a
-- provider is configured for the rule's brand, instead of always
-- writing not_configured. Every OTHER action type/branch in this
-- function is copied byte-for-byte from 0028 — only the SEND_* case,
-- the top-of-function idempotency check, and the function signature
-- are touched.
-- ================================================================
alter table public.automation_execution_actions drop constraint automation_execution_actions_status_check;
alter table public.automation_execution_actions add constraint automation_execution_actions_status_check
  check (status in ('pending', 'succeeded', 'failed', 'skipped', 'queued'));

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
  v_channel text;
  v_effective_brand_id uuid;
  v_comm_config record;
begin
  insert into public.automation_execution_actions (execution_id, action_seq, action_type, action_config)
  values (p_execution_id, p_action_seq, coalesce(v_action_type, 'UNKNOWN'), v_config)
  on conflict (execution_id, action_seq) do update set action_type = excluded.action_type
  returning * into v_action_row;

  -- Idempotency: an already-succeeded action is never repeated. An
  -- already-queued SEND_* action is likewise never re-queued — its
  -- outcome is now tracked asynchronously in communication_log via
  -- idempotency_key = this action row's own id, not by this action
  -- row's own status transitioning further.
  if v_action_row.status = 'succeeded' or v_action_row.status = 'queued' then
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
        v_channel := case v_action_type when 'SEND_SMS' then 'sms' when 'SEND_WHATSAPP' then 'whatsapp' else 'email' end;
        v_effective_brand_id := coalesce(p_rule.brand_id, p_event.brand_id);
        select * into v_comm_config from public.resolve_brand_communication_config_internal(v_effective_brand_id, v_channel);

        if v_comm_config.configured then
          insert into public.communication_log (
            workspace_id, brand_id, channel, recipient, subject, body, status, provider, related_execution_action_id, idempotency_key
          ) values (
            p_rule.workspace_id, v_effective_brand_id, v_channel,
            v_config ->> 'recipient', v_config ->> 'subject', v_config ->> 'body',
            'queued', v_comm_config.provider, v_action_row.id, v_action_row.id::text
          )
          on conflict (idempotency_key) where idempotency_key is not null do nothing;
          v_status := 'queued';
        else
          insert into public.communication_log (workspace_id, brand_id, channel, recipient, subject, body, status, related_execution_action_id, idempotency_key)
          values (
            p_rule.workspace_id, v_effective_brand_id, v_channel,
            v_config ->> 'recipient', v_config ->> 'subject', v_config ->> 'body',
            'not_configured', v_action_row.id, v_action_row.id::text
          )
          on conflict (idempotency_key) where idempotency_key is not null do nothing;
          v_status := 'skipped';
          v_error := 'not_configured: no ' || v_channel || ' provider is configured for this brand';
        end if;

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

  return v_status;
end;
$$;

comment on function public.execute_automation_action(uuid, integer, jsonb, public.automation_events, public.automation_rules) is
  'Fixed action catalogue, unchanged from 0028 except SEND_SMS/SEND_WHATSAPP/SEND_EMAIL: now queues a real communication_log row (status=queued, dispatched asynchronously by the dispatch-communication Edge Function) when resolve_brand_communication_config_internal() reports the channel configured for this brand, and otherwise records not_configured exactly as before — never a fabricated send either way. idempotency_key = this action row''s own id makes a duplicate queue attempt (e.g. a retry sweep re-examining an already-queued action) a guaranteed no-op via the unique index, on top of the action-row-level short-circuit above.';


-- ================================================================
-- PART F — process_automation_event() / retry_pending_automation_executions():
-- 'queued' must be treated the same as 'skipped' when deciding whether
-- an execution has any failed action — a queued SEND_* action is
-- pending ASYNC dispatch, not a synchronous failure. Every other line
-- is copied byte-for-byte from 0028.
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

  begin
    perform public.evaluate_approval_rules_for_event(v_event);
  exception when others then
    null;
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
    begin
      if not public.evaluate_automation_conditions(v_rule.conditions, v_rule.conditions_logic, v_event.payload) then
        continue;
      end if;

      insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status, correlation_id, started_at)
      values (v_event.id, v_rule.id, v_event.workspace_id, v_event.brand_id, 'running', v_event.correlation_id, now())
      on conflict (event_id, rule_id) do update set status = 'running', started_at = now(), attempts = automation_executions.attempts + 1
      returning * into v_execution;

      if v_execution.status = 'succeeded' then
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
        if v_action_status not in ('succeeded', 'skipped', 'queued') then
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
      insert into public.automation_executions (event_id, rule_id, workspace_id, brand_id, status, error_message, completed_at, correlation_id)
      values (v_event.id, v_rule.id, v_event.workspace_id, v_event.brand_id, 'failed', left(SQLERRM, 2000), now(), v_event.correlation_id)
      on conflict (event_id, rule_id) do update set status = 'failed', error_message = left(SQLERRM, 2000), completed_at = now();
    end;
  end loop;

  update public.automation_events set processing_status = 'processed', processed_at = now() where id = p_event_id;
end;
$$;

comment on function public.process_automation_event(uuid) is
  'Unchanged from 0028 except: a queued SEND_* action (real async communication dispatch) no longer counts as a failure when deciding whether to retry the execution — matching execute_automation_action()''s new queued outcome.';


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
      if v_action_status not in ('succeeded', 'skipped', 'queued') then
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
  'Unchanged from 0028 except: a queued SEND_* action no longer counts as a failure. Still SECURITY DEFINER, no client-facing permission check (only acts on rows already scoped by their own state), FOR UPDATE SKIP LOCKED for concurrent-sweep safety — intended for a trusted scheduler, not a UI action.';


-- ================================================================
-- PART G — Best-effort Realtime for the operational surfaces that
-- materially benefit from it, added to the SAME supabase_realtime
-- publication as notifications (0023), with the identical guard so
-- this migration is a harmless no-op on a plain local Postgres
-- instance. Security is enforced at the RLS layer these tables
-- already have (Supabase''s postgres_changes realtime respects each
-- subscriber''s own SELECT RLS policies) — no new security surface is
-- introduced by adding a table here.
-- ================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.orders';
    execute 'alter publication supabase_realtime add table public.order_tasks';
    execute 'alter publication supabase_realtime add table public.delivery_attempts';
    execute 'alter publication supabase_realtime add table public.waybills';
    execute 'alter publication supabase_realtime add table public.order_settlements';
    execute 'alter publication supabase_realtime add table public.automation_executions';
    execute 'alter publication supabase_realtime add table public.communication_log';
    execute 'alter publication supabase_realtime add table public.tracking_dispatch_log';
  end if;
end $$;
