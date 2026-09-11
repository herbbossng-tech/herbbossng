-- ============================================================
-- GOLDEN COMMERCE OS — Order Operations OS, Phase 1 (0018)
-- RLS for orders, order_items, order_events, order_notes,
-- order_number_counters, order_status_transitions.
-- ============================================================

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.order_notes enable row level security;
alter table public.order_number_counters enable row level security;
alter table public.order_status_transitions enable row level security;

-- Reference data: every authenticated user can see which transitions
-- are legal, so the frontend can build the status-change UI from it
-- rather than hardcoding the state machine twice.
create policy "read_order_status_transitions" on public.order_status_transitions
  for select to authenticated using (true);

-- order_number_counters gets zero policies — inaccessible to the
-- `authenticated` role entirely, by design. Only generate_order_number()
-- (SECURITY DEFINER) ever touches it.

-- ---------------------------------------------------------------
-- orders — select/update via RLS. Deliberately NO insert policy:
-- the only way to create an order is public.create_order(), which
-- runs SECURITY DEFINER and bypasses RLS. A raw client INSERT is
-- rejected outright, which is what makes price-tampering structurally
-- impossible, not just discouraged.
-- ---------------------------------------------------------------
create policy "select_orders" on public.orders
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'orders.view')
  );

create policy "update_orders" on public.orders
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'orders.update') or public.user_has_permission(workspace_id, 'orders.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'orders.update') or public.user_has_permission(workspace_id, 'orders.manage'))
  );

-- ---------------------------------------------------------------
-- order_items — select only. Written exclusively by create_order();
-- no client insert/update/delete policy at all, which is what makes
-- the historical price snapshot genuinely immutable, not just
-- convention.
-- ---------------------------------------------------------------
create policy "select_order_items" on public.order_items
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'orders.view')
  );

-- ---------------------------------------------------------------
-- order_events — select only. Written exclusively by triggers.
-- ---------------------------------------------------------------
create policy "select_order_events" on public.order_events
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'orders.view')
  );

-- ---------------------------------------------------------------
-- order_notes — select + insert (adding a note is gated the same as
-- editing an order). No update/delete: notes are append-only.
-- ---------------------------------------------------------------
create policy "select_order_notes" on public.order_notes
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'orders.view')
  );

create policy "insert_order_notes" on public.order_notes
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'orders.update') or public.user_has_permission(workspace_id, 'orders.manage'))
  );
