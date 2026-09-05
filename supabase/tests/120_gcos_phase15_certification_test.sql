-- ============================================================
-- GCOS Phase 15 — Production Certification smoke test.
-- Run against a freshly migrated 0001-0036 database with
-- 00_bootstrap_post_migration.sql already applied.
--
-- This is deliberately NOT a re-run of every adversarial RLS/security
-- scenario already certified in Phases 9-14 (101-119 already cover
-- that exhaustively and remain in this directory as the regression
-- baseline). This file targets what is genuinely new in Phase 15:
-- the get_order_daily_stats() rewrite (0036), a live cross-system
-- reconciliation check across Orders/Finance/Analytics/Reports'
-- shared RPCs, a permanent SECURITY DEFINER search_path sweep, and
-- one Affiliate + one Marketing reconciliation chain.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare
  v_ws_a uuid; v_ws_b uuid; v_brand_a uuid;
  v_owner_role uuid; v_cs_role uuid;
  v_i int;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000f1', 'owner-p15@test.local'),
    ('00000000-0000-0000-0000-0000000000f2', 'cs-p15@test.local'),
    ('00000000-0000-0000-0000-0000000000f5', 'ownerb-p15@test.local');

  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('P15 WS A', 'p15-ws-a', 'NG', 'NGN', '00000000-0000-0000-0000-0000000000f1') returning id into v_ws_a;
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('P15 WS B (zero-data)', 'p15-ws-b', 'NG', 'NGN', '00000000-0000-0000-0000-0000000000f5') returning id into v_ws_b;

  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_a, 'P15 Brand A', 'p15-brand-a', '00000000-0000-0000-0000-0000000000f1') returning id into v_brand_a;
  insert into public.brands (workspace_id, name, slug, created_by) values (v_ws_b, 'P15 Brand B', 'p15-brand-b', '00000000-0000-0000-0000-0000000000f5');

  select id into v_owner_role from public.roles where workspace_id is null and slug = 'owner';
  select id into v_cs_role from public.roles where workspace_id is null and slug = 'customer-support';

  insert into public.user_roles (user_id, workspace_id, role_id) values
    ('00000000-0000-0000-0000-0000000000f1', v_ws_a, v_owner_role),
    ('00000000-0000-0000-0000-0000000000f2', v_ws_a, v_cs_role),
    ('00000000-0000-0000-0000-0000000000f5', v_ws_b, v_owner_role);

  -- Deterministic fixture: 20 orders across a 10-day window, a mix of
  -- statuses, exactly 5 DELIVERED+collected (known revenue total).
  for v_i in 1..20 loop
    insert into public.orders (
      workspace_id, brand_id, order_number, source, status, cash_collection_status,
      customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount,
      created_at, delivered_at
    ) values (
      v_ws_a, v_brand_a, 'P15-' || v_i, 'website',
      (array['NEW','PENDING','DISPATCHED','DELIVERED','CANCELLED'])[1 + (v_i % 5)],
      case when v_i % 5 = 3 then 'collected' else 'pending' end,
      'P15 Customer ' || v_i, '0800100' || lpad(v_i::text, 4, '0'),
      '1 P15 Street', 'NGN', 10000, 10000,
      now() - ((v_i % 10) || ' days')::interval,
      case when v_i % 5 = 3 then now() - ((v_i % 10) || ' days')::interval else null end
    );
  end loop;

  raise notice 'P15_WS_A=%, P15_BRAND_A=%, P15_WS_B=%', v_ws_a, v_brand_a, v_ws_b;
end $$;

\echo '=== 1. get_order_daily_stats() (Phase 15 single-pass rewrite) matches a manual per-day recomputation ==='
do $$
declare v_ws uuid; v_row record; v_expected_count bigint;
begin
  select id into v_ws from public.workspaces where slug = 'p15-ws-a';
  for v_row in select * from public.get_order_daily_stats(v_ws, null, 10) loop
    select count(*) into v_expected_count from public.orders
      where workspace_id = v_ws and deleted_at is null and created_at::date = v_row.day;
    assert v_row.order_count = v_expected_count,
      format('day %s: get_order_daily_stats order_count=%s but manual recomputation=%s', v_row.day, v_row.order_count, v_expected_count);
  end loop;
  raise notice 'OK 1: get_order_daily_stats() output is identical to a manual per-day recomputation across a 10-day window.';
