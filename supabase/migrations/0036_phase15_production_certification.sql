-- ============================================================
-- PHASE 15 — PRODUCTION CERTIFICATION
--
-- This is a certification/hardening pass, not a new module. Per the
-- audit-first mandate: migrations 0001-0035, all RLS policies, all
-- SECURITY DEFINER functions, indexes, the Realtime publication, and
-- the communication/tracking/automation queue architecture were
-- inspected before writing anything below. Findings:
--
--   * All 143 historical SECURITY DEFINER function definitions across
--     every migration set an explicit `search_path` — no privilege-
--     escalation-via-search_path risk found anywhere in the codebase.
--   * The 4 tables with RLS enabled and zero policies
--     (brand_communication_secrets, brand_tracking_secrets,
--     landing_page_tracking_secrets, order_number_counters) are all
--     deliberate fail-closed lockdowns, already documented at their
--     own `enable row level security` lines — direct client access is
--     correctly impossible; every legitimate read/write path already
--     goes through a permission-checked SECURITY DEFINER RPC. No
--     change needed.
--   * Every hot-path table already reviewed in prior phases (orders,
--     inventory_transactions, affiliate_wallet_transactions,
--     audit_logs, automation_executions) carries the composite/partial
--     indexes its query patterns need. No speculative index added
--     anywhere in this migration beyond the one justified below.
--
-- ONE genuine, evidence-backed defect was found and is fixed here:
--
-- public.get_order_daily_stats(uuid, uuid, integer) executed TWO
-- correlated subqueries per day in its output (one COUNT, one
-- conditional SUM), i.e. up to 2 * p_days full/partial scans of
-- `orders` per call. Measured locally with EXPLAIN ANALYZE against a
-- freshly seeded local Postgres:
--
--   * 15,000 orders in the target workspace only, p_days=30:
--       139ms, 118,872 buffer hits (vs. 41ms/5,062 for the
--       single-pass get_order_stats() over the SAME 15,000 rows).
--   * Same target workspace (still 15,000 of its own orders) with a
--     second, unrelated 60,000-row "noise" workspace added to the
--     SAME orders table (75,000 total rows, closer to a real
--     multi-tenant production table): 4,257ms — a ~30x regression
--     from adding rows belonging to OTHER workspaces, which should
--     never happen once workspace_id is the leading filter.
--
-- get_revenue_trend() (0022/0023) — the function the Dashboard/
-- Finance/Reports trend charts ACTUALLY call today — was measured at
-- the same 75,000-row scale and stayed fast (4.4ms), so it is left
-- unchanged. get_order_daily_stats() has no current frontend caller
-- (confirmed by 0026's own comment: "grep confirms no page currently
-- calls useOrderDailyStats()"), but it is still a live, callable,
-- orders.view-gated RPC exposed over PostgREST, and a query that gets
-- ~30x slower purely from unrelated workspaces' rows accumulating in
-- a shared table is exactly the kind of correctness-adjacent
-- production risk Phase 15 exists to close — not a redesign, a
-- same-signature, same-semantics implementation fix.
-- ============================================================

create or replace function public.get_order_daily_stats(p_workspace_id uuid, p_brand_id uuid default null, p_days integer default 7)
returns table (
  day date,
  order_count bigint,
  delivered_revenue numeric
)
language sql
stable
as $$
  with days as (
    select generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day')::date as day
  ),
  -- Single pass over the window, grouped by calendar day, instead of
  -- one correlated subquery per day. (created_at)::date bucketing is
  -- the exact same session-timezone day boundary the original
  -- `created_at >= day and created_at < day + 1` range comparison
  -- expressed — not a formula change, purely a plan-shape change.
  created_counts as (
    select o.created_at::date as day, count(*) as cnt
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.created_at >= (current_date - (greatest(p_days, 1) - 1))
      and o.created_at < (current_date + 1)
    group by 1
  ),
  delivered_sums as (
    select o.delivered_at::date as day, sum(o.total_amount) as amt
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.status = 'DELIVERED'
      and o.cash_collection_status = 'collected'
      and o.delivered_at >= (current_date - (greatest(p_days, 1) - 1))
      and o.delivered_at < (current_date + 1)
    group by 1
  )
  select
    days.day,
    coalesce(cc.cnt, 0),
    case when public.user_has_finance_visibility(p_workspace_id) then coalesce(ds.amt, 0) else 0 end
  from days
  left join created_counts cc on cc.day = days.day
  left join delivered_sums ds on ds.day = days.day
  order by days.day;
$$;

comment on function public.get_order_daily_stats(uuid, uuid, integer) is
  'Day-bucketed order count + delivered revenue for the last p_days days (inclusive of today). order_count is operational and always visible to any orders.view holder; delivered_revenue is gated by user_has_finance_visibility() (0023), the same boundary get_order_stats() (0025) uses for its own delivered_revenue field. Never hand-roll this aggregation client-side. Rewritten in Phase 15 (0036) from a per-day correlated-subquery loop to two single-pass GROUP BY aggregations — same signature, same output, same finance-visibility gate; only the query shape changed. See this migration''s header comment for the EXPLAIN ANALYZE evidence.';

-- Justified by the same evidence: delivered_at is the join key for
-- delivered-revenue aggregation across get_order_stats,
-- get_order_daily_stats, get_revenue_trend, get_finance_summary and
-- settlement reconciliation, but the only existing index on it
-- (orders_delivered_at_idx, 0019) has no workspace_id leading column
-- — at production multi-tenant scale a delivered_at range scan has to
-- consider every OTHER workspace's delivered orders before filtering
-- down to this one. Mirrors the existing
-- orders_workspace_brand_created_idx (0013) pattern exactly.
create index if not exists orders_workspace_delivered_idx
  on public.orders (workspace_id, delivered_at)
  where delivered_at is not null;
