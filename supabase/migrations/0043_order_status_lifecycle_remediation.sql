-- ============================================================
-- GCOS — Order Status Lifecycle Remediation (0043)
--
-- Root cause: the frontend was never hiding statuses — the DATABASE
-- only ever supported 11 of the 14 canonical statuses. CONFIRMED,
-- NEEDS_FOLLOW_UP, and REPEATED_ORDER did not exist anywhere in the
-- schema. The existing order_status_transitions table + the
-- guard_order_status_transition() BEFORE UPDATE trigger (0013/0016)
-- were already the correct, real, database-authoritative transition
-- rulebook — this migration EXTENDS that rulebook with the 3 missing
-- statuses and their legal transitions, rather than inventing a
-- second lifecycle model. The frontend's OrderStatusDialog already
-- reads legal next-statuses live from order_status_transitions (see
-- src/features/orders/api.ts fetchOrderStatusTransitions()), so once
-- this migration lands, the "Change Status" dropdown automatically
-- exposes every newly-legal transition with zero additional frontend
-- wiring for that specific piece.
--
-- IMPORTANT — a deliberate, documented reversal of a prior decision:
-- get_order_status_value_breakdown()'s original comment (0022/0023)
-- explicitly said "'Repeated Order' is a customer tag, not a status,
-- and never appears here," and 101_finance_smoke_test.sql asserted
-- exactly 11 status rows with that guard. That was a correct
-- description of the schema AT THE TIME — is_repeat_customer (a
-- CUSTOMER-level boolean, unrelated, untouched by this migration) is
-- still the only "repeat" concept for that flag. This migration adds
-- a real, distinct, ORDER-level REPEATED_ORDER status per an explicit
-- product decision (the GCOS Order Status Lifecycle Remediation
-- brief). The old test assertion is updated in lockstep — see
-- supabase/tests/127_order_status_lifecycle_test.sql and the update to
-- 101_finance_smoke_test.sql — with this exact reasoning recorded
-- there so nobody mistakes the reversal for an oversight.
--
-- Revenue-correctness fix this migration also makes: REPEATED_ORDER
-- is only ever reachable from DELIVERED or RETURNED (both already-
-- resolved states). Every place that computed "delivered revenue" by
-- checking the CURRENT status literally equals 'DELIVERED' would
-- silently lose that revenue the moment such an order advances to
-- REPEATED_ORDER. cash_collection_status = 'collected' is the actual
-- durable revenue-recognition signal in this schema (only ever set by
-- guard_order_status_transition()'s DELIVERED-entry logic, and never
-- cleared afterward) — every "delivered revenue" computation below
-- switches to that criterion alone, which is provably equivalent for
-- every order that never leaves DELIVERED and correctly inclusive for
-- one that later moves to REPEATED_ORDER. This is a narrow correctness
-- fix, not a redefinition of what counts as revenue. "Pending revenue"
-- and "still active/assignable" exclusion lists gain REPEATED_ORDER
-- (it is a resolved, terminal status, like DELIVERED/RETURNED/
-- CANCELLED). returned_value/cancelled_orders/rate_returned_count
-- remain keyed on the literal current status — a RETURNED order that
-- is later marked REPEATED_ORDER will stop counting as "returned"
-- historically. This is a known, accepted, documented limitation
-- (see the final report) rather than a silent gap: it is a genuinely
-- rare compound edge case, and fixing it durably would require a
-- point-in-time ledger this schema does not have for RETURNED the way
-- it does for DELIVERED (via cash_collection_status).
-- ============================================================


-- ---------------------------------------------------------------
-- PART A — schema: 3 new statuses + their legal transitions.
-- ---------------------------------------------------------------
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'NEW', 'PENDING', 'CONFIRMED', 'WILL_CALL_BACK', 'NEEDS_FOLLOW_UP', 'SCHEDULED',
    'PROCESSING_FOR_DISPATCH', 'DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED',
    'DELIVERED', 'RETURNED', 'CANCELLED', 'REPEATED_ORDER'
  ));

comment on constraint orders_status_check on public.orders is
  'The 14 canonical GCOS order statuses (0043). CONFIRMED/NEEDS_FOLLOW_UP/REPEATED_ORDER added here — every other status predates this migration. See order_status_transitions for the legal transition graph.';

