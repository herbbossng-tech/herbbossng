-- ============================================================
-- GOLDEN COMMERCE OS — Order Operations OS, Phase 1 (0016)
-- Order triggers: transition guard, timeline events, inventory
-- side-effects, audit logging.
-- ============================================================

-- ---------------------------------------------------------------
-- BEFORE UPDATE: the only gate a status change has to pass through,
-- regardless of whether it comes from the app, a future edge
-- function, or someone in the SQL console. Mirrors
-- guard_product_stock_columns' role for inventory.
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

create trigger guard_orders_status_transition
  before update on public.orders
  for each row execute function public.guard_order_status_transition();


-- ---------------------------------------------------------------
-- AFTER INSERT/UPDATE: the operational timeline. SECURITY DEFINER
-- because order_events has no client insert policy — every row here
-- is trigger-written, by design.
-- ---------------------------------------------------------------
create or replace function public.log_order_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added text[];
  v_removed text[];
  v_tag_description text;
begin
  if TG_OP = 'INSERT' then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, to_status, description, created_by)
    values (new.id, new.workspace_id, new.brand_id, 'ORDER_CREATED', new.status, 'Order created', new.created_by);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, from_status, to_status, description, created_by)
    values (
      new.id, new.workspace_id, new.brand_id, 'STATUS_CHANGED', old.status, new.status,
      'Status changed from ' || old.status || ' to ' || new.status, new.updated_by
    );
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
    values (
      new.id, new.workspace_id, new.brand_id, 'ASSIGNED',
      case when new.assigned_to is null then 'Order unassigned' else 'Order assigned' end,
      jsonb_build_object('assigned_to', new.assigned_to), new.updated_by
    );
  end if;

  if new.tags is distinct from old.tags then
    v_added := array(select unnest(new.tags) except select unnest(old.tags));
    v_removed := array(select unnest(old.tags) except select unnest(new.tags));
    if coalesce(array_length(v_added, 1), 0) > 0 or coalesce(array_length(v_removed, 1), 0) > 0 then
      v_tag_description := trim(both ', ' from
        (case when coalesce(array_length(v_added, 1), 0) > 0 then 'Added: ' || array_to_string(v_added, ', ') || '. ' else '' end) ||
        (case when coalesce(array_length(v_removed, 1), 0) > 0 then 'Removed: ' || array_to_string(v_removed, ', ') else '' end)
      );
      insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
      values (
        new.id, new.workspace_id, new.brand_id, 'TAGS_UPDATED', v_tag_description,
        jsonb_build_object('added', v_added, 'removed', v_removed), new.updated_by
      );
    end if;
  end if;

  if new.cash_collection_status is distinct from old.cash_collection_status and new.cash_collection_status = 'collected' then
    insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
    values (
      new.id, new.workspace_id, new.brand_id, 'CASH_COLLECTED',
      'Cash collected: ' || new.cash_collected_amount,
      jsonb_build_object('amount', new.cash_collected_amount), new.updated_by
    );
  end if;

  return new;
end;
$$;

create trigger log_orders_events
  after insert or update on public.orders
  for each row execute function public.log_order_event();


create or replace function public.log_order_note_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_events (order_id, workspace_id, brand_id, event_type, description, metadata, created_by)
  values (new.order_id, new.workspace_id, new.brand_id, 'NOTE_ADDED', left(new.body, 140), jsonb_build_object('note_id', new.id), new.created_by);
  return new;
end;
$$;

create trigger log_order_note_events
  after insert on public.order_notes
  for each row execute function public.log_order_note_event();


-- ---------------------------------------------------------------
-- AFTER UPDATE: convert order status changes into real inventory
-- movements through the existing adjust_inventory() gateway — never
-- a direct products write.
-- ---------------------------------------------------------------
create or replace function public.handle_order_inventory_effects()
returns trigger
language plpgsql
as $$
declare
  v_item record;
  v_type text;
begin
  if new.status is distinct from old.status then
    if new.status = 'CANCELLED' then
      v_type := 'RELEASED';
    elsif new.status = 'RETURNED' then
      -- RETURNED only fires from DISPATCHED/IN_TRANSIT/PARTIALLY_DELIVERED
      -- (see order_status_transitions) — this order never reached
      -- DELIVERED, so nothing was marked SOLD yet. Releasing the
      -- reservation is the correct accounting, not a stock-in movement.
      v_type := 'RELEASED';
    elsif new.status = 'DELIVERED' then
      v_type := 'SOLD';
    else
      return new;
    end if;

    for v_item in
      select oi.product_id, oi.quantity
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = new.id and oi.product_id is not null and p.track_inventory
    loop
      perform public.adjust_inventory(
        v_item.product_id, v_type, v_item.quantity,
        'Order ' || new.order_number || ' -> ' || new.status,
        'order', new.id
      );
    end loop;
  end if;

  return new;
end;
$$;

create trigger orders_inventory_effects
  after update on public.orders
  for each row execute function public.handle_order_inventory_effects();


-- Reuse the existing generic audit trigger from the products/inventory
-- phase — orders/order_items/order_notes already carry workspace_id,
-- brand_id and id, which is all it needs.
create trigger audit_orders
  after insert or update or delete on public.orders
  for each row execute function public.log_audit_event('orders');

create trigger audit_order_items
  after insert on public.order_items
  for each row execute function public.log_audit_event('orders');

create trigger audit_order_notes
  after insert on public.order_notes
  for each row execute function public.log_audit_event('orders');
