-- ============================================================
-- GCOS Phase 12 — Marketing Intelligence & Campaign Operations
--
-- Repository audit before writing this migration confirmed:
--   * `marketing.view`/`marketing.update`/`marketing.manage` permissions
--     already exist (0008) but have ZERO role_permissions grants —
--     they were seeded for a pixel/CAPI-configuration use case that
--     Phases 10-11 later implemented under `landing_pages.tracking.*`
--     instead. This migration finally uses the `marketing` module for
--     its real purpose and adds the two genuinely missing actions
--     (create, delete) plus export.
--   * `public.ad_costs` (0024) is the one existing marketing-spend
--     ledger — it already has period/amount/status/approval fields.
--     It is extended here (marketing_campaign_id, channel, source,
--     description, external_reference), never duplicated.
--   * `public.affiliate_campaigns` (0024) is a distinct concept
--     (affiliate access/commission economics). `marketing_campaigns`
--     here answers a different question — acquisition/spend/delivered
--     economics — and may optionally reference an affiliate campaign,
--     never replace it.
--   * `public.get_finance_summary()` (0022/0023) is the authoritative
--     delivered-revenue/COGS/contribution-profit formula. Every
--     monetary figure below reuses that exact rule (status = DELIVERED
--     and cash_collection_status = 'collected', dated by delivered_at)
--     rather than reinventing it.
--   * No "media buyer" entity exists anywhere in the codebase. A
--     minimal model is introduced here (marketing_campaigns.media_buyer_id
--     -> auth.users, resolved against existing profiles), never a new
--     fake-user table.
--   * `public.landing_pages.market_country_code` / `market_currency_code`
--     (0021/0031) is the existing per-record market pattern — reused
--     verbatim for marketing_campaigns instead of inventing a second
--     market model.
--   * `orders` already carries the full browser-attribution field set
--     (utm_source/medium/campaign/term/content, fbclid, ttclid,
--     affiliate_id, landing_page_id) from Phases 10-11. This migration
--     never touches that capture path — it only *reads* those columns
--     to resolve an order to a marketing campaign (utm_campaign match)
--     for reporting.
-- ============================================================


-- ============================================================
-- PART A — Permissions
-- ============================================================

insert into public.permissions (module, action, slug, category, description) values
  ('marketing', 'create', 'marketing.create', 'Marketing', 'Create marketing campaigns'),
  ('marketing', 'delete', 'marketing.delete', 'Marketing', 'Archive/delete marketing campaigns'),
  ('marketing', 'export', 'marketing.export', 'Marketing', 'Export marketing reports')
on conflict (slug) do nothing;

comment on column public.permissions.module is
  'marketing.view/update/manage were seeded in 0008 for pixel/CAPI configuration, a use case Phases 10-11 implemented instead under landing_pages.tracking.*. Phase 12 (0033) repurposes the marketing module for its real subject — campaign/spend/attribution intelligence — and adds create/delete/export.';

-- Owner, Admin: full marketing module.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin')
  and p.module = 'marketing'
on conflict do nothing;

-- Manager: operational marketing access (view/create/update/export),
-- no manage/delete — the same "no manage" boundary Manager gets on
-- every other operational module (campaigns, ad_costs, etc).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and p.slug in ('marketing.view', 'marketing.create', 'marketing.update', 'marketing.export')
on conflict do nothing;

-- Marketing: the role this entire phase exists for — full marketing
-- operations, matching how Affiliate Manager gets full affiliate
-- authority in 0024.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'marketing'
  and p.module = 'marketing'
on conflict do nothing;

-- Finance: finance-sensitive marketing visibility (spend, CPA, ROAS,
-- profit) plus export for reporting — never create/update/manage
-- (Finance doesn't run campaigns, it audits their economics).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'finance'
  and p.slug in ('marketing.view', 'marketing.export')
on conflict do nothing;

-- Affiliate Manager: visibility only where a marketing campaign links
-- to an affiliate campaign they manage — view, not manage.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'affiliate-manager'
  and p.slug = 'marketing.view'
on conflict do nothing;

-- Viewer: read-only, matching every other module's Viewer grant.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'viewer'
  and p.slug = 'marketing.view'
on conflict do nothing;

-- Customer Support and Warehouse Staff intentionally get nothing —
-- no marketing financial intelligence, per the master prompt's
-- explicit role matrix. No insert statement needed for either.


-- ============================================================
-- PART B — marketing_campaigns
-- ============================================================

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  channel text not null
    check (channel in ('meta', 'tiktok', 'google', 'affiliate', 'organic', 'direct', 'whatsapp', 'other')),
  source text,
  objective text,

  product_id uuid references public.products (id) on delete set null,
  landing_page_id uuid references public.landing_pages (id) on delete set null,
  affiliate_campaign_id uuid references public.affiliate_campaigns (id) on delete set null,
  media_buyer_id uuid references auth.users (id) on delete set null,

  -- Denormalized at insert time from the workspace's market, exactly
  -- like landing_pages.market_country_code/market_currency_code
  -- (0021) — never joined live, so a later workspace market change
  -- never silently reshapes a campaign already running in NGN.
  market_country_code text,
  market_currency_code text,

  external_campaign_id text,
  utm_campaign text,
  tracking_metadata jsonb not null default '{}'::jsonb,

  start_date date,
  end_date date,
  budget_total numeric(14, 2) check (budget_total is null or budget_total >= 0),
  budget_daily numeric(14, 2) check (budget_daily is null or budget_daily >= 0),

  target_orders integer check (target_orders is null or target_orders >= 0),
  target_delivered_orders integer check (target_delivered_orders is null or target_delivered_orders >= 0),
  target_delivered_revenue numeric(14, 2) check (target_delivered_revenue is null or target_delivered_revenue >= 0),
  target_delivered_cpa numeric(14, 2) check (target_delivered_cpa is null or target_delivered_cpa >= 0),
  target_delivered_roas numeric(8, 2) check (target_delivered_roas is null or target_delivered_roas >= 0),
  target_delivery_rate_pct numeric(5, 2) check (target_delivery_rate_pct is null or (target_delivery_rate_pct >= 0 and target_delivery_rate_pct <= 100)),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,

  check (end_date is null or start_date is null or end_date >= start_date)
);