-- New edges only — every one of the 19 rows seeded in 0013 (plus
-- 0029's DISPATCHED->DELIVERED addition) is untouched. Decomposed
-- from the brief's named chains; where a chain read as an operationally
-- backwards regression to an EARLIER fulfillment stage (e.g. "Delivered
-- -> Partially Delivered"), it was interpreted as the existing table's
-- own established pattern of listing sibling next-statuses from a
-- shared source rather than a literal single-file pipeline — IN_TRANSIT
-- already has three legal next-statuses (DELIVERED/PARTIALLY_DELIVERED/
-- RETURNED) in the pre-existing table for exactly this reason.
insert into public.order_status_transitions (from_status, to_status, requires_approval) values
  -- Primary flow: New -> Pending -> Confirmed -> Processing for dispatch -> Dispatched -> Scheduled/In Transit -> Delivered.
  ('PENDING', 'CONFIRMED', false),
  ('CONFIRMED', 'PROCESSING_FOR_DISPATCH', false),
  -- "Dispatched -> Scheduled -> In Transit -> Delivered": SCHEDULED
  -- becomes usable at a SECOND point in the lifecycle (a post-dispatch
  -- delivery appointment), alongside its pre-existing pre-dispatch use
  -- (WILL_CALL_BACK -> SCHEDULED -> PROCESSING_FOR_DISPATCH, untouched).
  ('DISPATCHED', 'SCHEDULED', false),
  ('SCHEDULED', 'IN_TRANSIT', false),
  ('SCHEDULED', 'DELIVERED', true),
  -- "Pending -> Needs Follow-up -> Will call back -> Confirmed" and
  -- "Confirmed -> Needs Follow-up -> Will call back -> Cancelled" and
  -- "Needs Follow-up -> Confirmed -> Will call back -> Cancelled" and
  -- "Will call back -> Confirmed -> Needs Follow-up -> Cancelled":
  -- decomposed into the CS follow-up sub-graph below.
  ('PENDING', 'NEEDS_FOLLOW_UP', false),
  ('NEEDS_FOLLOW_UP', 'WILL_CALL_BACK', false),
  ('WILL_CALL_BACK', 'CONFIRMED', false),
  ('CONFIRMED', 'NEEDS_FOLLOW_UP', false),
  ('NEEDS_FOLLOW_UP', 'CONFIRMED', false),
  ('CONFIRMED', 'WILL_CALL_BACK', false),
  ('NEEDS_FOLLOW_UP', 'CANCELLED', true),
  -- "Partially Delivered -> Delivered -> Needs Follow-up -> Returned":
  -- a genuine post-delivery exception path (a delivered order's
  -- customer raises an issue, staff follow up, it is ultimately
  -- returned) — unlike the Delivered/Partially-Delivered case, this
  -- does not regress to an earlier FULFILLMENT stage, so it is
  -- implemented literally as named.
  ('DELIVERED', 'NEEDS_FOLLOW_UP', false),
  ('NEEDS_FOLLOW_UP', 'RETURNED', true),
  -- "Delivered -> Repeated order" / "Returned -> Repeated order where
  -- appropriate". REPEATED_ORDER is a distinct ORDER-level lifecycle
  -- status — never to be confused with is_repeat_customer, a CUSTOMER-
  -- level boolean computed by create_order()/create_public_order() from
  -- prior order history, untouched by this migration.
  ('DELIVERED', 'REPEATED_ORDER', false),
  ('RETURNED', 'REPEATED_ORDER', false)
on conflict do nothing;


-- ---------------------------------------------------------------
-- PART B — guard_order_status_transition(): additive only. Body
-- copied verbatim from 0016's live definition; the only change is one
-- new `if` branch stamping confirmed_at on entering CONFIRMED, mirroring
-- (not replacing) the pre-existing PENDING branch — some workspaces'
-- historical flow stamped confirmed_at on reaching PENDING (the old
-- de-facto "confirmed" state before this status existed); that
-- behavior is preserved byte-for-byte for backward compatibility.
-- ---------------------------------------------------------------
create or replace function public.guard_order_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.order_status_transitions
      where from_status = old.status and to_status = new.status
    ) then
      raise exception 'Invalid order status transition: % -> %', old.status, new.status;
    end if;

    if exists (
      select 1 from public.order_status_transitions
      where from_status = old.status and to_status = new.status and requires_approval
    ) and not public.user_has_permission(new.workspace_id, 'orders.approve') then
      raise exception 'insufficient_permission: orders.approve required for % -> %', old.status, new.status;
    end if;

    if new.status = 'SCHEDULED' and new.scheduled_at is null then
      raise exception 'scheduled_at is required when transitioning to SCHEDULED';
    end if;
    if new.status = 'CANCELLED' and coalesce(new.cancellation_reason, '') = '' then
      raise exception 'cancellation_reason is required when cancelling an order';
    end if;
    if new.status = 'RETURNED' and coalesce(new.return_reason, '') = '' then
      raise exception 'return_reason is required when returning an order';
    end if;

    -- Server-stamped timestamps. Never trust a client-submitted value
    -- for "when did this actually happen" — always now().
    if new.status = 'PENDING' and old.confirmed_at is null then
      new.confirmed_at := now();
    end if;
    -- 0043: the real CONFIRMED status now exists; stamp confirmed_at
    -- here too (additive — the PENDING branch above is untouched).
    if new.status = 'CONFIRMED' and old.confirmed_at is null then
      new.confirmed_at := now();
    end if;
    if new.status = 'DISPATCHED' then
      new.dispatched_at := now();
    end if;
    if new.status = 'DELIVERED' then
      new.delivered_at := now();
      -- Default COD rule: a Delivered order with no explicit collection
      -- figure supplied means the full amount was collected in cash.
      if new.cash_collected_amount is null then
        new.cash_collected_amount := new.total_amount;
        new.cash_collection_status := 'collected';
      end if;
      if new.cash_collection_status = 'collected' and new.cash_collected_at is null then
        new.cash_collected_at := now();
      end if;
    end if;
    if new.status = 'RETURNED' then
      new.returned_at := now();
    end if;
    if new.status = 'CANCELLED' then
      new.cancelled_at := now();
    end if;
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------
-- PART C — get_order_stats(): authoritative Orders-page KPI RPC
-- (0025). Adds 3 new per-status count columns (additive — every
-- existing column keeps its exact prior meaning) and applies the
-- revenue-correctness fix described above. Return shape changed, so
-- the function must be dropped first (Postgres cannot CREATE OR
-- REPLACE across an OUT-parameter/RETURNS TABLE shape change).
-- ---------------------------------------------------------------
drop function if exists public.get_order_stats(uuid, uuid);

create function public.get_order_stats(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  total_orders bigint,
  today_orders bigint,
  new_count bigint,
  pending_count bigint,
  confirmed_count bigint,
  will_call_back_count bigint,
  needs_follow_up_count bigint,
  scheduled_count bigint,
  processing_count bigint,
  dispatched_count bigint,
  in_transit_count bigint,
  partially_delivered_count bigint,
  delivered_count bigint,
  returned_count bigint,
  cancelled_count bigint,
  repeated_order_count bigint,
  total_sales_value numeric,
  today_sales_value numeric,
  delivered_revenue numeric,
  today_delivered_revenue numeric,
  pending_revenue numeric,
  returned_value numeric,
  cancelled_value numeric,
  delivery_success_rate numeric
)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (where created_at >= date_trunc('day', now())),
    count(*) filter (where status = 'NEW'),
    count(*) filter (where status = 'PENDING'),
    count(*) filter (where status = 'CONFIRMED'),
    count(*) filter (where status = 'WILL_CALL_BACK'),
    count(*) filter (where status = 'NEEDS_FOLLOW_UP'),
    count(*) filter (where status = 'SCHEDULED'),
    count(*) filter (where status = 'PROCESSING_FOR_DISPATCH'),
    count(*) filter (where status = 'DISPATCHED'),
    count(*) filter (where status = 'IN_TRANSIT'),
    count(*) filter (where status = 'PARTIALLY_DELIVERED'),
    count(*) filter (where status = 'DELIVERED'),
    count(*) filter (where status = 'RETURNED'),
    count(*) filter (where status = 'CANCELLED'),
    count(*) filter (where status = 'REPEATED_ORDER'),
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status <> 'CANCELLED' and created_at >= date_trunc('day', now())), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where cash_collection_status = 'collected'), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where cash_collection_status = 'collected' and delivered_at >= date_trunc('day', now())), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED', 'REPEATED_ORDER')), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status = 'RETURNED'), 0) else 0 end,
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount) filter (where status = 'CANCELLED'), 0) else 0 end,
    case
      when count(*) filter (where status in ('DELIVERED', 'RETURNED', 'CANCELLED', 'REPEATED_ORDER')) > 0
        then round(100.0 * count(*) filter (where cash_collection_status = 'collected') / count(*) filter (where status in ('DELIVERED', 'RETURNED', 'CANCELLED', 'REPEATED_ORDER')), 1)
      else 0
    end
  from public.orders
  where workspace_id = p_workspace_id
    and (p_brand_id is null or brand_id = p_brand_id)
    and deleted_at is null;
