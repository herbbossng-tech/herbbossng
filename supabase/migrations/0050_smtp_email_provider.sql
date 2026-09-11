-- ============================================================
-- GCOS — SMTP as an alternative email provider (0050)
--
-- Email has only ever supported Resend (a third-party transactional
-- email API), configured with a single API key. This migration adds
-- a second, generic option — raw SMTP (host/port/username/password) —
-- so a workspace can use its own mail server/relay instead. This is
-- purely additive: email_provider gains a new legal value ('smtp')
-- alongside the existing 'resend', new smtp_* columns are nullable,
-- and every existing Resend-configured brand is completely unaffected
-- (email_provider stays 'resend', smtp_* columns stay null).
--
-- set_brand_communication_config()'s new parameters are appended
-- AFTER every existing one, preserving the exact original positional
-- signature — 118_gcos_phase13_communications_test.sql calls this
-- function positionally (e.g. `set_brand_communication_config(v_brand,
-- 'resend_test_key_abc')`), so inserting a new parameter anywhere
-- earlier in the list would silently shift those existing positional
-- calls onto the wrong parameter.
-- ============================================================

alter table public.brand_communication_secrets
  drop constraint brand_communication_secrets_email_provider_check;
alter table public.brand_communication_secrets
  add constraint brand_communication_secrets_email_provider_check
  check (email_provider in ('resend', 'smtp'));

alter table public.brand_communication_secrets add column if not exists smtp_host text;
alter table public.brand_communication_secrets add column if not exists smtp_port integer;
alter table public.brand_communication_secrets add column if not exists smtp_username text;
alter table public.brand_communication_secrets add column if not exists smtp_password text;
-- true = implicit TLS (typically port 465); false = STARTTLS/plaintext-upgrade (typically port 587) — the more common default for transactional SMTP relays.
alter table public.brand_communication_secrets add column if not exists smtp_secure boolean not null default false;

comment on column public.brand_communication_secrets.email_provider is
  'resend (default, third-party API, needs email_api_key) or smtp (a workspace''s own mail server/relay, needs smtp_host/smtp_username/smtp_password — smtp_port defaults to 587 and smtp_secure to false/STARTTLS if left unset).';
comment on column public.brand_communication_secrets.smtp_password is
  'Same secret-storage discipline as every other credential on this table — never selectable by any client role, only resolved server-side by resolve_brand_communication_config_internal()/claim_communication_log_batch().';


-- ---------------------------------------------------------------
-- resolve_brand_communication_config_internal(): 'email' is now
-- configured under EITHER credential shape — Resend needs an api key,
-- SMTP needs host+username+password. Signature/return shape unchanged
-- from 0032, so a plain create-or-replace is safe here (unlike the
-- two functions below).
-- ---------------------------------------------------------------
create or replace function public.resolve_brand_communication_config_internal(p_brand_id uuid, p_channel text)
returns table (configured boolean, provider text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case p_channel
      when 'email' then (
        (email_provider = 'resend' and email_api_key is not null)
        or (email_provider = 'smtp' and smtp_host is not null and smtp_username is not null and smtp_password is not null)
      )
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

comment on function public.resolve_brand_communication_config_internal(uuid, text) is
  'Permission-free internal resolver — never callable by anon/authenticated. Used by execute_automation_action() (runs as the SECURITY DEFINER owner, so it can call this directly) to decide queued vs not_configured without needing a staff permission, and by claim_communication_log_batch() for the same reason a genuinely anonymous/service actor cannot hold a staff permission. 0050: email is configured via either email_provider=resend+email_api_key or email_provider=smtp+smtp_host/smtp_username/smtp_password.';


-- ---------------------------------------------------------------
-- set_brand_communication_config(): new params appended at the end
-- (see header) — everything else byte-for-byte identical to 0032's
-- NULL-means-unchanged / empty-string-means-clear convention.
-- ---------------------------------------------------------------
drop function if exists public.set_brand_communication_config(uuid, text, text, text, text, text, text, text);

create function public.set_brand_communication_config(
  p_brand_id uuid,
  p_email_api_key text default null,
  p_sms_provider text default null,
  p_sms_api_key text default null,
  p_sms_sender_id text default null,
  p_whatsapp_provider text default null,
  p_whatsapp_api_key text default null,
  p_whatsapp_phone_number_id text default null,
  p_email_provider text default null,
  p_smtp_host text default null,
  p_smtp_port integer default null,
  p_smtp_username text default null,
  p_smtp_password text default null,
  p_smtp_secure boolean default null
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

  if p_email_provider is not null and p_email_provider not in ('resend', 'smtp') then
    raise exception 'email_provider must be resend or smtp';
  end if;

  -- NULL param = leave unchanged; empty string = explicitly clear
  -- (text fields only — smtp_port/smtp_secure have no "clear" concept
  -- of their own here, NULL simply means "leave as-is").
  insert into public.brand_communication_secrets (
    workspace_id, brand_id, email_provider, email_api_key,
    smtp_host, smtp_port, smtp_username, smtp_password, smtp_secure,
    sms_provider, sms_api_key, sms_sender_id,
    whatsapp_provider, whatsapp_api_key, whatsapp_phone_number_id, updated_by
  ) values (
    v_brand.workspace_id, p_brand_id, coalesce(p_email_provider, 'resend'), nullif(p_email_api_key, ''),
    nullif(p_smtp_host, ''), p_smtp_port, nullif(p_smtp_username, ''), nullif(p_smtp_password, ''), coalesce(p_smtp_secure, false),
    nullif(p_sms_provider, ''), nullif(p_sms_api_key, ''), nullif(p_sms_sender_id, ''),
    nullif(p_whatsapp_provider, ''), nullif(p_whatsapp_api_key, ''), nullif(p_whatsapp_phone_number_id, ''), auth.uid()
  )
  on conflict (brand_id) do update set
    email_provider = case when p_email_provider is null then brand_communication_secrets.email_provider else p_email_provider end,
    email_api_key = case when p_email_api_key is null then brand_communication_secrets.email_api_key else nullif(p_email_api_key, '') end,
    smtp_host = case when p_smtp_host is null then brand_communication_secrets.smtp_host else nullif(p_smtp_host, '') end,
    smtp_port = case when p_smtp_port is null then brand_communication_secrets.smtp_port else p_smtp_port end,
    smtp_username = case when p_smtp_username is null then brand_communication_secrets.smtp_username else nullif(p_smtp_username, '') end,
    smtp_password = case when p_smtp_password is null then brand_communication_secrets.smtp_password else nullif(p_smtp_password, '') end,
    smtp_secure = case when p_smtp_secure is null then brand_communication_secrets.smtp_secure else p_smtp_secure end,
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
      'email_provider', p_email_provider, 'email_key_set', p_email_api_key is not null and p_email_api_key <> '',
      'smtp_host_set', p_smtp_host is not null and p_smtp_host <> '',
      'smtp_username_set', p_smtp_username is not null and p_smtp_username <> '',
      'smtp_password_set', p_smtp_password is not null and p_smtp_password <> '',
      'sms_provider', p_sms_provider, 'sms_key_set', p_sms_api_key is not null and p_sms_api_key <> '',
      'whatsapp_provider', p_whatsapp_provider, 'whatsapp_key_set', p_whatsapp_api_key is not null and p_whatsapp_api_key <> ''
    )
  );