comment on table public.marketing_campaigns is
  'A marketing campaign answers "how are we acquiring customers and what economic result does that acquisition produce?" — distinct from affiliate_campaigns, which answers "how do affiliates participate and earn commission?" The two may be linked (affiliate_campaign_id) but neither replaces the other. Attribution to orders is resolved at read time in get_marketing_campaign_list()/get_marketing_campaign_detail() via utm_campaign match against orders.utm_campaign — never stored/duplicated onto orders.';

comment on column public.marketing_campaigns.utm_campaign is
  'The utm_campaign value used in this campaign''s ad links. Orders are attributed to this campaign by matching orders.utm_campaign (case-insensitive, trimmed) — the same browser-captured attribution Phase 10/11 already collect, never recreated here.';

comment on column public.marketing_campaigns.channel is
  'Meta/TikTok/Google/Affiliate/Organic/Direct/WhatsApp/Other — works identically across NG/GH/KE/ZA/future markets; currency always comes from market_currency_code, never hardcoded.';

create index marketing_campaigns_workspace_brand_idx on public.marketing_campaigns (workspace_id, brand_id);
create index marketing_campaigns_status_idx on public.marketing_campaigns (status);
create index marketing_campaigns_channel_idx on public.marketing_campaigns (channel);
create index marketing_campaigns_product_id_idx on public.marketing_campaigns (product_id) where product_id is not null;
create index marketing_campaigns_landing_page_id_idx on public.marketing_campaigns (landing_page_id) where landing_page_id is not null;
create index marketing_campaigns_media_buyer_id_idx on public.marketing_campaigns (media_buyer_id) where media_buyer_id is not null;
create index marketing_campaigns_utm_campaign_idx on public.marketing_campaigns (workspace_id, brand_id, lower(utm_campaign)) where utm_campaign is not null;

create trigger set_marketing_campaigns_updated_at
  before update on public.marketing_campaigns
  for each row execute function public.set_updated_at();

-- Default market/currency from the workspace, once, at insert time —
-- the same pattern as landing_pages' own market-defaulting trigger.
create or replace function public.set_marketing_campaign_market_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.market_country_code is null then
    select country_code, currency_code into new.market_country_code, new.market_currency_code
    from public.workspaces where id = new.workspace_id;
  elsif new.market_currency_code is null then
    select currency_code into new.market_currency_code
    from public.countries where code = new.market_country_code;
  end if;
  return new;
end;
$$;

create trigger set_marketing_campaign_market_defaults
  before insert on public.marketing_campaigns
  for each row execute function public.set_marketing_campaign_market_defaults();

create trigger audit_marketing_campaigns
  after insert or update or delete on public.marketing_campaigns
  for each row execute function public.log_audit_event('marketing');

alter table public.marketing_campaigns enable row level security;

create policy "select_marketing_campaigns" on public.marketing_campaigns
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'marketing.view')
  );

create policy "insert_marketing_campaigns" on public.marketing_campaigns
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'marketing.create')
  );

create policy "update_marketing_campaigns" on public.marketing_campaigns
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'marketing.update') or public.user_has_permission(workspace_id, 'marketing.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'marketing.update') or public.user_has_permission(workspace_id, 'marketing.manage'))
  );

create policy "delete_marketing_campaigns" on public.marketing_campaigns
  for delete to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'marketing.delete')
  );


-- ============================================================
-- PART C — Extend the EXISTING ad_costs ledger (never duplicated)
-- ============================================================

alter table public.ad_costs add column if not exists marketing_campaign_id uuid references public.marketing_campaigns (id) on delete set null;
alter table public.ad_costs add column if not exists channel text
  check (channel is null or channel in ('meta', 'tiktok', 'google', 'affiliate', 'organic', 'direct', 'whatsapp', 'other'));
alter table public.ad_costs add column if not exists source text;
alter table public.ad_costs add column if not exists description text;
alter table public.ad_costs add column if not exists external_reference text;

comment on column public.ad_costs.marketing_campaign_id is
  'Optional link to a marketing_campaigns row (Phase 12) — independent from the pre-existing campaign_id link to affiliate_campaigns. An ad_costs row may reference either, both, or neither. This is the single spend ledger both campaign types share; it is never duplicated into a second table.';

create index ad_costs_marketing_campaign_id_idx on public.ad_costs (marketing_campaign_id) where marketing_campaign_id is not null;