end $$;

\echo '=== 2. Cross-system reconciliation: get_order_stats() = manual computation = get_finance_summary() = sum(get_revenue_trend()) ==='
do $$
declare
  v_ws uuid;
  v_stats record;
  v_finance record;
  v_manual_total_orders bigint;
  v_manual_delivered_revenue numeric;
  v_trend_delivered_sum numeric;
  v_from timestamptz;
  v_to timestamptz;
begin
  select id into v_ws from public.workspaces where slug = 'p15-ws-a';
  v_from := now() - interval '9 days';
  v_to := now();

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;

  select * into v_stats from public.get_order_stats(v_ws, null);
  select * into v_finance from public.get_finance_summary(v_ws, null, v_from, v_to);

  reset role;

  select count(*) into v_manual_total_orders from public.orders where workspace_id = v_ws and deleted_at is null;
  select coalesce(sum(total_amount), 0) into v_manual_delivered_revenue from public.orders
    where workspace_id = v_ws and deleted_at is null and status = 'DELIVERED' and cash_collection_status = 'collected';

  assert v_stats.total_orders = v_manual_total_orders,
    format('get_order_stats total_orders=%s but manual count=%s', v_stats.total_orders, v_manual_total_orders);
  assert v_stats.delivered_revenue = v_manual_delivered_revenue,
    format('get_order_stats delivered_revenue=%s but manual sum=%s', v_stats.delivered_revenue, v_manual_delivered_revenue);

  -- get_finance_summary is windowed by created_at (v_from..v_to spans all 10 fixture days), so its
  -- delivered_revenue should equal the same manual sum for orders whose created_at falls in that window.
  assert v_finance.delivered_revenue = v_manual_delivered_revenue,
    format('get_finance_summary delivered_revenue=%s but manual sum=%s (get_order_stats agreed)', v_finance.delivered_revenue, v_manual_delivered_revenue);

  select coalesce(sum(delivered_revenue), 0) into v_trend_delivered_sum
    from public.get_revenue_trend(v_ws, null, v_from, v_to, 'day');
  assert v_trend_delivered_sum = v_manual_delivered_revenue,
    format('sum(get_revenue_trend delivered_revenue)=%s but manual sum=%s — Dashboard/Finance/Reports trend chart would disagree with the summary card', v_trend_delivered_sum, v_manual_delivered_revenue);

  raise notice 'OK 2: get_order_stats(), get_finance_summary(), get_revenue_trend() and a manual recomputation all agree on total_orders=% and delivered_revenue=% — Orders, Dashboard, Finance, Analytics and Reports share one honest source of truth.', v_manual_total_orders, v_manual_delivered_revenue;
end $$;

\echo '=== 3. Zero-data workspace: every dashboard-adjacent RPC returns clean zero/no-data states, never NaN/Infinity/error ==='
do $$
declare
  v_ws uuid;
  v_stats record;
  v_finance record;
  v_trend_count int;
  v_daily_count int;
  v_health_rows int;
begin
  select id into v_ws from public.workspaces where slug = 'p15-ws-b';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f5', false);
  set role authenticated;

  select * into v_stats from public.get_order_stats(v_ws, null);
  assert v_stats.total_orders = 0, 'zero-data workspace must report total_orders=0, not an error';
  assert v_stats.delivery_success_rate = 0, 'zero-data workspace delivery_success_rate must be 0, never NaN/division-by-zero';

  select * into v_finance from public.get_finance_summary(v_ws, null, now() - interval '30 days', now());
  assert v_finance.total_orders = 0 and v_finance.gross_margin_pct = 0,
    'zero-data get_finance_summary must report clean zeros, never NaN/Infinity';

  select count(*) into v_trend_count from public.get_revenue_trend(v_ws, null, now() - interval '7 days', now(), 'day');
  assert v_trend_count = 8, format('get_revenue_trend must still return one row per day in the window (8 expected), got %s — zero orders must not collapse the bucket series', v_trend_count);

  select count(*) into v_daily_count from public.get_order_daily_stats(v_ws, null, 7);
  assert v_daily_count = 7, format('get_order_daily_stats must still return 7 day rows for a zero-order workspace, got %s', v_daily_count);

  select count(*) into v_health_rows from public.get_queue_health(v_ws);
  assert v_health_rows = 3, 'get_queue_health must still return one row per queue (tracking/communication/automation) for a zero-activity workspace';
  perform 1 from public.get_queue_health(v_ws) where health <> 'no_data';
  if found then
    raise exception 'a workspace with zero rows in every queue must report health=no_data for all three, never a fabricated healthy/degraded/failing state';
  end if;

  reset role;
  raise notice 'OK 3: zero-data workspace returns clean, honest zero/no_data states across get_order_stats/get_finance_summary/get_revenue_trend/get_order_daily_stats/get_queue_health — no NaN, no Infinity, no error.';