end;
$$;

comment on function public.set_brand_communication_config(uuid, text, text, text, text, text, text, text, text, text, integer, text, text, boolean) is
  'The only write path for brand-level communication provider credentials. Audit logs record WHETHER a key/field changed, never the value. Sender identity (name/address) is NOT managed here — it already exists on brands.email_sender_name/email_sender_address (0002) and is reused as-is by both the Resend and SMTP adapters. 0050: p_email_provider selects resend (default) or smtp; the p_smtp_* params configure the SMTP credential shape, only meaningful when email_provider=smtp.';


-- ---------------------------------------------------------------
-- claim_communication_log_batch(): RETURNS TABLE shape changes
-- (5 new smtp_* columns), so it must be dropped and recreated
-- (Postgres cannot CREATE OR REPLACE across a shape change — see
-- 0043's get_order_stats() for the same situation). Body otherwise
-- byte-for-byte identical to 0032/0035's live definition.
-- ---------------------------------------------------------------
drop function if exists public.claim_communication_log_batch(text, integer);

create function public.claim_communication_log_batch(p_worker_id text, p_limit integer default 20)
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
  from_address text,
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  smtp_password text,
  smtp_secure boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Same writable-CTE-chain shape as claim_tracking_dispatch_batch()
  -- and for the identical reason: RETURNING cannot reach the extra
  -- joins needed to resolve provider credentials. Also reclaims a row
  -- stuck in 'processing' for over 10 minutes (a worker that died
  -- mid-dispatch), same as the original 0032 definition.
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
    -- api_key is only ever the ACTIVE credential for the resolved
    -- provider — an email brand switched to smtp must never still
    -- surface its old (now-inactive) Resend key here just because the
    -- column happens to still hold a value from before the switch.
    case
      when u.channel = 'email' then case when bcs.email_provider = 'resend' then bcs.email_api_key end
      when u.channel = 'sms' then bcs.sms_api_key
      when u.channel = 'whatsapp' then bcs.whatsapp_api_key
    end,
    case u.channel when 'sms' then bcs.sms_sender_id when 'whatsapp' then bcs.whatsapp_phone_number_id else null end,
    br.email_sender_name, br.email_sender_address,
    case when u.channel = 'email' and bcs.email_provider = 'smtp' then bcs.smtp_host end,
    case when u.channel = 'email' and bcs.email_provider = 'smtp' then bcs.smtp_port end,
    case when u.channel = 'email' and bcs.email_provider = 'smtp' then bcs.smtp_username end,
    case when u.channel = 'email' and bcs.email_provider = 'smtp' then bcs.smtp_password end,
    case when u.channel = 'email' and bcs.email_provider = 'smtp' then bcs.smtp_secure end
  from updated u
  left join public.brand_communication_secrets bcs on bcs.brand_id = u.brand_id
  left join public.brands br on br.id = u.brand_id;
end;
$$;

revoke execute on function public.claim_communication_log_batch(text, integer) from public, anon, authenticated;

comment on function public.claim_communication_log_batch(text, integer) is
  'Called only by the dispatch-communication Edge Function via service_role. Same FOR UPDATE SKIP LOCKED claim pattern as claim_tracking_dispatch_batch() — concurrent workers can never double-send the same queued message. 0050: adds smtp_host/smtp_port/smtp_username/smtp_password/smtp_secure, populated only for channel=email when email_provider=smtp; conversely api_key for channel=email is populated only when email_provider=resend — a brand switched from one to the other never surfaces the other provider''s now-inactive credential just because the column still holds an old value.';
