-- ============================================================
-- SECURITY REMEDIATION — get_order_stats() finance-visibility
-- hardening (targeted follow-up to Phase 6 Part A / 0025).
--
-- STEP 1 FINDING (documented, not assumed):
-- Inspection of the CURRENT public.get_order_stats(uuid, uuid)
-- (as replaced by 0025) shows it already wraps every one of its
-- seven monetary output fields (total_sales_value,
-- today_sales_value, delivered_revenue, today_delivered_revenue,
-- pending_revenue, returned_value, cancelled_value) in
-- `case when public.user_has_finance_visibility(p_workspace_id)
-- then ... else 0 end`, exactly mirroring the boundary used by
-- every Finance/Analytics RPC (0023). Every count field and
-- delivery_success_rate is left ungated, since those are
-- legitimately operational. The function is SECURITY INVOKER
-- (no explicit `security definer`), so it also runs under the
-- caller's own RLS — the existing "select_orders" policy (0018)
-- already requires workspace membership + orders.view, so a
-- caller with no role in the target workspace, or a caller in a
-- different workspace, gets zero rows before the finance gate
-- even applies. get_order_stats() itself therefore needs NO
-- further code change here.
--
-- What DOES need fixing: get_order_daily_stats(uuid, uuid,
-- integer) — the sibling RPC added in the same file (0019) that
-- backs the (now-unused, see below) Orders daily trend chart —
-- returns the exact same delivered_revenue statistic per day
-- with NO finance-visibility gate at all. Any orders.view holder
-- (Customer Support, Warehouse Staff) can call it directly via
-- the Supabase RPC endpoint and read real day-by-day delivered
-- revenue, bypassing the very boundary get_order_stats() enforces
-- for the identical field. This is the "bypassed elsewhere" case
-- Step 8 of this remediation asks to check for — found and closed
-- below, using the exact same pattern, nothing else changed.
--
-- Frontend check: `fetchOrderDailyStats`/`useOrderDailyStats` in
-- src/features/orders/{api,hooks}.ts are the only wrappers, and
-- grep confirms no page currently calls useOrderDailyStats() (the
-- Dashboard Refinement phase moved the trend chart onto Finance's
-- own get_revenue_trend()). So, as with the original get_order_
-- stats() fix, this closes a direct-RPC exposure with zero
-- visible UI change — no frontend file needed to change.
--
-- Two other RPCs were found returning order-derived revenue
-- (get_customer_order_summary in 0020, get_affiliate_performance/
-- get_campaign_performance in 0024) but both are gated by their
-- own purpose-built, already-correct visibility boundaries
-- (customers.view and user_has_affiliate_visibility() respectively)
-- for different modules entirely — not a bypass of THIS boundary,
-- and out of scope for this targeted remediation.
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
  )
  select
    days.day,
    coalesce((
      select count(*) from public.orders o
      where o.workspace_id = p_workspace_id
        and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null
        and o.created_at >= days.day and o.created_at < days.day + interval '1 day'
    ), 0),
    case when public.user_has_finance_visibility(p_workspace_id) then coalesce((
      select sum(o.total_amount) from public.orders o
      where o.workspace_id = p_workspace_id
        and (p_brand_id is null or o.brand_id = p_brand_id)
        and o.deleted_at is null
        and o.status = 'DELIVERED'
        and o.cash_collection_status = 'collected'
        and o.delivered_at >= days.day and o.delivered_at < days.day + interval '1 day'
    ), 0) else 0 end
  from days
  order by days.day;
$$;

comment on function public.get_order_daily_stats(uuid, uuid, integer) is
  'Day-bucketed order count + delivered revenue for the last p_days days (inclusive of today). order_count is operational and always visible to any orders.view holder; delivered_revenue is gated by user_has_finance_visibility() (0023), the same boundary get_order_stats() (0025) uses for its own delivered_revenue field. Never hand-roll this aggregation client-side.';