-- No RLS changes: the existing insert/select/approve policies check
-- only workspace_id/brand_id + permission slug, never specific FK
-- values, so they already cover the new columns without modification.


-- ============================================================
-- PART D — Marketing-specific visibility helpers
-- ============================================================

-- Operational visibility (campaign names/status/orders/delivery rate) —
-- anyone holding any marketing permission.
create or replace function public.user_has_marketing_visibility(p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select public.user_has_permission(p_workspace_id, 'marketing.view')
      or public.user_has_permission(p_workspace_id, 'marketing.update')
      or public.user_has_permission(p_workspace_id, 'marketing.manage');
$$;

comment on function public.user_has_marketing_visibility(uuid) is
  'Gate for OPERATIONAL marketing figures (campaign identity, orders, delivery rate) — does not by itself unlock spend/CPA/ROAS/profit. See user_has_marketing_finance_visibility().';

-- Financial visibility (spend, CPA, ROAS, profit) — the role matrix
-- requires marketing.manage (Owner/Admin/Marketing already have it),
-- OR the existing finance visibility gate (Finance already holds
-- finance.view from 0022; Customer Support/Warehouse Staff hold
-- neither and therefore see no marketing financial figures even if
-- someone mistakenly granted them marketing.view).
create or replace function public.user_has_marketing_finance_visibility(p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select public.user_has_permission(p_workspace_id, 'marketing.manage')
      or public.user_has_finance_visibility(p_workspace_id);
$$;

comment on function public.user_has_marketing_finance_visibility(uuid) is
  'Gate for marketing SPEND/CPA/ROAS/PROFIT — every RPC below returns null (not zero, not an error) for these columns when this is false, so a Customer Support or Warehouse Staff user who somehow has marketing.view still never receives financial figures.';


-- ============================================================
-- PART E — Read RPCs (SECURITY INVOKER + embedded permission checks,
-- the same convention as get_ad_cost_summary()/get_finance_summary())
-- ============================================================

-- Orders attributed to a marketing campaign: utm_campaign match,
-- case-insensitive/trimmed, scoped to the same workspace+brand. This
-- is the ONLY attribution join used anywhere in Phase 12 — it never
-- recreates browser attribution, it only reads it.
create or replace function public.get_marketing_summary(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_ad_spend numeric,
  orders_created bigint,
  delivered_orders bigint,
  delivered_revenue numeric,
  delivered_roas numeric,
  delivered_cpa numeric,
  active_campaigns bigint
)
language sql
stable
as $$
  with visible as (
    select public.user_has_marketing_visibility(p_workspace_id) as can_view,
           public.user_has_marketing_finance_visibility(p_workspace_id) as can_view_finance
  ),
  spend as (
    select coalesce(sum(ac.initial_cost_amount), 0) as total_ad_spend
    from public.ad_costs ac
    where ac.workspace_id = p_workspace_id and ac.brand_id = p_brand_id
      and ac.status = 'APPROVED'
      and (p_date_from is null or ac.period_end >= p_date_from::date)
      and (p_date_to is null or ac.period_start <= p_date_to::date)
  ),
  created_scope as (
    select count(*) as orders_created
    from public.orders o
    where o.workspace_id = p_workspace_id and o.brand_id = p_brand_id and o.deleted_at is null
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  delivered_scope as (
    select count(*) as delivered_orders, coalesce(sum(o.total_amount), 0) as delivered_revenue
    from public.orders o
    where o.workspace_id = p_workspace_id and o.brand_id = p_brand_id and o.deleted_at is null
      and o.status = 'DELIVERED' and o.cash_collection_status = 'collected'
      and (p_date_from is null or o.delivered_at >= p_date_from)
      and (p_date_to is null or o.delivered_at <= p_date_to)
  ),
  campaigns as (
    select count(*) as active_campaigns
    from public.marketing_campaigns mc
    where mc.workspace_id = p_workspace_id and mc.brand_id = p_brand_id
      and mc.deleted_at is null and mc.status = 'active'
  )
  select
    case when v.can_view_finance then s.total_ad_spend else null end,
    cs.orders_created,
    ds.delivered_orders,
    case when v.can_view_finance then ds.delivered_revenue else null end,
    case when v.can_view_finance and s.total_ad_spend > 0 then round(ds.delivered_revenue / s.total_ad_spend, 2) else null end,
    case when v.can_view_finance and ds.delivered_orders > 0 then round(s.total_ad_spend / ds.delivered_orders, 2) else null end,
    c.active_campaigns
  from visible v, spend s, created_scope cs, delivered_scope ds, campaigns c
  where v.can_view;
$$;

comment on function public.get_marketing_summary(uuid, uuid, timestamptz, timestamptz) is
  'Top-of-dashboard KPIs. orders_created is dated by created_at; delivered_orders/delivered_revenue are dated by delivered_at (a delivery this week for an order placed last week counts this week) — the same separate-scope convention as get_finance_summary(). Delivered ROAS = delivered_revenue/ad_spend, Delivered CPA = ad_spend/delivered_orders — both null (never 0/Infinity) when their denominator is 0. Returns zero rows (not an error) when the caller lacks marketing.view/update/manage; financial columns are individually null for a caller with operational-only visibility.';


create or replace function public.get_marketing_campaign_list(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_status text default null,
  p_channel text default null,
  p_search text default null
)
returns table (
  campaign_id uuid,
  name text,
  channel text,
  status text,
  market_country_code text,
  currency_code text,
  product_id uuid,
  product_name text,
  landing_page_id uuid,
  landing_page_name text,
  media_buyer_id uuid,
  media_buyer_name text,
  start_date date,
  end_date date,
  budget_total numeric,
  spend numeric,
  budget_utilization_pct numeric,
  orders_created bigint,
  confirmed_orders bigint,
  dispatched_orders bigint,
  delivered_orders bigint,
  cancelled_orders bigint,
  returned_orders bigint,
  delivery_rate_pct numeric,
  delivered_revenue numeric,
  delivered_cpa numeric,
  roas numeric,
  cogs_delivered numeric,
  delivery_cost_delivered numeric,
  contribution_profit numeric,
  profit_data_available boolean,
  created_at timestamptz
)
language sql
stable
as $$
  with visible as (
    select public.user_has_marketing_visibility(p_workspace_id) as can_view,
           public.user_has_marketing_finance_visibility(p_workspace_id) as can_view_finance
  ),
  campaigns as (
    select mc.*
    from public.marketing_campaigns mc
    where mc.workspace_id = p_workspace_id and mc.brand_id = p_brand_id
      and mc.deleted_at is null
      and (p_status is null or mc.status = p_status)
      and (p_channel is null or mc.channel = p_channel)
      and (p_search is null or p_search = '' or mc.name ilike '%' || p_search || '%')
  ),
  spend as (
    select ac.marketing_campaign_id, coalesce(sum(ac.initial_cost_amount), 0) as spend
    from public.ad_costs ac
    where ac.workspace_id = p_workspace_id and ac.brand_id = p_brand_id
      and ac.status = 'APPROVED' and ac.marketing_campaign_id is not null
      and (p_date_from is null or ac.period_end >= p_date_from::date)
      and (p_date_to is null or ac.period_start <= p_date_to::date)
    group by ac.marketing_campaign_id
  ),
  attributed_orders as (
    select c.id as campaign_row_id, o.*
    from campaigns c
    join public.orders o
      on o.workspace_id = p_workspace_id and o.brand_id = p_brand_id and o.deleted_at is null
      and c.utm_campaign is not null and c.utm_campaign <> ''
      and lower(trim(o.utm_campaign)) = lower(trim(c.utm_campaign))
  ),
  created_scope as (
    select campaign_row_id, count(*) as orders_created,
           count(*) filter (where confirmed_at is not null) as confirmed_orders,
           count(*) filter (where dispatched_at is not null) as dispatched_orders,
           count(*) filter (where status = 'CANCELLED') as cancelled_orders,
           count(*) filter (where status = 'RETURNED') as returned_orders
    from attributed_orders
    where (p_date_from is null or created_at >= p_date_from)
      and (p_date_to is null or created_at <= p_date_to)
    group by campaign_row_id
  ),
  delivered_scope as (
    select campaign_row_id,
           count(*) as delivered_orders,
           coalesce(sum(total_amount), 0) as delivered_revenue,
           coalesce(sum(cost_amount) filter (where cost_amount is not null), 0) as cogs_delivered,
           coalesce(sum(actual_delivery_cost) filter (where actual_delivery_cost is not null), 0) as delivery_cost_delivered,
           count(*) filter (where cost_amount is not null and actual_delivery_cost is not null) as profit_orders_count
    from attributed_orders
    where status = 'DELIVERED' and cash_collection_status = 'collected'
      and (p_date_from is null or delivered_at >= p_date_from)
      and (p_date_to is null or delivered_at <= p_date_to)
    group by campaign_row_id
  )
  select
    c.id,
    c.name,
    c.channel,
    c.status,
    c.market_country_code,
    c.market_currency_code,
    c.product_id,
    p.name,
    c.landing_page_id,
    lp.name,
    c.media_buyer_id,
    trim(concat(pr.first_name, ' ', pr.last_name)),
    c.start_date,
    c.end_date,
    case when v.can_view_finance then c.budget_total else null end,
    case when v.can_view_finance then coalesce(s.spend, 0) else null end,
    case when v.can_view_finance and c.budget_total > 0 then round(100.0 * coalesce(s.spend, 0) / c.budget_total, 1) else null end,
    coalesce(cs.orders_created, 0),
    coalesce(cs.confirmed_orders, 0),
    coalesce(cs.dispatched_orders, 0),
    coalesce(ds.delivered_orders, 0),
    coalesce(cs.cancelled_orders, 0),
    coalesce(cs.returned_orders, 0),
    case when coalesce(cs.orders_created, 0) > 0 then round(100.0 * coalesce(ds.delivered_orders, 0) / cs.orders_created, 1) else null end,
    case when v.can_view_finance then coalesce(ds.delivered_revenue, 0) else null end,
    case when v.can_view_finance and coalesce(ds.delivered_orders, 0) > 0 then round(coalesce(s.spend, 0) / ds.delivered_orders, 2) else null end,
    case when v.can_view_finance and coalesce(s.spend, 0) > 0 then round(coalesce(ds.delivered_revenue, 0) / s.spend, 2) else null end,
    case when v.can_view_finance then ds.cogs_delivered else null end,
    case when v.can_view_finance then ds.delivery_cost_delivered else null end,
    case when v.can_view_finance and coalesce(ds.profit_orders_count, 0) > 0
      then round(ds.delivered_revenue - ds.cogs_delivered - ds.delivery_cost_delivered - coalesce(s.spend, 0), 2)
      else null end,
    coalesce(ds.profit_orders_count, 0) > 0,
    c.created_at
  from campaigns c
  cross join visible v
  left join public.products p on p.id = c.product_id
  left join public.landing_pages lp on lp.id = c.landing_page_id
  left join public.profiles pr on pr.id = c.media_buyer_id
  left join spend s on s.marketing_campaign_id = c.id
  left join created_scope cs on cs.campaign_row_id = c.id
  left join delivered_scope ds on ds.campaign_row_id = c.id
  where v.can_view
  order by c.created_at desc;
$$;

comment on function public.get_marketing_campaign_list(uuid, uuid, timestamptz, timestamptz, text, text, text) is
  'Authoritative Campaign List row source — the server computes every metric; the frontend never recalculates ROAS/CPA/delivery rate. contribution_profit is null (with profit_data_available=false) whenever no delivered order in scope has both cost_amount and actual_delivery_cost recorded — never fabricated as a fake profit number.';


create or replace function public.get_marketing_campaign_detail(p_campaign_id uuid)
returns table (
  campaign_id uuid,
  name text,
  description text,
  status text,
  channel text,
  source text,
  objective text,
  market_country_code text,
  currency_code text,
  product_id uuid,
  product_name text,
  landing_page_id uuid,
  landing_page_name text,
  affiliate_campaign_id uuid,
  affiliate_campaign_name text,
  media_buyer_id uuid,
  media_buyer_name text,
  utm_campaign text,
  external_campaign_id text,
  start_date date,
  end_date date,
  budget_total numeric,
  budget_daily numeric,
  notes text,
  spend numeric,
  budget_utilization_pct numeric,
  orders_created bigint,
  confirmed_orders bigint,
  dispatched_orders bigint,
  delivered_orders bigint,
  cancelled_orders bigint,
  returned_orders bigint,
  delivery_rate_pct numeric,
  cancellation_rate_pct numeric,
  return_rate_pct numeric,
  delivered_revenue numeric,
  total_order_value numeric,
  average_order_value numeric,
  delivered_cpa numeric,
  initial_cpa numeric,
  roas numeric,
  cogs_delivered numeric,
  delivery_cost_delivered numeric,
  affiliate_commission numeric,
  contribution_profit numeric,
  profit_data_available boolean,
  landing_page_views bigint,
  landing_page_form_starts bigint,
  target_orders integer,
  target_delivered_orders integer,
  target_delivered_revenue numeric,
  target_delivered_cpa numeric,
  target_delivered_roas numeric,
  target_delivery_rate_pct numeric
)
language sql
stable
as $$
  with campaign as (
    select mc.* from public.marketing_campaigns mc where mc.id = p_campaign_id and mc.deleted_at is null
  ),
  visible as (
    select public.user_has_marketing_visibility(c.workspace_id) as can_view,
           public.user_has_marketing_finance_visibility(c.workspace_id) as can_view_finance
    from campaign c
  ),
  spend as (
    select coalesce(sum(ac.initial_cost_amount), 0) as spend
    from public.ad_costs ac, campaign c
    where ac.marketing_campaign_id = c.id and ac.status = 'APPROVED'
  ),
  attributed_orders as (
    select o.* from public.orders o, campaign c
    where o.workspace_id = c.workspace_id and o.brand_id = c.brand_id and o.deleted_at is null
      and c.utm_campaign is not null and c.utm_campaign <> ''
      and lower(trim(o.utm_campaign)) = lower(trim(c.utm_campaign))
  ),
  created_scope as (
    select count(*) as orders_created,
           count(*) filter (where confirmed_at is not null) as confirmed_orders,
           count(*) filter (where dispatched_at is not null) as dispatched_orders,
           count(*) filter (where status = 'CANCELLED') as cancelled_orders,
           count(*) filter (where status = 'RETURNED') as returned_orders,
           coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0) as total_order_value
    from attributed_orders
  ),
  delivered_scope as (
    select count(*) as delivered_orders,
           coalesce(sum(total_amount), 0) as delivered_revenue,
           coalesce(sum(cost_amount) filter (where cost_amount is not null), 0) as cogs_delivered,
           coalesce(sum(actual_delivery_cost) filter (where actual_delivery_cost is not null), 0) as delivery_cost_delivered,
           count(*) filter (where cost_amount is not null and actual_delivery_cost is not null) as profit_orders_count
    from attributed_orders
    where status = 'DELIVERED' and cash_collection_status = 'collected'
  ),
  affiliate_econ as (
    select coalesce(sum(ac.commission_amount) filter (where ac.status = 'ELIGIBLE'), 0) as affiliate_commission
    from public.affiliate_commissions ac, campaign c, attributed_orders ao
    where c.affiliate_campaign_id is not null and ac.order_id = ao.id and ac.campaign_id = c.affiliate_campaign_id
  ),
  funnel as (
    select
      count(*) filter (where lpe.event_type = 'page_view') as landing_page_views,
      count(*) filter (where lpe.event_type = 'form_started') as landing_page_form_starts
    from public.landing_page_events lpe, campaign c
    where c.landing_page_id is not null and lpe.landing_page_id = c.landing_page_id
      and (c.start_date is null or lpe.created_at >= c.start_date)
      and (c.end_date is null or lpe.created_at < c.end_date + 1)
  )
  select
    c.id, c.name, c.description, c.status, c.channel, c.source, c.objective,
    c.market_country_code, c.market_currency_code,
    c.product_id, p.name,
    c.landing_page_id, lp.name,
    c.affiliate_campaign_id, fc.name,
    c.media_buyer_id, trim(concat(pr.first_name, ' ', pr.last_name)),
    c.utm_campaign, c.external_campaign_id,
    c.start_date, c.end_date,
    case when v.can_view_finance then c.budget_total else null end,
    case when v.can_view_finance then c.budget_daily else null end,
    c.notes,
    case when v.can_view_finance then s.spend else null end,
    case when v.can_view_finance and c.budget_total > 0 then round(100.0 * s.spend / c.budget_total, 1) else null end,
    cs.orders_created, cs.confirmed_orders, cs.dispatched_orders, ds.delivered_orders, cs.cancelled_orders, cs.returned_orders,
    case when cs.orders_created > 0 then round(100.0 * ds.delivered_orders / cs.orders_created, 1) else null end,
    case when cs.orders_created > 0 then round(100.0 * cs.cancelled_orders / cs.orders_created, 1) else null end,
    case when cs.orders_created > 0 then round(100.0 * cs.returned_orders / cs.orders_created, 1) else null end,
    case when v.can_view_finance then ds.delivered_revenue else null end,
    case when v.can_view_finance then cs.total_order_value else null end,
    case when v.can_view_finance and ds.delivered_orders > 0 then round(ds.delivered_revenue / ds.delivered_orders, 2) else null end,
    case when v.can_view_finance and ds.delivered_orders > 0 then round(s.spend / ds.delivered_orders, 2) else null end,
    case when v.can_view_finance and cs.orders_created > 0 then round(s.spend / cs.orders_created, 2) else null end,
    case when v.can_view_finance and s.spend > 0 then round(ds.delivered_revenue / s.spend, 2) else null end,
    case when v.can_view_finance then ds.cogs_delivered else null end,
    case when v.can_view_finance then ds.delivery_cost_delivered else null end,
    case when v.can_view_finance then ae.affiliate_commission else null end,
    case when v.can_view_finance and ds.profit_orders_count > 0
      then round(ds.delivered_revenue - ds.cogs_delivered - ds.delivery_cost_delivered - ae.affiliate_commission - s.spend, 2)
      else null end,
    ds.profit_orders_count > 0,
    f.landing_page_views, f.landing_page_form_starts,
    c.target_orders, c.target_delivered_orders, c.target_delivered_revenue, c.target_delivered_cpa, c.target_delivered_roas, c.target_delivery_rate_pct
  from campaign c
  cross join visible v
  cross join spend s
  cross join created_scope cs
  cross join delivered_scope ds
  cross join affiliate_econ ae
  cross join funnel f
  left join public.products p on p.id = c.product_id
  left join public.landing_pages lp on lp.id = c.landing_page_id
  left join public.affiliate_campaigns fc on fc.id = c.affiliate_campaign_id
  left join public.profiles pr on pr.id = c.media_buyer_id
  where v.can_view;
$$;

comment on function public.get_marketing_campaign_detail(uuid) is
  'Campaign Detail page: header + performance + funnel + attribution + economics + budget in one row. landing_page_views/landing_page_form_starts are the LANDING PAGE''s own traffic within the campaign''s date range (all sources landing on that page), not per-campaign-exclusive counts — landing_page_events carries no utm_campaign dimension, so this is reported honestly as page-level traffic rather than fabricating campaign-exclusive funnel data.';


create or replace function public.get_marketing_trend(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_campaign_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  bucket date,
  spend numeric,
  orders_created bigint,
  delivered_orders bigint,
  delivered_revenue numeric
)
language sql
stable
as $$
  with visible as (
    select public.user_has_marketing_visibility(p_workspace_id) as can_view,
           public.user_has_marketing_finance_visibility(p_workspace_id) as can_view_finance
  ),
  bounds as (
    select coalesce(p_date_from, now() - interval '29 days')::date as d_from,
           coalesce(p_date_to, now())::date as d_to
  ),
  days as (
    select generate_series(b.d_from, b.d_to, interval '1 day')::date as day from bounds b
  ),
  campaign_orders as (
    select o.* from public.orders o
    left join public.marketing_campaigns mc on mc.id = p_campaign_id
    where o.workspace_id = p_workspace_id and o.brand_id = p_brand_id and o.deleted_at is null
      and (
        p_campaign_id is null
        or (mc.utm_campaign is not null and lower(trim(o.utm_campaign)) = lower(trim(mc.utm_campaign)))
      )
  ),
  created_by_day as (
    select created_at::date as day, count(*) as orders_created
    from campaign_orders
    group by created_at::date
  ),
  delivered_by_day as (
    select delivered_at::date as day, count(*) as delivered_orders, coalesce(sum(total_amount), 0) as delivered_revenue
    from campaign_orders
    where status = 'DELIVERED' and cash_collection_status = 'collected'
    group by delivered_at::date
  ),
  spend_by_day as (
    select days.day, coalesce(sum(ac.initial_cost_amount / greatest(ac.period_end - ac.period_start + 1, 1)), 0) as spend
    from days
    join public.ad_costs ac
      on ac.workspace_id = p_workspace_id and ac.brand_id = p_brand_id and ac.status = 'APPROVED'
      and (p_campaign_id is null or ac.marketing_campaign_id = p_campaign_id)
      and days.day between ac.period_start and ac.period_end
    group by days.day
  )
  select
    d.day,
    case when v.can_view_finance then coalesce(sb.spend, 0) else null end,
    coalesce(cb.orders_created, 0),
    coalesce(db.delivered_orders, 0),
    case when v.can_view_finance then coalesce(db.delivered_revenue, 0) else null end
  from days d
  cross join visible v
  left join created_by_day cb on cb.day = d.day
  left join delivered_by_day db on db.day = d.day
  left join spend_by_day sb on sb.day = d.day
  where v.can_view
  order by d.day;
$$;

comment on function public.get_marketing_trend(uuid, uuid, uuid, timestamptz, timestamptz) is
  'Daily trend series for a campaign (p_campaign_id set) or the whole brand (null). Spend is evenly spread across each ad_costs period''s days — the ledger records period totals, not a daily figure, so this is an honest allocation of a known total, not a fabricated daily spend value.';


create or replace function public.get_marketing_channel_performance(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  channel text,
  spend numeric,
  orders_created bigint,
  delivered_orders bigint,
  delivered_revenue numeric,
  delivered_cpa numeric,
  roas numeric
)
language sql
stable
as $$
  with visible as (
    select public.user_has_marketing_visibility(p_workspace_id) as can_view,
           public.user_has_marketing_finance_visibility(p_workspace_id) as can_view_finance
  ),
  campaigns as (
    select id, channel, utm_campaign from public.marketing_campaigns
    where workspace_id = p_workspace_id and brand_id = p_brand_id and deleted_at is null
      and utm_campaign is not null and utm_campaign <> ''
  ),
  -- Every order is classified into exactly one channel bucket:
  -- matched campaign channel > affiliate (affiliate_id set) > direct
  -- (no utm/click-id signal at all) > organic (some signal, no match).
  -- No platform is ever guessed from ambiguous data.
  classified_orders as (
    select o.*,
      coalesce(
        (select c.channel from campaigns c where lower(trim(o.utm_campaign)) = lower(trim(c.utm_campaign)) limit 1),
        case
          when o.affiliate_id is not null then 'affiliate'
          when o.utm_source is null and o.utm_medium is null and o.fbclid is null and o.ttclid is null then 'direct'
          else 'organic'
        end
      ) as resolved_channel
    from public.orders o
    where o.workspace_id = p_workspace_id and o.brand_id = p_brand_id and o.deleted_at is null
  ),
  created_scope as (
    select resolved_channel, count(*) as orders_created
    from classified_orders
    where (p_date_from is null or created_at >= p_date_from) and (p_date_to is null or created_at <= p_date_to)
    group by resolved_channel
  ),
  delivered_scope as (
    select resolved_channel, count(*) as delivered_orders, coalesce(sum(total_amount), 0) as delivered_revenue
    from classified_orders
    where status = 'DELIVERED' and cash_collection_status = 'collected'
      and (p_date_from is null or delivered_at >= p_date_from) and (p_date_to is null or delivered_at <= p_date_to)
    group by resolved_channel
  ),
  spend_scope as (
    -- Only spend explicitly attributed via a marketing_campaign's
    -- channel is counted per-channel; unlinked spend is never
    -- arbitrarily assigned to a channel.
    select mc.channel, coalesce(sum(ac.initial_cost_amount), 0) as spend
    from public.ad_costs ac
    join public.marketing_campaigns mc on mc.id = ac.marketing_campaign_id
    where ac.workspace_id = p_workspace_id and ac.brand_id = p_brand_id and ac.status = 'APPROVED'
      and (p_date_from is null or ac.period_end >= p_date_from::date)
      and (p_date_to is null or ac.period_start <= p_date_to::date)
    group by mc.channel
  ),
  channels as (
    select resolved_channel as channel from created_scope
    union
    select channel from spend_scope
  )
  select
    ch.channel,
    case when v.can_view_finance then coalesce(sp.spend, 0) else null end,
    coalesce(cs.orders_created, 0),
    coalesce(ds.delivered_orders, 0),
    case when v.can_view_finance then coalesce(ds.delivered_revenue, 0) else null end,
    case when v.can_view_finance and coalesce(ds.delivered_orders, 0) > 0 then round(coalesce(sp.spend, 0) / ds.delivered_orders, 2) else null end,
    case when v.can_view_finance and coalesce(sp.spend, 0) > 0 then round(coalesce(ds.delivered_revenue, 0) / sp.spend, 2) else null end
  from channels ch
  cross join visible v
  left join created_scope cs on cs.resolved_channel = ch.channel
  left join delivered_scope ds on ds.resolved_channel = ch.channel
  left join spend_scope sp on sp.channel = ch.channel
  where v.can_view
  order by coalesce(ds.delivered_revenue, 0) desc;
$$;

comment on function public.get_marketing_channel_performance(uuid, uuid, timestamptz, timestamptz) is
  'Channel/Source Performance table. Affiliate economics here is spend actually recorded against an affiliate-channel marketing campaign in ad_costs — affiliate COMMISSION is never counted as advertising spend (see get_marketing_campaign_detail''s separate affiliate_commission column for that accounting).';


create or replace function public.get_marketing_media_buyer_performance(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  media_buyer_id uuid,
  media_buyer_name text,
  campaigns_count bigint,
  spend numeric,
  orders_created bigint,
  delivered_orders bigint,
  delivered_revenue numeric,
  delivered_cpa numeric,
  roas numeric,
  contribution_profit numeric
)
language sql
stable
as $$
  with visible as (
    select public.user_has_marketing_visibility(p_workspace_id) as can_view,
           public.user_has_marketing_finance_visibility(p_workspace_id) as can_view_finance
  ),
  campaigns as (
    select mc.* from public.marketing_campaigns mc
    where mc.workspace_id = p_workspace_id and mc.brand_id = p_brand_id and mc.deleted_at is null
      and mc.media_buyer_id is not null
  ),
  spend as (
    select ac.marketing_campaign_id, coalesce(sum(ac.initial_cost_amount), 0) as spend
    from public.ad_costs ac
    where ac.workspace_id = p_workspace_id and ac.brand_id = p_brand_id and ac.status = 'APPROVED'
      and ac.marketing_campaign_id is not null
      and (p_date_from is null or ac.period_end >= p_date_from::date)
      and (p_date_to is null or ac.period_start <= p_date_to::date)
    group by ac.marketing_campaign_id
  ),
  attributed as (
    select c.media_buyer_id, o.*
    from campaigns c
    join public.orders o on o.workspace_id = c.workspace_id and o.brand_id = c.brand_id and o.deleted_at is null
      and c.utm_campaign is not null and c.utm_campaign <> ''
      and lower(trim(o.utm_campaign)) = lower(trim(c.utm_campaign))
  ),
  created_scope as (
    select media_buyer_id, count(*) as orders_created
    from attributed
    where (p_date_from is null or created_at >= p_date_from) and (p_date_to is null or created_at <= p_date_to)
    group by media_buyer_id
  ),
  delivered_scope as (
    select media_buyer_id, count(*) as delivered_orders,
           coalesce(sum(total_amount), 0) as delivered_revenue,
           coalesce(sum(cost_amount) filter (where cost_amount is not null), 0) as cogs_delivered,
           coalesce(sum(actual_delivery_cost) filter (where actual_delivery_cost is not null), 0) as delivery_cost_delivered,
           count(*) filter (where cost_amount is not null and actual_delivery_cost is not null) as profit_orders_count
    from attributed
    where status = 'DELIVERED' and cash_collection_status = 'collected'
      and (p_date_from is null or delivered_at >= p_date_from) and (p_date_to is null or delivered_at <= p_date_to)
    group by media_buyer_id
  ),
  spend_per_buyer as (
    select c.media_buyer_id, coalesce(sum(s.spend), 0) as spend, count(distinct c.id) as campaigns_count
    from campaigns c
    left join spend s on s.marketing_campaign_id = c.id
    group by c.media_buyer_id
  )
  select
    pr.id,
    trim(concat(pr.first_name, ' ', pr.last_name)),
    coalesce(sb.campaigns_count, 0),
    case when v.can_view_finance then coalesce(sb.spend, 0) else null end,
    coalesce(cs.orders_created, 0),
    coalesce(ds.delivered_orders, 0),
    case when v.can_view_finance then coalesce(ds.delivered_revenue, 0) else null end,
    case when v.can_view_finance and coalesce(ds.delivered_orders, 0) > 0 then round(coalesce(sb.spend, 0) / ds.delivered_orders, 2) else null end,
    case when v.can_view_finance and coalesce(sb.spend, 0) > 0 then round(coalesce(ds.delivered_revenue, 0) / sb.spend, 2) else null end,
    case when v.can_view_finance and coalesce(ds.profit_orders_count, 0) > 0
      then round(ds.delivered_revenue - ds.cogs_delivered - ds.delivery_cost_delivered - coalesce(sb.spend, 0), 2)
      else null end
  from spend_per_buyer sb
  cross join visible v
  join public.profiles pr on pr.id = sb.media_buyer_id
  left join created_scope cs on cs.media_buyer_id = sb.media_buyer_id
  left join delivered_scope ds on ds.media_buyer_id = sb.media_buyer_id
  where v.can_view
  order by coalesce(ds.delivered_revenue, 0) desc;
$$;

comment on function public.get_marketing_media_buyer_performance(uuid, uuid, timestamptz, timestamptz) is
  'Media Buyer is a minimal ownership model (marketing_campaigns.media_buyer_id -> auth.users, resolved against the existing profiles table) — never a fake user table. A profile only appears here once assigned to at least one campaign.';


-- ============================================================
-- PART F — Realtime (targeted, matching 0032's convention exactly)
-- ============================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketing_campaigns'
    )
  then
    execute 'alter publication supabase_realtime add table public.marketing_campaigns';
  end if;
end $$;

comment on trigger set_marketing_campaign_market_defaults on public.marketing_campaigns is
  'Realtime is enabled only on marketing_campaigns itself (campaign create/update/archive) — ad_costs already publishes via its own workspace-scoped queries and does not need a second subscription; approved-spend changes are picked up by ordinary query invalidation on the ad-cost approve/reject mutations, matching the master prompt''s instruction not to subscribe to every table unnecessarily.';
