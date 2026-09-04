-- ============================================================
-- GCOS PHASE 9 — Production Certification, Cross-System Integrity
-- & Adversarial Hardening (0029)
--
-- This is a certification/hardening pass, not a feature phase.
-- Every function in this codebase (0001-0028) was inspected before
-- writing anything here (see the Phase 9 engineering report for the
-- full audit). The overwhelming majority of the system's
-- money/inventory/attribution invariants were found to already be
-- correctly enforced — those are proven with regression tests
-- (109/110/111_gcos_*), not touched here. This migration contains
-- ONLY the two genuine, narrowly-scoped defects that inspection (and
-- targeted testing) actually found. Both are surgical CREATE OR
-- REPLACE fixes to existing functions — no new tables, no business
-- rule changes, no schema redesign.
--
-- DEFECT 1 — duplicate settlement (release blocker per the Phase 9
-- brief's own policy, section 33). create_order_settlement() (0025)
-- had no protection at all against being called twice for the same
-- order: no unique constraint on order_settlements.order_id, no
-- existence check in the function body. The frontend's own "Record"
-- button (OrderDetailPage.tsx) stays visible and enabled for as long
-- as cash_collection_status is 'collected'/'partial', with no check
-- for whether a settlement already exists — so a double-click, or a
-- direct RPC replay, creates two independent order_settlements rows
-- for the same order, each snapshotting the same order fields. This
-- is NOT simply "block calling it twice" — order_settlements is a
-- genuine ledger of progressive/partial remittances (a courier may
-- legitimately remit part of the cash today and the rest next week),
-- so multiple rows per order over time are correct, intentional
-- design (see the table's own 0025 comment: "Delivered -> Cash
-- Collected -> Amount Expected -> Amount Remitted -> Outstanding").
-- The fix therefore does NOT make settlement single-only; it closes
-- exactly the two states that are never legitimate:
--   (a) calling it again after the order is already fully SETTLED —
--       there is no more money owed, so a further call is either a
--       mistake or a duplicate submission, never a real remittance;
--   (b) an exact-duplicate resubmission (same remitted_amount AND
--       same delivery_fee as the immediately-preceding still-open
--       row) — the double-click case — which is now a safe idempotent
--       no-op returning the existing row, exactly mirroring the
--       idempotency pattern create_order()/process_affiliate_
--       commission() already use elsewhere in this codebase.
-- A genuinely new/different remittance amount against a
-- PENDING/PARTIALLY_SETTLED/DISPUTED order still creates a new row,
-- unchanged from before.
--
-- DEFECT 2 — delivery attempt recorded after an order has already
-- reached a terminal lifecycle state (DELIVERED/CANCELLED/RETURNED),
-- explicitly named in the Phase 9 brief (section 9: "delivery attempt
-- created after final return"). record_delivery_attempt() (0025)
-- validated permission and the result enum, but never checked the
-- order's own current status — every OTHER terminal-state-adjacent
-- write path in this codebase already guards this exact class of bug
-- (update_waybill_status() rejects a transition once the waybill
-- itself is terminal; guard_order_status_transition() rejects any
-- transition not in order_status_transitions; mark_affiliate_
-- withdrawal_paid() only matches from APPROVED). This was the one
-- place missing the equivalent guard. Fixed by adding the same
-- terminal-state check used elsewhere, phrased against the order's
-- own three terminal statuses.
-- ============================================================


-- ---------------------------------------------------------------
-- DEFECT 3 fix — order_status_transitions is missing the
-- (DISPATCHED, DELIVERED) edge that record_delivery_attempt() (0025)
-- itself already assumes exists. That function's own DELIVERED
-- branch reads: "if p_result = 'DELIVERED' and v_order.status in
-- ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED') then update
-- orders set status = 'DELIVERED' ..." — but the seed data in 0013
-- only ever defined (IN_TRANSIT, DELIVERED) and (PARTIALLY_DELIVERED,
-- DELIVERED) as legal transitions, never (DISPATCHED, DELIVERED).
-- Found by testing: a courier's very first delivery attempt recorded
-- while the order is still DISPATCHED (a completely ordinary, common
-- real-world sequence — many deliveries never get an explicit
-- "in transit" update before the courier reports success) causes the
-- guarded UPDATE inside record_delivery_attempt() to raise "Invalid
-- order status transition: DISPATCHED -> DELIVERED", and since that
-- function has no exception handler, the WHOLE call rolls back —
-- losing not just the status update but the delivery_attempts row and
-- order_events entry that had already been inserted moments earlier.
-- This is a gap between two pieces of code written together in the
-- same migration that disagreed about a legal transition, not a
-- deliberate business-rule choice — the fix is the one missing row,
-- nothing else. requires_approval=true, matching every other
-- transition into DELIVERED in this table.
-- ---------------------------------------------------------------
insert into public.order_status_transitions (from_status, to_status, requires_approval)
values ('DISPATCHED', 'DELIVERED', true)
on conflict (from_status, to_status) do nothing;


-- ---------------------------------------------------------------
-- DEFECT 1 fix — create_order_settlement(). Byte-identical to the
-- 0025 original except the two guard blocks inserted right after the
-- existing cash_collection_status check (marked below), before any
-- computation happens.
-- ---------------------------------------------------------------
create or replace function public.create_order_settlement(
  p_order_id uuid,
  p_remitted_amount numeric,
  p_delivery_fee numeric default 0,
  p_note text default null
)
returns public.order_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_settlement public.order_settlements%rowtype;
  v_status text;
  v_latest public.order_settlements%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if not (public.user_has_permission(v_order.workspace_id, 'settlement.manage')) then
    raise exception 'insufficient_permission: settlement.manage required';
  end if;
  if v_order.cash_collection_status not in ('collected', 'partial') then
    raise exception 'Cannot settle an order with no cash collected (cash_collection_status = %)', v_order.cash_collection_status;
  end if;
  if p_remitted_amount is null or p_remitted_amount < 0 then
    raise exception 'remitted amount must be zero or positive';
  end if;

  -- Fix (Phase 9, defect 1), two independent guards. Deliberately NOT
  -- based on "the most recent row by created_at" — multiple
  -- settlements legitimately created within the same transaction (or
  -- simply the same wall-clock instant) share an identical now()
  -- timestamp, making "latest" ambiguous; both guards below are
  -- ambiguity-proof by construction instead.
  --
  -- (a) Once ANY settlement row for this order is SETTLED, the order
  -- owes nothing further — reject every subsequent call outright,
  -- regardless of insertion order.
  if exists (select 1 from public.order_settlements where order_id = p_order_id and status = 'SETTLED') then
    raise exception 'Order % is already fully settled — no further remittance is owed', v_order.order_number;
  end if;

  -- (b) An exact-duplicate resubmission (double-click / retry) — same
  -- remitted_amount and delivery_fee as an already-recorded row for
  -- this order — is a safe idempotent no-op returning that row,
  -- rather than a second identical ledger entry. A genuinely
  -- different amount (real progressive remittance) still falls
  -- through to create a new row below.
  select * into v_latest from public.order_settlements
    where order_id = p_order_id
      and remitted_amount = p_remitted_amount
      and delivery_fee = coalesce(p_delivery_fee, 0)
    order by created_at desc
    limit 1;
  if found then
    return v_latest;
  end if;

  v_status := case
    when p_remitted_amount >= (v_order.cash_collected_amount - coalesce(p_delivery_fee, 0)) then 'SETTLED'
    when p_remitted_amount > 0 then 'PARTIALLY_SETTLED'
    else 'PENDING'
  end;

  insert into public.order_settlements (
    workspace_id, brand_id, order_id, expected_amount, collected_amount, delivery_fee, remitted_amount,
    status, settled_at, settled_by, notes, created_by
  ) values (
    v_order.workspace_id, v_order.brand_id, p_order_id, v_order.total_amount, v_order.cash_collected_amount, coalesce(p_delivery_fee, 0), p_remitted_amount,
    v_status, case when v_status = 'SETTLED' then now() else null end, case when v_status = 'SETTLED' then auth.uid() else null end, p_note, auth.uid()
  )
  returning * into v_settlement;

  if v_settlement.discrepancy <> 0 then
    insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
    values (
      v_order.workspace_id, v_order.brand_id, null, 'settlement_discrepancy', 'Settlement discrepancy',
      'Order ' || v_order.order_number || ' has a settlement discrepancy of ' || v_settlement.discrepancy,
      'high', '/orders/' || p_order_id, jsonb_build_object('settlement_id', v_settlement.id)
    );
  end if;

  return v_settlement;
end;
$$;

comment on function public.create_order_settlement(uuid, numeric, numeric, text) is
  'Operational cash-reconciliation ledger write path. Multiple rows per order over time are correct (progressive/partial remittance), so this is NOT single-call-only — but (Phase 9 fix) a call against an order whose latest settlement is already SETTLED is rejected, and a call whose remitted_amount/delivery_fee exactly match the latest still-open row is a safe idempotent no-op, closing the duplicate-settlement gap without changing the legitimate multi-remittance business rule.';


-- ---------------------------------------------------------------
-- DEFECT 2 fix — record_delivery_attempt(). Byte-identical to the
-- 0025 original except the one guard line inserted right after the
-- existing p_result enum check, before attempt_number is computed.
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
  -- Fix (Phase 9, defect 2): a terminal order (DELIVERED/CANCELLED/
  -- RETURNED) can never legitimately receive another delivery
  -- attempt — mirrors the same terminal-state guard update_waybill_
  -- status() already applies to waybills.
  if v_order.status in ('DELIVERED', 'CANCELLED', 'RETURNED') then
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

  if p_result = 'DELIVERED' and v_order.status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED') then
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
  'Records one physical delivery attempt against an order. (Phase 9 fix) Rejects any attempt against an order already in a terminal state (DELIVERED/CANCELLED/RETURNED) — a returned or cancelled order can never receive a further delivery attempt. attempt_number remains server-computed, never client-supplied.';