$$;

comment on function public.get_order_stats(uuid, uuid) is
  'Authoritative order KPI aggregation for the Orders page. 0043: added confirmed_count/needs_follow_up_count/repeated_order_count columns for the 3 new canonical statuses; delivered_revenue/today_delivered_revenue/delivery_success_rate now key off cash_collection_status=collected (the durable revenue signal) instead of a literal status=DELIVERED check, so an order that later advances to REPEATED_ORDER is never silently dropped from historical revenue; pending_revenue additionally excludes REPEATED_ORDER (a resolved, terminal status). The monetary fields remain zeroed unless the caller holds finance.view/analytics.view/reports.view via user_has_finance_visibility() (0023).';


-- ---------------------------------------------------------------
-- PART D — get_finance_summary() (0023 authoritative). Same
-- revenue-correctness fix as get_order_stats: delivered_scope keys off
-- cash_collection_status alone; pending_revenue/pending_orders
-- additionally exclude REPEATED_ORDER; rate_delivered_count uses the
-- same durable signal so delivery_success_rate/return_rate/
-- cancellation_rate stay internally consistent with delivered_agg.
-- ---------------------------------------------------------------
create or replace function public.get_finance_summary(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_sales_value numeric,
  total_orders bigint,
  delivered_revenue numeric,
  delivered_orders bigint,
  pending_revenue numeric,
  pending_orders bigint,
  returned_value numeric,
  returned_orders bigint,
  cancelled_value numeric,
  cancelled_orders bigint,
  average_order_value numeric,
  average_delivered_order_value numeric,
  cogs_delivered numeric,
  gross_profit numeric,
  gross_margin_pct numeric,
  delivery_success_rate numeric,
  return_rate numeric,
  cancellation_rate numeric,
  rate_delivered_count bigint,
  rate_returned_count bigint,
  rate_cancelled_count bigint,
  rate_eligible_count bigint,
  contribution_profit numeric,
  contribution_profit_orders_count bigint
)
language sql
stable
as $$
  with created_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  delivered_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and o.cash_collection_status = 'collected'
      and (p_date_from is null or o.delivered_at >= p_date_from)
      and (p_date_to is null or o.delivered_at <= p_date_to)
  ),
  returned_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and o.status = 'RETURNED'
      and (p_date_from is null or o.returned_at >= p_date_from)
      and (p_date_to is null or o.returned_at <= p_date_to)
  ),
  cancelled_scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and o.status = 'CANCELLED'
      and (p_date_from is null or o.cancelled_at >= p_date_from)
      and (p_date_to is null or o.cancelled_at <= p_date_to)
  ),
  agg as (
    select
      coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0) as total_sales_value,
      count(*) filter (where status <> 'CANCELLED') as total_orders,
      coalesce(sum(total_amount) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED', 'REPEATED_ORDER')), 0) as pending_revenue,
      count(*) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED', 'REPEATED_ORDER')) as pending_orders,
      count(*) filter (where cash_collection_status = 'collected') as rate_delivered_count,
      count(*) filter (where status = 'RETURNED') as rate_returned_count,
      count(*) filter (where status = 'CANCELLED') as rate_cancelled_count
    from created_scope
  ),
  delivered_agg as (
    select
      coalesce(sum(total_amount), 0) as delivered_revenue,
      count(*) as delivered_orders,
      coalesce(sum(cost_amount), 0) as cogs_delivered,
      coalesce(sum(total_amount - coalesce(cost_amount, 0) - actual_delivery_cost) filter (where actual_delivery_cost is not null), 0) as contribution_profit,
      count(*) filter (where actual_delivery_cost is not null) as contribution_profit_orders_count
    from delivered_scope
  ),
  returned_agg as (
    select coalesce(sum(total_amount), 0) as returned_value, count(*) as returned_orders from returned_scope
  ),
  cancelled_agg as (
    select coalesce(sum(total_amount), 0) as cancelled_value, count(*) as cancelled_orders from cancelled_scope
  )
  select
    agg.total_sales_value,
    agg.total_orders,
    delivered_agg.delivered_revenue,
    delivered_agg.delivered_orders,
    agg.pending_revenue,
    agg.pending_orders,
    returned_agg.returned_value,
    returned_agg.returned_orders,
    cancelled_agg.cancelled_value,
    cancelled_agg.cancelled_orders,
    case when agg.total_orders > 0 then round(agg.total_sales_value / agg.total_orders, 2) else 0 end,
    case when delivered_agg.delivered_orders > 0 then round(delivered_agg.delivered_revenue / delivered_agg.delivered_orders, 2) else 0 end,
    delivered_agg.cogs_delivered,
    delivered_agg.delivered_revenue - delivered_agg.cogs_delivered,
    case when delivered_agg.delivered_revenue > 0
      then round(100.0 * (delivered_agg.delivered_revenue - delivered_agg.cogs_delivered) / delivered_agg.delivered_revenue, 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_delivered_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_returned_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    case when (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count) > 0
      then round(100.0 * agg.rate_cancelled_count / (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count), 1)
      else 0 end,
    agg.rate_delivered_count,
    agg.rate_returned_count,
    agg.rate_cancelled_count,
    (agg.rate_delivered_count + agg.rate_returned_count + agg.rate_cancelled_count),
    delivered_agg.contribution_profit,
    delivered_agg.contribution_profit_orders_count
  from agg, delivered_agg, returned_agg, cancelled_agg;
$$;


-- ---------------------------------------------------------------
-- PART E — get_order_status_value_breakdown(): now genuinely lists
-- all 14 canonical statuses (0023 had 11 and explicitly excluded
-- "Repeated Order" by name — see this migration's header comment for
-- why that is now intentionally reversed). sort_order re-numbered to
-- reflect the fuller lifecycle; this is a pure display-order artifact
-- computed fresh per call, never stored, so renumbering is safe.
-- ---------------------------------------------------------------
create or replace function public.get_order_status_value_breakdown(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  status text,
  order_count bigint,
  order_value numeric
)
language sql
stable
as $$
  with statuses(status, sort_order) as (
    values
      ('NEW', 1), ('PENDING', 2), ('CONFIRMED', 3), ('WILL_CALL_BACK', 4), ('NEEDS_FOLLOW_UP', 5),
      ('SCHEDULED', 6), ('PROCESSING_FOR_DISPATCH', 7), ('DISPATCHED', 8), ('IN_TRANSIT', 9),
      ('PARTIALLY_DELIVERED', 10), ('DELIVERED', 11), ('RETURNED', 12), ('CANCELLED', 13),
      ('REPEATED_ORDER', 14)
  )
  select
    statuses.status,
    coalesce(count(o.id), 0),
    coalesce(sum(o.total_amount), 0)
  from statuses
  left join public.orders o
    on o.status = statuses.status
    and o.workspace_id = p_workspace_id
    and (p_brand_id is null or o.brand_id = p_brand_id)
    and o.deleted_at is null
    and public.user_has_finance_visibility(p_workspace_id)
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at <= p_date_to)
  group by statuses.status, statuses.sort_order
  order by statuses.sort_order;
