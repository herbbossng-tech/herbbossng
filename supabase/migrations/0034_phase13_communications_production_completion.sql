-- ============================================================
-- GCOS Phase 13 — Communications, Customer Messaging & Production
-- Operations Completion
--
-- Repository audit before writing this migration confirmed Phase 11
-- (0032) already built the real production communication engine:
--   * communication_log (0028, extended 0032) — claim/retry/backoff/
--     idempotency/dead-letter, exactly as Phase 11's report describes.
--   * brand_communication_secrets (0032) — server-only provider
--     credentials, RLS with zero client policies, reached only through
--     set_brand_communication_config()/get_communication_config_status()/
--     the internal resolver/the service-role claim RPC.
--   * execute_automation_action()'s SEND_EMAIL/SEND_SMS/SEND_WHATSAPP
--     branch already queues a real communication_log row and already
--     treats 'queued' as distinct from a synchronous failure in
--     process_automation_event()/retry_pending_automation_executions().
--   * dispatch-communication Edge Function already has a real Resend
--     adapter (classifyHttpResult, no fabricated 'sent').
--   * Integration Health already shows EMAIL/SMS/WhatsApp queue health
--     per channel (IntegrationHealthPage.tsx, Phase 11).
--   * email_templates (0006) already exists (workspace/brand-scoped,
--     key/subject/html_body/is_active) but has never been read by any
--     RPC and is gated only by the generic settings.manage permission.
--   * orders already carry the full COD lifecycle events this phase's
--     "order triggers" need: orders.created / orders.status_changed /
--     orders.delivered / orders.cancelled / orders.returned /
--     orders.payment_collected (0028) — no new event mechanism needed.
--   * normalize_phone(phone, dial_code) (0020) is the one phone
--     normalization algorithm in the codebase.
--
-- What was genuinely missing and is built here:
--   1. email_templates was unused — this migration gives it real RLS
--      (communications.templates.*, not generic settings.manage),
--      seeds system defaults, and wires it into execute_automation_action()
--      via a new optional template_key so a SEND_* action can reference
--      a managed template instead of embedding a literal string.
--   2. communication_log could not answer "which order/customer caused
--      this" (section 18) — extended with entity_type/entity_id/
--      customer_id/communication_type/template_key/is_transactional/
--      triggered_by/created_by. Additive columns only.
--   3. No SMS/WhatsApp adapter existed at all (every such action fell
--      through the Edge Function's default branch and was recorded as
--      permanently_failed with "no adapter"). Real Twilio (SMS) and
--      WhatsApp Cloud API adapters are added to dispatch-communication
--      in this same phase (see that Edge Function's own files) — this
--      migration does not touch provider HTTP logic itself, only the
--      queue/config side.
--   4. No phone validation existed before queuing an SMS/WhatsApp
--      send — a malformed recipient would be queued and only fail at
--      the provider. Now validated with the existing normalize_phone()
--      before insert; invalid numbers are recorded permanently_failed,
--      never queued.
--   5. No customer communication preference existed — marketing sends
--      could not be told apart from transactional ones. Added
--      customers.email_opt_in/sms_opt_in/whatsapp_opt_in (marketing
--      gate only — see the column comments for why transactional
--      messages are not gated by these).
--   6. No manual "Contact Customer" path existed — send_manual_communication()
--      resolves workspace/brand/customer server-side from the order id
--      only (never trusts a client-supplied workspace/brand/customer
--      id), permission-gated, throttled, audited.
--   7. No safe test-send existed — test_communication_provider() sends
--      only to an explicit recipient the calling admin types in, never
--      a customer looked up from any table.
--   8. communication_log's own RLS SELECT policy (0028) still checked
--      automation.view, not the communications.* permissions
--      introduced in 0032 for this exact table — a caller holding only
--      automation.view could bypass list_communication_log()'s
--      permission check via a direct PostgREST select. Fixed here.
-- ============================================================


-- ============================================================
-- PART A — Permissions
-- ============================================================

insert into public.permissions (module, action, slug, category, description) values
  ('communications', 'send', 'communications.send', 'Communications', 'Manually send an operational message to a customer'),
  ('communications', 'templates.view', 'communications.templates.view', 'Communications', 'View communication templates'),
  ('communications', 'templates.manage', 'communications.templates.manage', 'Communications', 'Create/edit/disable communication templates')
on conflict (slug) do nothing;

-- Owner/Admin: everything, matching the existing communications.*/integrations.* posture from 0032.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug in ('owner', 'admin')
  and p.slug in ('communications.send', 'communications.templates.view', 'communications.templates.manage')
on conflict do nothing;

-- Manager/Marketing: can view+manage templates (authoring message
-- content is an operational/marketing content task) and send manual
-- messages, but never provider credentials (communications.manage,
-- already Owner/Admin-only since 0032, is untouched here).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug in ('manager', 'marketing')
  and p.slug in ('communications.send', 'communications.templates.view', 'communications.templates.manage')
on conflict do nothing;

-- Customer Support: owns orders from confirmation through completion
-- (0008's own description of this role) — genuinely needs to contact
-- a customer about their order. Gets communications.send and template
-- VIEW (to see what a message will say before sending it) but never
-- templates.manage or communications.manage — no credential or
-- message-content authoring access, matching the master prompt's
-- explicit "do not give Customer Support access to provider
-- credentials" instruction.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'customer-support'
  and p.slug in ('communications.send', 'communications.templates.view')
on conflict do nothing;

-- Viewer: read-only template visibility, matching its existing
-- communications.view grant.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer' and p.slug = 'communications.templates.view'
on conflict do nothing;

-- Warehouse Staff, Finance, Affiliate Manager: nothing new, matching
-- their existing zero communications.* grant from 0032.


-- ============================================================
-- PART B — email_templates: real RLS + variables + seed system defaults
-- ============================================================

alter table public.email_templates add column if not exists channel text not null default 'email' check (channel in ('email', 'sms'));
alter table public.email_templates add column if not exists variables jsonb not null default '[]'::jsonb;
alter table public.email_templates alter column subject drop not null;

comment on column public.email_templates.subject is
  'Required for channel=email (enforced in upsert_communication_template(), not a table constraint, since the column is shared with channel=sms rows which have no subject line).';

comment on column public.email_templates.channel is
  'email or sms — a WhatsApp message is NOT modeled here because WhatsApp requires pre-approved, provider-hosted templates (see the master prompt''s own instruction); a GCOS-authored free-form body cannot represent that, so WhatsApp automation actions reference a provider template name directly in their action config instead.';

comment on column public.email_templates.variables is
  'Documentation only — the list of {{variable}} names this template expects (e.g. ["customer_name","order_number"]). render_communication_template() substitutes whatever keys the caller actually supplies; this array does not enforce which keys may be used, it only helps an editor UI show what is available.';

drop policy if exists "select_email_templates" on public.email_templates;
drop policy if exists "manage_email_templates" on public.email_templates;

create policy "select_communication_templates" on public.email_templates
  for select to authenticated
  using (
    (workspace_id is null and brand_id is null)
    or (workspace_id in (select public.user_workspace_ids()) and public.user_has_permission(workspace_id, 'communications.templates.view'))
  );

create policy "manage_communication_templates" on public.email_templates
  for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()) and public.user_has_permission(workspace_id, 'communications.templates.manage'))
  with check (workspace_id in (select public.user_workspace_ids()) and public.user_has_permission(workspace_id, 'communications.templates.manage'));