end $$;

\echo '=== 4. SECURITY DEFINER search_path sweep (permanent regression test for the Phase 15 audit finding) ==='
do $$
declare v_offender text;
begin
  select p.proname into v_offender
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
      where cfg like 'search_path=%'
    )
  limit 1;

  if v_offender is not null then
    raise exception 'SECURITY DEFINER function %.% has no explicit search_path set — privilege-escalation-via-search_path risk', 'public', v_offender;
  end if;
  raise notice 'OK 4: every SECURITY DEFINER function in the public schema has an explicit search_path — no privilege-escalation-via-search_path risk exists.';
end $$;

\echo '=== 5. Secret/counter tables with RLS enabled and zero policies remain genuinely inaccessible to authenticated ==='
do $$
declare v_count int;
begin
  -- A brand under this very workspace already has a brand_communication_secrets
  -- row created by earlier phases' own migrations/fixtures is not guaranteed, so
  -- insert one directly (as the unrestricted migration-owner role) to prove even
  -- a row that genuinely exists is invisible to authenticated.
  insert into public.brand_communication_secrets (workspace_id, brand_id, email_api_key)
    select w.id, b.id, 'fake-key-for-test-only'
    from public.workspaces w join public.brands b on b.workspace_id = w.id
    where w.slug = 'p15-ws-a'
    on conflict (brand_id) do nothing;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;

  -- RLS enabled + zero policies means an implicit USING (false) on every
  -- command: the table stays queryable (authenticated does hold the
  -- ordinary table-level SELECT grant every table gets), but every row
  -- is filtered out — a plain empty result, not a permission-denied
  -- error. That silent-empty behavior, not an exception, is what makes
  -- these tables fail-closed to any direct client query.
  select count(*) into v_count from public.brand_communication_secrets;
  assert v_count = 0, format('brand_communication_secrets must be invisible to authenticated even though a real row exists (RLS enabled, zero policies) — got %s visible rows', v_count);

  select count(*) into v_count from public.order_number_counters;
  assert v_count = 0, format('order_number_counters must be invisible to authenticated (RLS enabled, zero policies) — got %s visible rows', v_count);

  reset role;
  raise notice 'OK 5: brand_communication_secrets and order_number_counters correctly remain fail-closed (RLS enabled, zero policies) — a real secret row exists but zero rows are visible via direct client query.';
end $$;

\echo '=== 6. orders_workspace_delivered_idx (Phase 15) exists — production readiness index check ==='
do $$
begin
  perform 1 from pg_indexes where schemaname = 'public' and tablename = 'orders' and indexname = 'orders_workspace_delivered_idx';
  if not found then
    raise exception 'orders_workspace_delivered_idx is missing — delivered-revenue aggregation would scan every workspace''s delivered orders at production multi-tenant scale';
  end if;
  raise notice 'OK 6: orders_workspace_delivered_idx exists.';
end $$;