$$;


-- ---------------------------------------------------------------
-- PART F — get_delivery_funnel_stats(): the pre-existing 'CONFIRMED'
-- funnel STAGE name (meaning "status <> NEW", a derived bucket that
-- predates this migration) is untouched — it still correctly includes
-- the real CONFIRMED status (which also satisfies status <> 'NEW').
-- The 'DISPATCHED' and 'DELIVERED' stages now also include
-- REPEATED_ORDER, since an order cannot reach REPEATED_ORDER without
-- having passed through both; 'CASH_COLLECTED' keys off
-- cash_collection_status alone for the same reason as PART C/D.
-- ---------------------------------------------------------------
create or replace function public.get_delivery_funnel_stats(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  stage text,
  order_count bigint,
  order_value numeric
)
language sql
stable
as $$
  with scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_finance_visibility(p_workspace_id)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  )
  select 'CREATED', count(*), coalesce(sum(total_amount), 0) from scope
  union all
  select 'CONFIRMED', count(*), coalesce(sum(total_amount), 0) from scope where status <> 'NEW'
  union all
  select 'DISPATCHED', count(*), coalesce(sum(total_amount), 0) from scope
    where status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED', 'RETURNED', 'REPEATED_ORDER')
  union all
  select 'DELIVERED', count(*), coalesce(sum(total_amount), 0) from scope where status in ('DELIVERED', 'REPEATED_ORDER')
  union all
  select 'CASH_COLLECTED', count(*), coalesce(sum(total_amount), 0) from scope
    where cash_collection_status = 'collected';
$$;


-- ---------------------------------------------------------------
-- PART G — get_order_daily_stats() (0036 authoritative). Same
-- durable-revenue-signal fix as PART C/D: delivered_sums drops the
-- redundant status='DELIVERED' half of the filter, keeping only
-- cash_collection_status='collected' (delivered_at, the day-bucketing
-- column, remains a stable historical timestamp regardless of any
-- later status change).
-- ---------------------------------------------------------------
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


-- ---------------------------------------------------------------
-- PART H — get_operations_summary() (0025 authoritative). Additive
-- only: 2 new count columns for CONFIRMED/NEEDS_FOLLOW_UP.
-- awaiting_confirmation_count keeps its exact prior definition
-- (NEW/PENDING/WILL_CALL_BACK) rather than being redefined around the
-- new CONFIRMED status, to avoid silently changing an existing
-- metric's meaning. Return shape changed, so drop first (see PART C).
-- ---------------------------------------------------------------
drop function if exists public.get_operations_summary(uuid, uuid);

create function public.get_operations_summary(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  awaiting_confirmation_count bigint,
  confirmed_count bigint,
  needs_follow_up_count bigint,
  scheduled_count bigint,
  processing_count bigint,
  dispatched_count bigint,
  in_transit_count bigint,
  partially_delivered_count bigint,
  returned_count bigint,
  failed_deliveries_count bigint,
  pending_cash_collection_count bigint,
  pending_cash_collection_amount numeric,
  settlement_exceptions_count bigint,
  settlement_outstanding_amount numeric
)
language sql
stable
as $$
  with scope as (
    select *
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and public.user_has_permission(p_workspace_id, 'operations.view')
  )
  select
    count(*) filter (where status in ('NEW', 'PENDING', 'WILL_CALL_BACK')),
    count(*) filter (where status = 'CONFIRMED'),
    count(*) filter (where status = 'NEEDS_FOLLOW_UP'),
    count(*) filter (where status = 'SCHEDULED'),
    count(*) filter (where status = 'PROCESSING_FOR_DISPATCH'),
    count(*) filter (where status = 'DISPATCHED'),
    count(*) filter (where status = 'IN_TRANSIT'),
    count(*) filter (where status = 'PARTIALLY_DELIVERED'),
    count(*) filter (where status = 'RETURNED'),
    count(*) filter (where status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and delivery_attempts_count > 0),
    count(*) filter (where status = 'DELIVERED' and cash_collection_status in ('pending', 'partial')),
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce(sum(total_amount - coalesce(cash_collected_amount, 0)) filter (where status = 'DELIVERED' and cash_collection_status in ('pending', 'partial')), 0)
      else 0 end,
    count(*) filter (where settlement_status = 'DISPUTED'),
    case when public.user_has_finance_visibility(p_workspace_id)
      then coalesce((
        select sum(s.discrepancy) from public.order_settlements s
        where s.order_id in (select id from scope) and s.status = 'DISPUTED'
      ), 0)
      else 0 end
  from scope;