comment on table public.email_templates is
  'Reusable communication templates (email + sms bodies). A row with workspace_id/brand_id both null is a SYSTEM default, visible to every workspace but editable by none via RLS (no workspace_id to match user_workspace_ids() against) — only a service-role migration seeds/changes these. Resolution precedence (see render_communication_template()): brand row > workspace row > system row.';

-- System defaults (workspace_id/brand_id null) for the core taxonomy
-- from the master prompt''s section 11/section 7. Deliberately a
-- representative subset, not all ~20 listed types — every one of
-- these can be selected as template_key on a SEND_EMAIL/SEND_SMS
-- automation action; more can be added later by any workspace without
-- a migration (upsert_communication_template() at the workspace/brand
-- level, or another system-row migration).
insert into public.email_templates (workspace_id, brand_id, key, name, channel, subject, html_body, variables) values
  (null, null, 'order_confirmation', 'Order Confirmation', 'email', 'Your order {{order_number}} is confirmed',
    '<p>Hi {{customer_name}},</p><p>Thanks for your order <strong>{{order_number}}</strong> ({{order_total}} {{currency}}). We will be in touch to arrange delivery.</p><p>{{brand_name}}</p>',
    '["customer_name","order_number","order_total","currency","brand_name"]'::jsonb),
  (null, null, 'order_out_for_delivery', 'Out for Delivery', 'email', 'Your order {{order_number}} is out for delivery',
    '<p>Hi {{customer_name}},</p><p>Your order <strong>{{order_number}}</strong> is out for delivery today.</p><p>{{brand_name}}</p>',
    '["customer_name","order_number","brand_name"]'::jsonb),
  (null, null, 'order_delivered', 'Order Delivered', 'email', 'Your order {{order_number}} has been delivered',
    '<p>Hi {{customer_name}},</p><p>Your order <strong>{{order_number}}</strong> has been delivered. Thank you for shopping with {{brand_name}}.</p>',
    '["customer_name","order_number","brand_name"]'::jsonb),
  (null, null, 'cash_collection_confirmed', 'Payment Confirmation', 'email', 'Payment received for order {{order_number}}',
    '<p>Hi {{customer_name}},</p><p>We have received payment of {{order_total}} {{currency}} for order <strong>{{order_number}}</strong>.</p><p>{{brand_name}}</p>',
    '["customer_name","order_number","order_total","currency","brand_name"]'::jsonb),
  (null, null, 'order_cancelled', 'Order Cancelled', 'email', 'Your order {{order_number}} was cancelled',
    '<p>Hi {{customer_name}},</p><p>Your order <strong>{{order_number}}</strong> has been cancelled. Contact us at {{support_phone}} if this is unexpected.</p><p>{{brand_name}}</p>',
    '["customer_name","order_number","support_phone","brand_name"]'::jsonb),
  (null, null, 'order_returned', 'Order Returned', 'email', 'Your order {{order_number}} was returned',
    '<p>Hi {{customer_name}},</p><p>Your order <strong>{{order_number}}</strong> was returned. Contact us at {{support_phone}} if you have questions.</p><p>{{brand_name}}</p>',
    '["customer_name","order_number","support_phone","brand_name"]'::jsonb),
  (null, null, 'affiliate_withdrawal_approved', 'Withdrawal Approved', 'email', 'Your withdrawal of {{withdrawal_amount}} was approved',
    '<p>Hi {{affiliate_name}},</p><p>Your withdrawal request for {{withdrawal_amount}} {{currency}} has been approved.</p>',
    '["affiliate_name","withdrawal_amount","currency"]'::jsonb),
  (null, null, 'low_stock_alert', 'Low Stock Alert', 'email', 'Low stock: {{product_name}}',
    '<p>{{product_name}} is running low on stock.</p>',
    '["product_name"]'::jsonb),
  (null, null, 'order_confirmation', 'Order Confirmation (SMS)', 'sms', null,
    'Hi {{customer_name}}, your order {{order_number}} is confirmed. Total {{order_total}} {{currency}}. - {{brand_name}}',
    '["customer_name","order_number","order_total","currency","brand_name"]'::jsonb),
  (null, null, 'order_out_for_delivery', 'Out for Delivery (SMS)', 'sms', null,
    'Hi {{customer_name}}, your order {{order_number}} is out for delivery today. - {{brand_name}}',
    '["customer_name","order_number","brand_name"]'::jsonb)