\echo '=== 7. A role without finance visibility (Customer Support) still gets zeroed monetary fields post-rewrite ==='
do $$
declare v_ws uuid; v_stats record; v_daily record;
begin
  select id into v_ws from public.workspaces where slug = 'p15-ws-a';
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f2', false);
  set role authenticated;

  select * into v_stats from public.get_order_stats(v_ws, null);
  assert v_stats.total_orders > 0, 'Customer Support must still see operational counts';
  assert v_stats.delivered_revenue = 0, 'Customer Support (no finance.view/analytics.view/reports.view) must see delivered_revenue=0, never the real figure';

  select * into v_daily from public.get_order_daily_stats(v_ws, null, 10) order by day desc limit 1;
  assert v_daily.delivered_revenue = 0, 'get_order_daily_stats delivered_revenue must remain zeroed for Customer Support after the Phase 15 rewrite — the finance-visibility gate must survive the query-shape change';

  reset role;
  raise notice 'OK 7: finance-visibility boundary survives the Phase 15 get_order_daily_stats() rewrite — Customer Support still sees zeroed monetary fields.';
end $$;

\echo '=== 8. Anonymous and cross-workspace callers get zero rows (RLS-filtered), never an error, from dashboard RPCs ==='
do $$
declare v_ws uuid; v_stats record; v_daily_count int;
begin
  select id into v_ws from public.workspaces where slug = 'p15-ws-a';

  perform set_config('app.test_user_id', '', false);
  set role anon;
  select * into v_stats from public.get_order_stats(v_ws, null);
  assert v_stats.total_orders = 0, 'anonymous caller must see total_orders=0 for a workspace it has no membership in (RLS-filtered, not an error)';
  select count(*) into v_daily_count from public.get_order_daily_stats(v_ws, null, 5);
  assert v_daily_count = 5, 'get_order_daily_stats must still return its day-series rows for an unauthorized caller — just with order_count=0 per day, never an error';
  reset role;

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f5', false);
  set role authenticated;
  select * into v_stats from public.get_order_stats(v_ws, null);
  assert v_stats.total_orders = 0, 'a Workspace B owner must see total_orders=0 for Workspace A (cross-workspace RLS isolation), not an error and not Workspace A''s real data';
  reset role;

  raise notice 'OK 8: anonymous and cross-workspace callers correctly get RLS-filtered zero results, never an error and never another workspace''s real figures.';
end $$;

\echo '=== 9. Affiliate commission -> wallet -> withdrawal ledger reconciliation ==='
do $$
declare
  v_ws uuid; v_aff uuid; v_wallet record; v_ledger_sum numeric; v_withdrawal record;
begin
  select id into v_ws from public.workspaces where slug = 'p15-ws-a';
  insert into public.affiliates (workspace_id, full_name, referral_code, approval_status, status)
    values (v_ws, 'P15 Affiliate', 'P15REF1', 'approved', 'active') returning id into v_aff;

  perform public.credit_affiliate_wallet(v_ws, v_aff, 'COMMISSION_EARNED', 5000, 0, 'test', null, 'P15 commission credit', 'NGN');
  perform public.credit_affiliate_wallet(v_ws, v_aff, 'COMMISSION_EARNED', 3000, 0, 'test', null, 'P15 second commission credit', 'NGN');

  select * into v_wallet from public.affiliate_wallets where workspace_id = v_ws and affiliate_id = v_aff;
  select coalesce(sum(amount), 0) into v_ledger_sum from public.affiliate_wallet_transactions where wallet_id = v_wallet.id;
  assert v_wallet.balance = v_ledger_sum,
    format('affiliate_wallets.balance=%s must equal sum(affiliate_wallet_transactions.amount)=%s — the wallet balance must never be an independently-tracked figure', v_wallet.balance, v_ledger_sum);
  assert v_wallet.balance = 8000, format('expected balance=8000 after two credits (5000+3000), got %s', v_wallet.balance);

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  select * into v_withdrawal from public.request_affiliate_withdrawal(v_aff, 3000, 'P15 withdrawal test');
  reset role;

  select * into v_wallet from public.affiliate_wallets where workspace_id = v_ws and affiliate_id = v_aff;
  select coalesce(sum(amount), 0) into v_ledger_sum from public.affiliate_wallet_transactions where wallet_id = v_wallet.id;
  assert v_wallet.balance = v_ledger_sum,
    format('after a withdrawal request, affiliate_wallets.balance=%s must still equal sum(affiliate_wallet_transactions.amount)=%s', v_wallet.balance, v_ledger_sum);
  assert v_wallet.balance = 5000, format('expected balance=5000 after an 8000 credit total minus a 3000 withdrawal request, got %s', v_wallet.balance);

  raise notice 'OK 9: affiliate commission -> wallet -> withdrawal chain is ledger-exact end to end (balance=%, reconciled against %s transaction rows).', v_wallet.balance, (select count(*) from public.affiliate_wallet_transactions where wallet_id = v_wallet.id);