$$;


-- ---------------------------------------------------------------
-- PART I — get_product_performance() (0023 authoritative). Same
-- durable-revenue-signal fix as PART C/D/G for delivered_revenue/
-- cogs_delivered/items_delivered/items_with_cost_data.
-- ---------------------------------------------------------------
create or replace function public.get_product_performance(
  p_workspace_id uuid,
  p_brand_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 50
)
returns table (
  product_id uuid,
  product_name text,
  sku text,
  orders_count bigint,
  units_sold bigint,
  sales_value numeric,
  delivered_revenue numeric,
  returned_orders bigint,
  cancelled_orders bigint,
  cancellation_rate numeric,
  stock_quantity integer,
  reserved_quantity integer,
  available_quantity integer,
  cogs_delivered numeric,
  gross_profit numeric,
  gross_margin_pct numeric,
  items_delivered bigint,
  items_with_cost_data bigint
)
language sql
stable
as $$
  with items as (
    select oi.*, o.status, o.cash_collection_status
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.workspace_id = p_workspace_id
      and (p_brand_id is null or oi.brand_id = p_brand_id)
      and o.deleted_at is null
      and oi.product_id is not null
      and public.user_has_finance_visibility(p_workspace_id)
      and (p_date_from is null or o.created_at >= p_date_from)
      and (p_date_to is null or o.created_at <= p_date_to)
  ),
  grouped as (
    select
      items.product_id,
      max(items.product_name) as product_name,
      max(items.sku) as sku,
      count(distinct items.order_id) as orders_count,
      coalesce(sum(items.quantity) filter (where items.status <> 'CANCELLED'), 0) as units_sold,
      coalesce(sum(items.total_amount) filter (where items.status <> 'CANCELLED'), 0) as sales_value,
      coalesce(sum(items.total_amount) filter (where items.cash_collection_status = 'collected'), 0) as delivered_revenue,
      count(distinct items.order_id) filter (where items.status = 'RETURNED') as returned_orders,
      count(distinct items.order_id) filter (where items.status = 'CANCELLED') as cancelled_orders,
      coalesce(sum(items.unit_cost * items.quantity) filter (where items.cash_collection_status = 'collected' and items.unit_cost is not null), 0) as cogs_delivered,
      count(*) filter (where items.cash_collection_status = 'collected') as items_delivered,
      count(*) filter (where items.cash_collection_status = 'collected' and items.unit_cost is not null) as items_with_cost_data
    from items
    group by items.product_id
  )
  select
    grouped.product_id,
    grouped.product_name,
    grouped.sku,
    grouped.orders_count,
    grouped.units_sold,
    grouped.sales_value,
    grouped.delivered_revenue,
    grouped.returned_orders,
    grouped.cancelled_orders,
    case when grouped.orders_count > 0 then round(100.0 * grouped.cancelled_orders / grouped.orders_count, 1) else 0 end,
    p.stock_quantity,
    p.reserved_quantity,
    p.available_quantity,
    grouped.cogs_delivered,
    grouped.delivered_revenue - grouped.cogs_delivered,
    case when grouped.delivered_revenue > 0
      then round(100.0 * (grouped.delivered_revenue - grouped.cogs_delivered) / grouped.delivered_revenue, 1)
      else 0 end,
    grouped.items_delivered,
    grouped.items_with_cost_data
  from grouped
  join public.products p on p.id = grouped.product_id
  order by grouped.delivered_revenue desc
  limit p_limit;
$$;