on conflict (workspace_id, brand_id, key) do nothing;

comment on constraint email_templates_workspace_id_brand_id_key_key on public.email_templates is
  'workspace_id/brand_id/key uniqueness (0006) means a system template (both null) and a workspace override sharing the same key coexist as separate rows — this is exactly what makes brand > workspace > system precedence resolvable.';


-- ============================================================
-- PART C — customer communication preferences (marketing gate only)
-- ============================================================

alter table public.customers add column if not exists email_opt_in boolean not null default true;
alter table public.customers add column if not exists sms_opt_in boolean not null default true;
alter table public.customers add column if not exists whatsapp_opt_in boolean not null default true;

comment on column public.customers.email_opt_in is
  'Gates MARKETING communication only (is_transactional=false on the queued communication_log row). Transactional messages — order confirmation, delivery status, payment confirmation — are operationally required to fulfil an order the customer themselves placed and are never blocked by this flag; blocking them would leave a customer unable to learn their own delivery status. See execute_automation_action()''s SEND_* branch for the exact enforcement point.';
comment on column public.customers.sms_opt_in is 'See email_opt_in — same marketing-only gate, applied to the sms channel.';
comment on column public.customers.whatsapp_opt_in is 'See email_opt_in — same marketing-only gate, applied to the whatsapp channel.';


-- ============================================================
-- PART D — communication_log: observability + preference/idempotency
-- columns (additive only, per section 18)
-- ============================================================

alter table public.communication_log add column if not exists entity_type text;
alter table public.communication_log add column if not exists entity_id uuid;
alter table public.communication_log add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.communication_log add column if not exists communication_type text;
alter table public.communication_log add column if not exists template_key text;
alter table public.communication_log add column if not exists is_transactional boolean not null default true;
alter table public.communication_log add column if not exists triggered_by text not null default 'automation' check (triggered_by in ('automation', 'manual', 'system'));
alter table public.communication_log add column if not exists created_by uuid references auth.users (id);

alter table public.communication_log drop constraint communication_log_status_check;
alter table public.communication_log add constraint communication_log_status_check
  check (status in ('not_configured', 'unsupported', 'queued', 'processing', 'sent', 'delivered', 'failed', 'retryable', 'permanently_failed', 'skipped_preference'));