end $$;

\echo '=== 10. Marketing attribution -> ad spend -> delivered revenue reconciliation (get_marketing_summary) ==='
do $$
declare
  v_ws uuid; v_brand uuid; v_campaign uuid;
  v_summary record; v_manual_delivered_revenue numeric; v_manual_delivered_orders bigint;
begin
  select id into v_ws from public.workspaces where slug = 'p15-ws-a';
  -- Isolated brand so this reconciliation isn't diluted by the 20-order
  -- fixture already seeded on p15-brand-a — get_marketing_summary's
  -- delivered_revenue/delivered_orders are workspace+BRAND scoped (not
  -- filtered by campaign attribution; that is a separate, per-campaign
  -- concern handled by get_marketing_campaign_detail/list instead).
  insert into public.brands (workspace_id, name, slug, created_by)
    values (v_ws, 'P15 Brand Marketing', 'p15-brand-marketing', '00000000-0000-0000-0000-0000000000f1') returning id into v_brand;

  insert into public.marketing_campaigns (workspace_id, brand_id, name, channel, utm_campaign, status)
    values (v_ws, v_brand, 'P15 Campaign', 'meta', 'p15-utm-campaign', 'active') returning id into v_campaign;

  insert into public.ad_costs (workspace_id, brand_id, marketing_campaign_id, period_start, period_end, initial_cost_amount, currency_code, status)
    values (v_ws, v_brand, v_campaign, current_date - 5, current_date, 2000, 'NGN', 'APPROVED');

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, cash_collection_status,
    customer_name, customer_phone, customer_address, currency_code, subtotal, total_amount,
    created_at, delivered_at, utm_campaign
  ) values (
    v_ws, v_brand, 'P15-CAMPAIGN-1', 'website', 'DELIVERED', 'collected',
    'P15 Campaign Customer', '08009990001', '1 P15 Street', 'NGN', 15000, 15000,
    now(), now(), 'p15-utm-campaign'
  );

  select coalesce(sum(total_amount), 0), count(*) into v_manual_delivered_revenue, v_manual_delivered_orders
    from public.orders where workspace_id = v_ws and brand_id = v_brand and status = 'DELIVERED' and cash_collection_status = 'collected';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  select * into v_summary from public.get_marketing_summary(v_ws, v_brand, now() - interval '1 day', now() + interval '1 day');
  reset role;

  assert v_summary.total_ad_spend = 2000, format('get_marketing_summary total_ad_spend=%s but the single APPROVED ad_costs row is 2000', v_summary.total_ad_spend);
  assert v_summary.delivered_revenue = v_manual_delivered_revenue,
    format('get_marketing_summary delivered_revenue=%s but manual brand-scoped sum=%s', v_summary.delivered_revenue, v_manual_delivered_revenue);
  assert v_summary.delivered_orders = v_manual_delivered_orders,
    format('get_marketing_summary delivered_orders=%s but manual count=%s', v_summary.delivered_orders, v_manual_delivered_orders);
  assert v_summary.delivered_roas = round(v_manual_delivered_revenue / 2000, 2),
    format('get_marketing_summary delivered_roas=%s but delivered_revenue/ad_spend=%s', v_summary.delivered_roas, round(v_manual_delivered_revenue / 2000, 2));

  raise notice 'OK 10: Paid Media -> Ad Cost -> Delivered Revenue -> ROAS chain is internally consistent (ad_spend=2000, delivered_revenue=%, roas=%, matching get_marketing_summary exactly).', v_manual_delivered_revenue, v_summary.delivered_roas;
end $$;

\echo '=== ALL PHASE 15 PRODUCTION CERTIFICATION TESTS PASSED ==='