-- ---------------------------------------------------------------
-- PART J — resolve_assignment() (0038 authoritative). Every
-- occurrence of the "active/assignable order" exclusion list gains
-- REPEATED_ORDER — an order that has reached that resolved, terminal
-- status must not count toward a staff member's active-order capacity
-- or block a new assignment.
-- ---------------------------------------------------------------
create or replace function public.resolve_assignment(p_workspace_id uuid, p_brand_id uuid, p_module text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.assignment_rules%rowtype;
  v_required_permission text;
  v_candidate uuid;
begin
  -- Prefer a brand-specific active rule over a workspace-wide one.
  select * into v_rule from public.assignment_rules
  where workspace_id = p_workspace_id
    and module = p_module
    and is_active and deleted_at is null
    and (brand_id = p_brand_id or brand_id is null)
  order by brand_id nulls last
  limit 1;

  if not found or v_rule.strategy = 'manual' then
    return null;
  end if;

  v_required_permission := case p_module
    when 'orders' then 'orders.assign'
    when 'tasks' then 'tasks.assign'
    else null
  end;
  if v_required_permission is null then
    return null;
  end if;

  if v_rule.strategy = 'fixed' then
    -- Re-verify EVERY fixed staff member's live eligibility — a
    -- name in fixed_staff_ids from rule-creation time is never
    -- trusted blindly (Part 7).
    select ur.user_id into v_candidate
    from unnest(v_rule.fixed_staff_ids) as fixed(user_id)
    join public.user_roles ur on ur.user_id = fixed.user_id and ur.workspace_id = p_workspace_id
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
    left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
    where (ur.brand_id is null or ur.brand_id = p_brand_id)
      and coalesce(sas.is_available_for_assignment, true)
      and coalesce(sas.auto_assignment_enabled, true)
      and (p_module <> 'orders' or sas.max_active_orders is null or (
        select count(*) from public.orders oo
        where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
          and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and oo.deleted_at is null
      ) < sas.max_active_orders)
      and (v_rule.last_assigned_staff_id is null or fixed.user_id > v_rule.last_assigned_staff_id)
    group by ur.user_id
    order by ur.user_id
    limit 1;

    if v_candidate is null then
      -- Wrap around to the first eligible fixed staff member.
      select ur.user_id into v_candidate
      from unnest(v_rule.fixed_staff_ids) as fixed(user_id)
      join public.user_roles ur on ur.user_id = fixed.user_id and ur.workspace_id = p_workspace_id
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      where (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
        and (p_module <> 'orders' or sas.max_active_orders is null or (
          select count(*) from public.orders oo
          where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
            and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and oo.deleted_at is null
        ) < sas.max_active_orders)
      group by ur.user_id
      order by ur.user_id
      limit 1;
    end if;

  elsif v_rule.strategy = 'round_robin' then
    select ur.user_id into v_candidate
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
    left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
    where ur.workspace_id = p_workspace_id
      and (ur.brand_id is null or ur.brand_id = p_brand_id)
      and coalesce(sas.is_available_for_assignment, true)
      and coalesce(sas.auto_assignment_enabled, true)
      and (p_module <> 'orders' or sas.max_active_orders is null or (
        select count(*) from public.orders oo
        where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
          and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and oo.deleted_at is null
      ) < sas.max_active_orders)
      and (v_rule.last_assigned_staff_id is null or ur.user_id > v_rule.last_assigned_staff_id)
    group by ur.user_id
    order by ur.user_id
    limit 1;

    if v_candidate is null then
      select ur.user_id into v_candidate
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      where ur.workspace_id = p_workspace_id
        and (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
        and (p_module <> 'orders' or sas.max_active_orders is null or (
          select count(*) from public.orders oo
          where oo.assigned_to = ur.user_id and oo.workspace_id = p_workspace_id
            and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and oo.deleted_at is null
        ) < sas.max_active_orders)
      group by ur.user_id
      order by ur.user_id
      limit 1;
    end if;

  elsif v_rule.strategy = 'least_workload' then
    if p_module = 'orders' then
      select ur.user_id into v_candidate
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      left join public.orders o on o.assigned_to = ur.user_id and o.workspace_id = p_workspace_id
        and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and o.deleted_at is null
      where ur.workspace_id = p_workspace_id
        and (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
      group by ur.user_id, sas.max_active_orders, sas.last_assigned_at
      having sas.max_active_orders is null or count(o.id) < sas.max_active_orders
      order by count(o.id), coalesce(sas.last_assigned_at, 'epoch'::timestamptz), ur.user_id
      limit 1;
    else
      select ur.user_id into v_candidate
      from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions perm on perm.id = rp.permission_id and perm.slug = v_required_permission
      left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
      left join public.order_tasks t on t.assigned_to = ur.user_id and t.workspace_id = p_workspace_id
        and t.status not in ('COMPLETED', 'CANCELLED')
      where ur.workspace_id = p_workspace_id
        and (ur.brand_id is null or ur.brand_id = p_brand_id)
        and coalesce(sas.is_available_for_assignment, true)
        and coalesce(sas.auto_assignment_enabled, true)
      group by ur.user_id, sas.last_assigned_at
      order by count(t.id), coalesce(sas.last_assigned_at, 'epoch'::timestamptz), ur.user_id
      limit 1;
    end if;
  end if;

  if v_candidate is not null then
    if v_rule.strategy in ('round_robin', 'fixed') then
      update public.assignment_rules set last_assigned_staff_id = v_candidate where id = v_rule.id;
    end if;
    insert into public.staff_assignment_settings (workspace_id, user_id, last_assigned_at)
    values (p_workspace_id, v_candidate, now())
    on conflict (workspace_id, user_id) do update set last_assigned_at = excluded.last_assigned_at;
  end if;

  return v_candidate;
end;
$$;


-- ---------------------------------------------------------------
-- PART K — run_auto_assignment_sweep() (0038 authoritative). Same
-- REPEATED_ORDER addition to the claim query's terminal-status
-- exclusion.
-- ---------------------------------------------------------------
create or replace function public.run_auto_assignment_sweep(p_workspace_id uuid, p_brand_id uuid default null, p_limit integer default 20)
returns table (
  order_id uuid,
  order_number text,
  result text,
  assigned_to uuid,
  assignment_reason text,
  candidate_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_rule record;
  v_aging_minutes integer;
  v_candidate uuid;
  v_candidate_count integer;
  v_available_exists boolean;
  v_result text;
begin
  if not (public.user_has_permission(p_workspace_id, 'orders.assign') or public.user_has_permission(p_workspace_id, 'orders.manage')) then
    raise exception 'insufficient_permission: orders.assign required';
  end if;

  for v_order in
    select o.id, o.order_number, o.brand_id, o.created_at
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.assigned_to is null
      and o.status not in ('CANCELLED', 'DELIVERED', 'RETURNED', 'REPEATED_ORDER')
      and (o.last_auto_assignment_attempted_at is null or o.last_auto_assignment_attempted_at < now() - interval '2 minutes')
    order by o.created_at asc
    limit p_limit
    for update skip locked
  loop
    -- Same brand-specific-beats-workspace-wide precedence resolve_assignment() uses.
    select * into v_rule from public.assignment_rules
    where workspace_id = p_workspace_id and module = 'orders' and is_active and deleted_at is null
      and (brand_id = v_order.brand_id or brand_id is null)
    order by brand_id nulls last
    limit 1;

    if found and v_rule.strategy = 'manual' then
      update public.orders set last_auto_assignment_attempted_at = now(), last_auto_assignment_result = 'DISABLED_MANUAL_STRATEGY'
        where id = v_order.id;
      order_id := v_order.id; order_number := v_order.order_number; result := 'DISABLED_MANUAL_STRATEGY';
      assigned_to := null; assignment_reason := null; candidate_count := 0;
      return next;
      continue;
    end if;

    v_aging_minutes := coalesce(v_rule.aging_minutes, 20);
    if v_order.created_at > now() - (v_aging_minutes || ' minutes')::interval then
      -- Too young. Do not record an attempt — a real attempt should
      -- happen the moment it actually crosses the threshold, not be
      -- suppressed by this function's own retry cooldown.
      continue;
    end if;

    select count(distinct ur.user_id) into v_candidate_count
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = 'orders.assign'
    where ur.workspace_id = p_workspace_id
      and (ur.brand_id is null or ur.brand_id = v_order.brand_id);

    v_candidate := public.resolve_assignment(p_workspace_id, v_order.brand_id, 'orders');

    if v_candidate is not null then
      update public.orders
      set assigned_to = v_candidate,
          updated_by = null,
          assignment_source = 'AUTO',
          assignment_reason = coalesce(v_rule.strategy, 'least_workload') || ' — automatic assignment sweep',
          assignment_rule_id = v_rule.id,
          last_auto_assignment_attempted_at = now(),
          last_auto_assignment_result = 'ASSIGNED'
      where id = v_order.id;

      order_id := v_order.id; order_number := v_order.order_number; result := 'ASSIGNED';
      assigned_to := v_candidate; assignment_reason := coalesce(v_rule.strategy, 'least_workload'); candidate_count := v_candidate_count;
      return next;
    else
      if v_candidate_count = 0 then
        v_result := 'NO_PERMISSION_MATCH';
      else
        select exists (
          select 1
          from public.user_roles ur
          join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions perm on perm.id = rp.permission_id and perm.slug = 'orders.assign'
          left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = ur.user_id
          where ur.workspace_id = p_workspace_id
            and (ur.brand_id is null or ur.brand_id = v_order.brand_id)
            and coalesce(sas.is_available_for_assignment, true)
            and coalesce(sas.auto_assignment_enabled, true)
        ) into v_available_exists;

        v_result := case when not v_available_exists then 'NO_AVAILABLE_STAFF' else 'ALL_STAFF_AT_CAPACITY' end;
      end if;

      update public.orders set last_auto_assignment_attempted_at = now(), last_auto_assignment_result = v_result
        where id = v_order.id;

      order_id := v_order.id; order_number := v_order.order_number; result := v_result;
      assigned_to := null; assignment_reason := null; candidate_count := v_candidate_count;
      return next;
    end if;
  end loop;

  return;
end;
$$;


-- ---------------------------------------------------------------
-- PART L — get_workforce_ops_summary() (0038 authoritative). Same
-- REPEATED_ORDER addition to both terminal-status exclusion lists.
-- ---------------------------------------------------------------
create or replace function public.get_workforce_ops_summary(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  unassigned_count bigint,
  orders_aging_over_threshold_count bigint,
  orders_without_eligible_staff_count bigint,
  orders_assigned_today_count bigint,
  active_staff_count bigint,
  available_staff_count bigint,
  staff_at_capacity_count bigint,
  assignment_success_rate_24h numeric,
  avg_assignment_time_seconds_24h numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_aging_minutes integer;
begin
  if not public.user_has_permission(p_workspace_id, 'operations.view') then
    raise exception 'insufficient_permission: operations.view required';
  end if;

  select coalesce(
    (select ar.aging_minutes from public.assignment_rules ar
      where ar.workspace_id = p_workspace_id and ar.module = 'orders' and ar.is_active and ar.deleted_at is null
        and (ar.brand_id = p_brand_id or ar.brand_id is null)
      order by ar.brand_id nulls last limit 1),
    20
  ) into v_aging_minutes;

  return query
  with unassigned as (
    select o.id, o.created_at, o.last_auto_assignment_result
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.assigned_to is null
      and o.status not in ('CANCELLED', 'DELIVERED', 'RETURNED', 'REPEATED_ORDER')
  ),
  eligible_staff as (
    select distinct ur.user_id
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active' and pr.deleted_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions perm on perm.id = rp.permission_id and perm.slug = 'orders.assign'
    where ur.workspace_id = p_workspace_id
      and (p_brand_id is null or ur.brand_id is null or ur.brand_id = p_brand_id)
  ),
  staff_state as (
    select
      es.user_id,
      coalesce(sas.is_available_for_assignment, true) and coalesce(sas.auto_assignment_enabled, true) as is_available,
      sas.max_active_orders,
      (select count(*) from public.orders oo where oo.assigned_to = es.user_id and oo.workspace_id = p_workspace_id
        and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and oo.deleted_at is null) as active_count
    from eligible_staff es
    left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = es.user_id
  ),
  attempts_24h as (
    select o.last_auto_assignment_result, o.last_auto_assignment_attempted_at, o.created_at
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.last_auto_assignment_attempted_at is not null
      and o.last_auto_assignment_attempted_at >= now() - interval '24 hours'
  )
  select
    (select count(*) from unassigned),
    (select count(*) from unassigned where created_at <= now() - (v_aging_minutes || ' minutes')::interval),
    (select count(*) from unassigned where last_auto_assignment_result is not null and last_auto_assignment_result <> 'ASSIGNED'),
    (select count(*) from public.order_events ev
      where ev.workspace_id = p_workspace_id and (p_brand_id is null or ev.brand_id = p_brand_id)
        and ev.event_type = 'ASSIGNED' and (ev.metadata ->> 'assigned_to') is not null
        and ev.created_at >= date_trunc('day', now())),
    (select count(*) from staff_state),
    (select count(*) from staff_state where is_available and (max_active_orders is null or active_count < max_active_orders)),
    (select count(*) from staff_state where max_active_orders is not null and active_count >= max_active_orders),
    (select case when count(*) = 0 then null else
      round(count(*) filter (where last_auto_assignment_result = 'ASSIGNED')::numeric / count(*) * 100, 1)
     end from attempts_24h),
    (select case when count(*) filter (where last_auto_assignment_result = 'ASSIGNED') = 0 then null else
      round(avg(extract(epoch from (last_auto_assignment_attempted_at - created_at))) filter (where last_auto_assignment_result = 'ASSIGNED'), 0)
     end from attempts_24h);
end;
$$;


-- ---------------------------------------------------------------
-- PART M — get_workspace_staff() (0038 authoritative, was created via
-- drop+create since its return shape changed then; signature is
-- unchanged here so create or replace is safe). Same REPEATED_ORDER
-- addition to the active-order-count exclusion.
-- ---------------------------------------------------------------
create or replace function public.get_workspace_staff(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  department text,
  status text,
  last_login_at timestamptz,
  created_at timestamptz,
  role_names text[],
  role_slugs text[],
  is_available_for_assignment boolean,
  auto_assignment_enabled boolean,
  max_active_orders integer,
  active_order_count bigint
)
language sql
stable
as $$
  select
    p.id, p.email, p.first_name, p.last_name, p.phone, p.avatar_url, p.department, p.status,
    p.last_login_at, p.created_at,
    array_agg(distinct r.name order by r.name),
    array_agg(distinct r.slug order by r.slug),
    coalesce(bool_and(coalesce(sas.is_available_for_assignment, true)), true),
    coalesce(bool_and(coalesce(sas.auto_assignment_enabled, true)), true),
    max(sas.max_active_orders),
    (select count(*) from public.orders oo where oo.assigned_to = p.id and oo.workspace_id = p_workspace_id
      and oo.status not in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') and oo.deleted_at is null)
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  join public.roles r on r.id = ur.role_id
  left join public.staff_assignment_settings sas on sas.workspace_id = p_workspace_id and sas.user_id = p.id
  where ur.workspace_id = p_workspace_id
    and p.deleted_at is null
    and (public.user_has_permission(p_workspace_id, 'staff.view') or public.user_has_permission(p_workspace_id, 'staff.manage'))
  group by p.id, p.email, p.first_name, p.last_name, p.phone, p.avatar_url, p.department, p.status, p.last_login_at, p.created_at;
$$;


-- ---------------------------------------------------------------
-- PART N — record_delivery_attempt() (0029 authoritative). Two
-- changes: (1) REPEATED_ORDER added to the terminal-state guard, same
-- reasoning as DELIVERED/CANCELLED/RETURNED; (2) SCHEDULED added to
-- the "p_result=DELIVERED" eligible-source list — a direct, necessary
-- consequence of this migration's own new DISPATCHED -> SCHEDULED
-- transition (PART A): without this, an order legitimately sitting in
-- a post-dispatch SCHEDULED state would have no way to record a
-- successful delivery attempt against it.
-- ---------------------------------------------------------------
create or replace function public.record_delivery_attempt(
  p_order_id uuid,
  p_result text,
  p_waybill_id uuid default null,
  p_delivery_partner_id uuid default null,
  p_failure_reason text default null,
  p_notes text default null
)
returns public.delivery_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.delivery_attempts%rowtype;
  v_next_attempt integer;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'orders.update') or public.user_has_permission(v_order.workspace_id, 'orders.manage')) then
    raise exception 'insufficient_permission: orders.update required';
  end if;
  if p_result not in ('DELIVERED', 'CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS', 'RESCHEDULED', 'OTHER') then
    raise exception 'Unknown delivery attempt result %', p_result;
  end if;
  -- Fix (Phase 9, defect 2): a terminal order can never legitimately
  -- receive another delivery attempt — mirrors the same terminal-state
  -- guard update_waybill_status() already applies to waybills. 0043
  -- adds REPEATED_ORDER as a fourth terminal state.
  if v_order.status in ('DELIVERED', 'CANCELLED', 'RETURNED', 'REPEATED_ORDER') then
    raise exception 'Cannot record a delivery attempt against an order in terminal state %', v_order.status;
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_next_attempt from public.delivery_attempts where order_id = p_order_id;

  insert into public.delivery_attempts (
    workspace_id, brand_id, order_id, waybill_id, delivery_partner_id, attempt_number, result, failure_reason, notes, created_by
  ) values (
    v_order.workspace_id, v_order.brand_id, p_order_id, p_waybill_id, p_delivery_partner_id, v_next_attempt, p_result, p_failure_reason, p_notes, auth.uid()
  )
  returning * into v_attempt;

  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (
    p_order_id, v_order.workspace_id, v_order.brand_id, 'DELIVERY_ATTEMPT',
    'Delivery attempt #' || v_next_attempt || ': ' || p_result || coalesce(' — ' || p_failure_reason, ''),
    jsonb_build_object('attempt_id', v_attempt.id, 'attempt_number', v_next_attempt, 'result', p_result), auth.uid()
  );

  if p_result = 'DELIVERED' and v_order.status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'SCHEDULED') then
    update public.orders
      set status = 'DELIVERED', cash_collected_amount = 0, cash_collection_status = 'pending', updated_by = auth.uid()
      where id = p_order_id;
  elsif p_result <> 'DELIVERED' then
    if v_order.assigned_to is not null and v_order.assigned_to <> auth.uid() then
      insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
      values (
        v_order.workspace_id, v_order.brand_id, v_order.assigned_to, 'delivery_failed', 'Delivery attempt failed',
        'Order ' || v_order.order_number || ': ' || p_result, 'high', '/orders/' || p_order_id,
        jsonb_build_object('attempt_id', v_attempt.id)
      );
    end if;
  end if;

  return v_attempt;
end;
$$;

comment on function public.record_delivery_attempt(uuid, text, uuid, uuid, text, text) is
  'Records one physical delivery attempt against an order. Rejects any attempt against an order already in a terminal state (DELIVERED/CANCELLED/RETURNED/REPEATED_ORDER — 0043 added the fourth). A p_result=DELIVERED attempt is honored from DISPATCHED/IN_TRANSIT/PARTIALLY_DELIVERED/SCHEDULED (0043 added SCHEDULED, now reachable post-dispatch). attempt_number remains server-computed, never client-supplied.';