create index communication_log_entity_idx on public.communication_log (entity_type, entity_id) where entity_id is not null;
create index communication_log_customer_idx on public.communication_log (customer_id) where customer_id is not null;

comment on table public.communication_log is
  'Every outbound SMS/WhatsApp/email attempt — see the 0028/0032 comments for the base queue lifecycle. Phase 13 adds who/why observability (entity_type/entity_id/customer_id/communication_type/template_key) and marketing-consent enforcement (is_transactional + skipped_preference, a terminal status meaning the recipient opted out of that channel for marketing — never a fabricated send, never a hard error). triggered_by distinguishes automation-queued rows from manual staff sends (send_manual_communication()) and system rows (test_communication_provider()).';

-- Fix a genuine permission-boundary drift: this table''s own SELECT
-- RLS policy (0028) still checked automation.view, while every RPC
-- that reads it (list_communication_log(), 0032) checks
-- communications.view/integrations.view. A caller holding only
-- automation.view (e.g. Manager, Marketing — both already hold it)
-- could bypass the RPC''s permission check entirely via a direct
-- PostgREST select and read customer phone numbers/message bodies
-- the communications module boundary was designed to gate. Since
-- Manager/Marketing/Viewer already hold communications.view too
-- (0032), this is a real tightening with no loss of legitimate access.
drop policy if exists "select_communication_log" on public.communication_log;
create policy "select_communication_log" on public.communication_log
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'communications.view') or public.user_has_permission(workspace_id, 'integrations.view'))
  );


-- ============================================================
-- PART E — template resolution + rendering
-- ============================================================

create or replace function public.render_template_string(p_template text, p_variables jsonb, p_escape_html boolean default false)
returns text
language plpgsql
immutable
as $$
declare
  v_result text := coalesce(p_template, '');
  v_key text;
  v_value text;
begin
  -- Pure string substitution — {{key}} -> value. No code execution of
  -- any kind: p_variables values are always treated as literal text,
  -- never evaluated, so a variable value can never inject SQL or a
  -- template directive. HTML-escaped only for the email channel
  -- (p_escape_html=true), since an sms body is plain text and
  -- shouldn't gain literal &amp;/&lt; noise.
  for v_key in select jsonb_object_keys(coalesce(p_variables, '{}'::jsonb))
  loop
    v_value := coalesce(p_variables ->> v_key, '');
    if p_escape_html then
      v_value := replace(replace(replace(v_value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    end if;
    v_result := replace(v_result, '{{' || v_key || '}}', v_value);
  end loop;
  return v_result;
end;
$$;

comment on function public.render_template_string(text, jsonb, boolean) is
  'Safe {{variable}} substitution — never executes code, never evaluates the template as SQL/HTML/JS. Any {{token}} not present in p_variables is left in the output literally (visible, not silently blanked) so a misconfigured template is obvious rather than silently wrong.';


create or replace function public.render_communication_template(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_key text,
  p_channel text,
  p_variables jsonb default '{}'::jsonb
)
returns table (subject text, body text, template_found boolean)
language sql
stable
as $$
  with candidates as (
    select *, case when brand_id is not null then 1 when workspace_id is not null then 2 else 3 end as precedence
    from public.email_templates
    where key = p_key and channel = p_channel and is_active
      and (
        (brand_id = p_brand_id)
        or (workspace_id = p_workspace_id and brand_id is null)
        or (workspace_id is null and brand_id is null)
      )
    order by precedence
    limit 1
  )
  select
    public.render_template_string(subject, p_variables, true),
    public.render_template_string(html_body, p_variables, channel = 'email'),
    true
  from candidates
  union all
  select null, null, false
  where not exists (select 1 from candidates)
  limit 1;
$$;

comment on function public.render_communication_template(uuid, uuid, text, text, jsonb) is
  'Brand template > workspace template > system template precedence. Returns template_found=false (never an exception) when no template matches at any level, so a caller can fall back to a literal subject/body from the automation action config instead of failing the whole action.';


create or replace function public.preview_communication_template(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_key text,
  p_channel text,
  p_variables jsonb default '{}'::jsonb
)
returns table (subject text, body text, template_found boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.user_has_permission(p_workspace_id, 'communications.templates.view') then
    raise exception 'insufficient_permission: communications.templates.view required';
  end if;
  return query select * from public.render_communication_template(p_workspace_id, p_brand_id, p_key, p_channel, p_variables);
end;
$$;

comment on function public.preview_communication_template(uuid, uuid, text, text, jsonb) is
  'Permission-gated wrapper around render_communication_template() for the Template Editor''s live preview — sample variable values only, never real customer data unless the caller supplies them.';


create or replace function public.list_communication_templates(p_workspace_id uuid, p_brand_id uuid default null)
returns setof public.email_templates
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.user_has_permission(p_workspace_id, 'communications.templates.view') then
    raise exception 'insufficient_permission: communications.templates.view required';
  end if;
  return query
    select * from public.email_templates
    where (workspace_id is null and brand_id is null)
       or (workspace_id = p_workspace_id and (p_brand_id is null or brand_id is null or brand_id = p_brand_id))
    order by key, channel, (brand_id is null), (workspace_id is null);
end;
$$;


create or replace function public.upsert_communication_template(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_key text,
  p_name text,
  p_channel text,
  p_subject text,
  p_html_body text,
  p_variables jsonb default '[]'::jsonb
)
returns public.email_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.email_templates%rowtype;
  v_is_new boolean;
begin
  if not public.user_has_permission(p_workspace_id, 'communications.templates.manage') then
    raise exception 'insufficient_permission: communications.templates.manage required';
  end if;
  if p_channel not in ('email', 'sms') then
    raise exception 'channel must be email or sms';
  end if;
  if p_channel = 'email' and coalesce(trim(p_subject), '') = '' then
    raise exception 'subject is required for an email template';
  end if;
  if coalesce(trim(p_html_body), '') = '' then
    raise exception 'body is required';
  end if;

  select exists(select 1 from public.email_templates where workspace_id = p_workspace_id and brand_id is not distinct from p_brand_id and key = p_key and channel = p_channel)
    into v_is_new;
  v_is_new := not v_is_new;

  insert into public.email_templates (workspace_id, brand_id, key, name, channel, subject, html_body, variables, created_by, updated_by)
  values (p_workspace_id, p_brand_id, p_key, p_name, p_channel, p_subject, p_html_body, coalesce(p_variables, '[]'::jsonb), auth.uid(), auth.uid())
  on conflict (workspace_id, brand_id, key) do update set
    name = excluded.name, channel = excluded.channel, subject = excluded.subject, html_body = excluded.html_body,
    variables = excluded.variables, updated_by = auth.uid(), updated_at = now()
  returning * into v_row;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (p_workspace_id, p_brand_id, auth.uid(), 'communications', case when v_is_new then 'template_created' else 'template_updated' end,
    'email_templates', v_row.id, jsonb_build_object('key', p_key, 'channel', p_channel, 'name', p_name));

  return v_row;
end;
$$;

comment on function public.upsert_communication_template(uuid, uuid, text, text, text, text, text, jsonb) is
  'Workspace/brand-scoped template create-or-update (never touches a system template — p_workspace_id is always required and is_not_distinct_from-matched against p_brand_id, so this can never target the (null,null) system rows). Audits create vs update distinctly; never logs the rendered body content into audit_logs, only the key/channel/name.';


create or replace function public.set_communication_template_active(p_id uuid, p_active boolean)
returns public.email_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.email_templates%rowtype;
begin
  select * into v_row from public.email_templates where id = p_id;
  if not found then
    raise exception 'Template not found';
  end if;
  if v_row.workspace_id is null then
    raise exception 'System templates cannot be disabled — override them at the workspace/brand level instead';
  end if;
  if not public.user_has_permission(v_row.workspace_id, 'communications.templates.manage') then
    raise exception 'insufficient_permission: communications.templates.manage required';
  end if;

  update public.email_templates set is_active = p_active, updated_by = auth.uid(), updated_at = now() where id = p_id returning * into v_row;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (v_row.workspace_id, v_row.brand_id, auth.uid(), 'communications', case when p_active then 'template_enabled' else 'template_disabled' end,
    'email_templates', p_id, jsonb_build_object('key', v_row.key, 'channel', v_row.channel));

  return v_row;
end;
$$;


-- ============================================================
-- PART F — execute_automation_action(): extend the SEND_* branch only.
-- Every other action type/branch is byte-for-byte identical to 0032.
-- ============================================================
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
  -- Phase 13 additions for the SEND_* branch:
  v_customer_id uuid;
  v_recipient text;
  v_subject text;
  v_body text;
  v_template_key text;
  v_is_transactional boolean;
  v_country_code text;
  v_dial_code text;
  v_rendered record;
  v_variables jsonb;
  v_comm_status text;
  v_comm_failure_category text;
begin
  insert into public.automation_execution_actions (execution_id, action_seq, action_type, action_config)
  values (p_execution_id, p_action_seq, coalesce(v_action_type, 'UNKNOWN'), v_config)
  on conflict (execution_id, action_seq) do update set action_type = excluded.action_type
  returning * into v_action_row;

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

      -- ----------------------------------------------------------
      -- SEND_SMS / SEND_WHATSAPP / SEND_EMAIL — extended in Phase 13:
      --   1. recipient may be a literal string (unchanged, backward
      --      compatible with every existing rule) or the token
      --      {{customer_email}}/{{customer_phone}}, resolved from the
      --      triggering order at execution time — a rule authored once
      --      can now correctly message a DIFFERENT customer per order,
      --      which a literal recipient could never do.
      --   2. an optional template_key resolves + renders a managed
      --      template (brand > workspace > system) instead of requiring
      --      literal subject/body; explicit subject/body in config still
      --      wins if both are supplied (documented override, not a bug).
      --   3. sms/whatsapp recipients are normalized+validated with the
      --      existing normalize_phone() before queuing; an invalid
      --      number is recorded permanently_failed, never queued.
      --   4. a non-transactional (marketing) send is checked against
      --      the customer's opt-in flag for that channel; an opted-out
      --      customer's row is recorded skipped_preference, never
      --      queued and never a fabricated send.
      -- ----------------------------------------------------------
      when 'SEND_SMS', 'SEND_WHATSAPP', 'SEND_EMAIL' then
        v_channel := case v_action_type when 'SEND_SMS' then 'sms' when 'SEND_WHATSAPP' then 'whatsapp' else 'email' end;
        v_effective_brand_id := coalesce(p_rule.brand_id, p_event.brand_id);
        select * into v_comm_config from public.resolve_brand_communication_config_internal(v_effective_brand_id, v_channel);

        v_order := null;
        v_customer_id := null;
        if p_event.entity_type = 'order' and p_event.entity_id is not null then
          select * into v_order from public.orders where id = p_event.entity_id and deleted_at is null;
          if found then
            v_customer_id := v_order.customer_id;
          end if;
        end if;

        v_recipient := v_config ->> 'recipient';
        if v_order.id is not null and (v_recipient is null or v_recipient = '' or v_recipient = '{{customer_email}}' or v_recipient = '{{customer_phone}}') then
          v_recipient := case when v_channel = 'email' then v_order.customer_email else v_order.customer_phone end;
        end if;

        v_template_key := nullif(v_config ->> 'template_key', '');
        v_is_transactional := coalesce((v_config ->> 'is_transactional')::boolean, true);

        v_variables := coalesce(v_config -> 'variables', '{}'::jsonb);
        if v_order.id is not null then
          v_variables := v_variables
            || jsonb_build_object('customer_name', v_order.customer_name, 'order_number', v_order.order_number,
                 'order_total', v_order.total_amount, 'currency', v_order.currency_code, 'delivery_status', v_order.status);
        end if;

        v_subject := v_config ->> 'subject';
        v_body := v_config ->> 'body';
        if v_template_key is not null and (v_subject is null or v_body is null) then
          select * into v_rendered from public.render_communication_template(p_rule.workspace_id, v_effective_brand_id, v_template_key, v_channel, v_variables);
          if v_rendered.template_found then
            v_subject := coalesce(v_subject, v_rendered.subject);
            v_body := coalesce(v_body, v_rendered.body);
          end if;
        end if;

        -- Phone validation for sms/whatsapp — normalize using the
        -- customer's own market (customers.country_code via the order,
        -- falling back to the order's own customer_country_code),
        -- never assuming Nigeria.
        v_comm_status := 'queued';
        v_comm_failure_category := null;
        if v_channel in ('sms', 'whatsapp') then
          v_country_code := coalesce(v_order.customer_country_code, (select c.country_code from public.customers c where c.id = v_customer_id));
          select dial_code into v_dial_code from public.countries where code = v_country_code;
          v_recipient := public.normalize_phone(v_recipient, v_dial_code);
          if v_recipient is null then
            v_comm_status := 'permanently_failed';
            v_comm_failure_category := 'client_error';
          end if;
        elsif v_channel = 'email' and coalesce(trim(v_recipient), '') = '' then
          v_comm_status := 'permanently_failed';
          v_comm_failure_category := 'client_error';
        end if;

        -- Marketing consent: only checked for non-transactional sends
        -- with a resolvable customer; transactional sends and sends
        -- with no customer context (e.g. a staff/affiliate notification)
        -- are never gated by a customer's channel preference.
        if v_comm_status = 'queued' and not v_is_transactional and v_customer_id is not null then
          if not exists (
            select 1 from public.customers c where c.id = v_customer_id
              and case v_channel when 'email' then c.email_opt_in when 'sms' then c.sms_opt_in when 'whatsapp' then c.whatsapp_opt_in end
          ) then
            v_comm_status := 'skipped_preference';
          end if;
        end if;

        if not v_comm_config.configured then
          v_comm_status := 'not_configured';
        end if;

        insert into public.communication_log (
          workspace_id, brand_id, channel, recipient, subject, body, status, provider, related_execution_action_id, idempotency_key,
          entity_type, entity_id, customer_id, communication_type, template_key, is_transactional, triggered_by, failure_category
        ) values (
          p_rule.workspace_id, v_effective_brand_id, v_channel, v_recipient, v_subject, v_body,
          v_comm_status, case when v_comm_status = 'queued' then v_comm_config.provider else null end,
          v_action_row.id, v_action_row.id::text,
          p_event.entity_type, p_event.entity_id, v_customer_id,
          coalesce(v_config ->> 'communication_type', v_action_type), v_template_key, v_is_transactional, 'automation', v_comm_failure_category
        )
        on conflict (idempotency_key) where idempotency_key is not null do nothing;

        if v_comm_status = 'queued' then
          v_status := 'queued';
        elsif v_comm_status = 'skipped_preference' then
          v_status := 'skipped';
          v_error := 'skipped_preference: customer has opted out of marketing ' || v_channel;
        elsif v_comm_status = 'permanently_failed' then
          v_status := 'skipped';
          v_error := 'invalid_recipient: could not validate a ' || v_channel || ' recipient';
        else
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
  'Fixed action catalogue, unchanged from 0032 except the SEND_SMS/SEND_WHATSAPP/SEND_EMAIL branch: recipient may now be a {{customer_email}}/{{customer_phone}} token resolved from the triggering order, an optional template_key renders a managed template, sms/whatsapp recipients are validated with normalize_phone() before queuing (invalid -> permanently_failed, never queued), and a non-transactional send is checked against the customer''s marketing opt-in for that channel (opted out -> skipped_preference). Every other action type/branch is byte-for-byte identical to 0032.';


-- ============================================================
-- PART G — manual communication ("Contact Customer")
-- ============================================================

create or replace function public.send_manual_communication(
  p_order_id uuid,
  p_channel text,
  p_template_key text default null,
  p_subject text default null,
  p_body text default null
)
returns public.communication_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_recipient text;
  v_subject text := p_subject;
  v_body text := p_body;
  v_rendered record;
  v_variables jsonb;
  v_dial_code text;
  v_comm_status text := 'queued';
  v_comm_config record;
  v_recent_count integer;
  v_row public.communication_log%rowtype;
begin
  if p_channel not in ('email', 'sms', 'whatsapp') then
    raise exception 'channel must be email, sms or whatsapp';
  end if;

  -- Workspace/brand/customer are resolved ENTIRELY from the order id —
  -- never trusted from any client-supplied workspace_id/brand_id/
  -- customer_id, closing the exact cross-workspace attack section 26
  -- describes.
  select * into v_order from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception 'Order not found';
  end if;
  if not public.user_has_permission(v_order.workspace_id, 'communications.send') then
    raise exception 'insufficient_permission: communications.send required';
  end if;

  select * into v_comm_config from public.resolve_brand_communication_config_internal(v_order.brand_id, p_channel);
  if not v_comm_config.configured then
    raise exception 'No % provider is configured for this brand', p_channel;
  end if;

  v_variables := jsonb_build_object(
    'customer_name', v_order.customer_name, 'order_number', v_order.order_number,
    'order_total', v_order.total_amount, 'currency', v_order.currency_code, 'delivery_status', v_order.status
  );
  if p_template_key is not null and (v_subject is null or v_body is null) then
    select * into v_rendered from public.render_communication_template(v_order.workspace_id, v_order.brand_id, p_template_key, p_channel, v_variables);
    if v_rendered.template_found then
      v_subject := coalesce(v_subject, v_rendered.subject);
      v_body := coalesce(v_body, v_rendered.body);
    end if;
  end if;
  if coalesce(trim(v_body), '') = '' then
    raise exception 'A message body is required (supply p_body or a valid p_template_key)';
  end if;

  v_recipient := case when p_channel = 'email' then v_order.customer_email else v_order.customer_phone end;
  if p_channel in ('sms', 'whatsapp') then
    select dial_code into v_dial_code from public.countries where code = v_order.customer_country_code;
    v_recipient := public.normalize_phone(v_recipient, v_dial_code);
  end if;
  if coalesce(trim(v_recipient), '') = '' then
    raise exception 'Order has no usable % recipient on file', p_channel;
  end if;

  -- Abuse guard (section 27): the same staff member sending the same
  -- channel to the same order more than 3 times in 5 minutes is almost
  -- certainly a UI double-click or a mistake, not 4 genuinely distinct
  -- operational messages — database-backed, no external rate limiter.
  select count(*) into v_recent_count
    from public.communication_log
    where entity_type = 'order' and entity_id = p_order_id and channel = p_channel
      and triggered_by = 'manual' and created_by = auth.uid() and created_at > now() - interval '5 minutes';
  if v_recent_count >= 3 then
    raise exception 'Too many manual % messages sent for this order in the last 5 minutes — wait before sending another', p_channel;
  end if;

  insert into public.communication_log (
    workspace_id, brand_id, channel, recipient, subject, body, status, provider,
    entity_type, entity_id, customer_id, communication_type, template_key, is_transactional, triggered_by, created_by
  ) values (
    v_order.workspace_id, v_order.brand_id, p_channel, v_recipient, v_subject, v_body, v_comm_status, v_comm_config.provider,
    'order', p_order_id, v_order.customer_id, 'CUSTOMER_SUPPORT_MESSAGE', p_template_key, true, 'manual', auth.uid()
  )
  returning * into v_row;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (v_order.workspace_id, v_order.brand_id, auth.uid(), 'communications', 'manual_send', 'order', p_order_id,
    jsonb_build_object('channel', p_channel, 'communication_log_id', v_row.id));

  return v_row;
end;
$$;

comment on function public.send_manual_communication(uuid, text, text, text, text) is
  'The only path for a staff member to manually message a customer about their order. Resolves workspace/brand/customer/recipient entirely server-side from p_order_id — never trusts a client-supplied workspace/brand/customer id. Queues through the same communication_log/dispatch-communication path as automation, so it is never a direct provider call from the frontend. Always is_transactional=true (an operational contact a staff member deliberately initiated is never marketing) and therefore never gated by the customer''s marketing opt-in flags.';


-- ============================================================
-- PART H — safe test connection
-- ============================================================

create or replace function public.test_communication_provider(p_brand_id uuid, p_channel text, p_test_recipient text)
returns public.communication_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand public.brands%rowtype;
  v_comm_config record;
  v_recipient text;
  v_row public.communication_log%rowtype;
begin
  if p_channel not in ('email', 'sms', 'whatsapp') then
    raise exception 'channel must be email, sms or whatsapp';
  end if;
  if coalesce(trim(p_test_recipient), '') = '' then
    raise exception 'A test recipient is required — this must be YOUR OWN address/number, never a customer''s';
  end if;

  select * into v_brand from public.brands where id = p_brand_id and deleted_at is null;
  if not found then
    raise exception 'Brand not found';
  end if;
  if not public.user_has_permission(v_brand.workspace_id, 'communications.manage') then
    raise exception 'insufficient_permission: communications.manage required';
  end if;

  select * into v_comm_config from public.resolve_brand_communication_config_internal(p_brand_id, p_channel);
  if not v_comm_config.configured then
    raise exception 'No % provider is configured for this brand yet — save credentials first', p_channel;
  end if;

  -- p_test_recipient is exactly and only what the calling admin typed
  -- into the Test Connection form — never resolved from any
  -- customer/order/affiliate table, so a test send can never reach a
  -- real customer by mistake.
  v_recipient := p_test_recipient;
  if p_channel in ('sms', 'whatsapp') then
    v_recipient := public.normalize_phone(p_test_recipient, null);
    if v_recipient is null then
      raise exception 'Could not validate the test recipient number';
    end if;
  end if;

  insert into public.communication_log (
    workspace_id, brand_id, channel, recipient, subject, body, status, provider,
    communication_type, is_transactional, triggered_by, created_by
  ) values (
    v_brand.workspace_id, p_brand_id, p_channel, v_recipient,
    case when p_channel = 'email' then '[GCOS Test] Communication provider test' else null end,
    '[GCOS TEST MESSAGE] This is a test of your ' || p_channel || ' configuration. No action is needed.',
    'queued', v_comm_config.provider, 'TEST_CONNECTION', true, 'manual', auth.uid()
  )
  returning * into v_row;

  insert into public.audit_logs (workspace_id, brand_id, user_id, module, action, entity_type, entity_id, new_value)
  values (v_brand.workspace_id, p_brand_id, auth.uid(), 'communications', 'test_send', 'brand', p_brand_id,
    jsonb_build_object('channel', p_channel, 'communication_log_id', v_row.id));

  return v_row;
end;
$$;

comment on function public.test_communication_provider(uuid, text, text) is
  'Queues a clearly-labelled test message through the SAME dispatch-communication path as every real send (so Test Connection genuinely exercises the provider credentials, not a fake success) to an explicit recipient the admin typed in — never a customer looked up from any table. If normalize_phone() cannot parse the number without a market context, the call fails loudly rather than guessing a country.';
