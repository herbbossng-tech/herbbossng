-- ============================================================
-- STAFF OPERATIONS DASHBOARD / MY WORK CONSOLE (0037)
--
-- AUDIT-FIRST FINDINGS (inspected before writing anything below):
--
--   * orders.assigned_to (0013) is the existing assignment column;
--     order_tasks.assigned_to (0025) the existing follow-up-task
--     assignment column. Both already index (assigned_to) partially.
--   * support_interactions (0030) is ALREADY the exact typed,
--     outcome-tracked customer-interaction/follow-up-note model this
--     brief asks for (order_id, customer_id, created_by, created_at,
--     interaction_type, outcome, summary, related_task_id linking to
--     order_tasks). create_support_interaction() already writes a
--     SUPPORT_INTERACTION_LOGGED row into order_events, so the
--     existing order timeline (order_events, fed by triggers across
--     0016/0025/0028/0029/0030/0032/0034) already carries system
--     events, status changes, assignment changes, note additions,
--     interaction summaries, cash collection and automation/
--     communication events in one place — no new notes table, no new
--     timeline table, no new interaction table needed.
--   * order_tasks (0025) is already the exact follow-up-scheduling
--     model (due_at, assigned_to, priority, status) with a
--     tasks_assigned notification already sent on assignment.
--   * The ONLY genuine gaps found:
--       1. Nothing computes a PER-STAFF ("assigned to me") view of
--          any of the above — every existing RPC (get_order_stats,
--          get_task_stats, get_support_summary/queue) is workspace-
--          wide. Section 2's rule ("Staff A must not see Staff B's
--          assigned orders", enforced at the RPC layer, not React)
--          requires new, narrowly-scoped functions.
--       2. Order (re)assignment (orders.assigned_to, a direct client
--          UPDATE gated by the existing orders.update/manage RLS) had
--          no notification — unlike order_tasks' assign_order_task(),
--          which already notifies. Task assignment was already right;
--          order assignment was the gap.
--       3. support_interactions was never added to the
--          supabase_realtime publication (orders/order_tasks were,
--          in 0032), so a newly logged interaction couldn't update a
--          live dashboard.
--
-- Nothing here duplicates orders.view/tasks.view/support.view or the
-- existing RLS boundary on orders/order_tasks/support_interactions —
-- every new function below is SECURITY DEFINER but hard-scopes every
-- query to assigned_to = auth.uid() internally, ignoring any
-- client-supplied staff id (there is none to supply), so no caller —
-- regardless of how broad their orders.view/tasks.view grant is —
-- can ever pull another staff member's assigned records through
-- these specific functions.
-- ============================================================

-- ============================================================
-- PART A — notify on order (re)assignment. Extends log_order_event()
-- (0016) with the exact notification pattern assign_order_task()
-- (0025) already uses for tasks — same notifications table, same
-- shape, nothing new invented. Fires regardless of whether the
-- update went through a future RPC or (today's reality) a direct
-- client UPDATE on orders, because it lives in the trigger, not in
-- application code.
-- ============================================================
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

    -- New assignee: "New order assigned to you" — never notify someone
    -- assigning the order to themselves.
    if new.assigned_to is not null and new.assigned_to is distinct from new.updated_by then
      insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
      values (
        new.workspace_id, new.brand_id, new.assigned_to, 'order_assigned', 'New order assigned to you',
        'Order ' || new.order_number || ' (' || new.customer_name || ') was assigned to you.',
        case when new.priority in ('high', 'urgent') then new.priority else 'normal' end,
        '/orders/' || new.id, jsonb_build_object('order_id', new.id)
      );
    end if;

    -- Previous assignee: "Order reassigned away from you" — only when
    -- handed to someone else (not simply unassigned to nobody, and
    -- never when the actor is reassigning their own order away).
    if old.assigned_to is not null and old.assigned_to is distinct from new.assigned_to
       and new.assigned_to is not null and old.assigned_to is distinct from new.updated_by then
      insert into public.notifications (workspace_id, brand_id, user_id, type, title, message, priority, link, metadata)
      values (
        new.workspace_id, new.brand_id, old.assigned_to, 'order_reassigned', 'Order reassigned away from you',
        'Order ' || new.order_number || ' (' || new.customer_name || ') was reassigned to another staff member.',
        'normal', '/orders/' || new.id, jsonb_build_object('order_id', new.id)
      );
    end if;
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

comment on function public.log_order_event() is
  'Order timeline + assignment-notification trigger. Extended in 0037 to notify on order (re)assignment (order_assigned/order_reassigned), mirroring assign_order_task()''s existing task_assigned notification — order assignment previously had none. Everything else unchanged from 0016.';


-- ============================================================
-- PART B — get_my_work_summary(): per-status counts for orders
-- assigned to the CALLER ONLY. UI-category mapping documented per
-- field below; reuses the existing canonical status lifecycle
-- (0013) rather than inventing a parallel one.
-- ============================================================
create or replace function public.get_my_work_summary(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  assigned_to_me_count bigint,
  new_count bigint,                 -- status = NEW
  pending_confirmation_count bigint,-- status in (PENDING, WILL_CALL_BACK)
  confirmed_count bigint,           -- status in (SCHEDULED, PROCESSING_FOR_DISPATCH)
  follow_up_required_count bigint,  -- WILL_CALL_BACK, or has an open task assigned to me
  out_for_delivery_count bigint,    -- status in (DISPATCHED, IN_TRANSIT, PARTIALLY_DELIVERED)
  delivered_count bigint,
  cancelled_count bigint,
  returned_count bigint,
  overdue_follow_ups_count bigint,      -- my open tasks past due
  due_today_follow_ups_count bigint,    -- my open tasks due today
  oldest_pending_since timestamptz      -- oldest NEW/PENDING/WILL_CALL_BACK order assigned to me
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'insufficient_permission: must be signed in';
  end if;
  if not public.user_has_permission(p_workspace_id, 'orders.view') then
    raise exception 'insufficient_permission: orders.view required';
  end if;

  return query
  with my_orders as (
    select o.id, o.status, o.created_at
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.assigned_to = v_uid
  ),
  my_open_tasks as (
    select t.id, t.due_at
    from public.order_tasks t
    where t.workspace_id = p_workspace_id
      and (p_brand_id is null or t.brand_id = p_brand_id)
      and t.assigned_to = v_uid
      and t.status in ('OPEN', 'IN_PROGRESS')
  )
  select
    count(*),
    count(*) filter (where status = 'NEW'),
    count(*) filter (where status in ('PENDING', 'WILL_CALL_BACK')),
    count(*) filter (where status in ('SCHEDULED', 'PROCESSING_FOR_DISPATCH')),
    count(*) filter (where status = 'WILL_CALL_BACK' or exists (
      select 1 from public.order_tasks t
      where t.order_id = my_orders.id and t.assigned_to = v_uid and t.status in ('OPEN', 'IN_PROGRESS')
    )),
    count(*) filter (where status in ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED')),
    count(*) filter (where status = 'DELIVERED'),
    count(*) filter (where status = 'CANCELLED'),
    count(*) filter (where status = 'RETURNED'),
    (select count(*) from my_open_tasks where due_at is not null and due_at < now()),
    (select count(*) from my_open_tasks where due_at is not null and due_at >= date_trunc('day', now()) and due_at < date_trunc('day', now()) + interval '1 day'),
    (select min(created_at) from my_orders where status in ('NEW', 'PENDING', 'WILL_CALL_BACK'))
  from my_orders;
end;
$$;

comment on function public.get_my_work_summary(uuid, uuid) is
  'Per-staff "My Work" card counts — hard-scoped to assigned_to = auth.uid() regardless of the caller''s broader orders.view/tasks.view grant. Card-to-status mapping: New=NEW; Pending Confirmation=PENDING+WILL_CALL_BACK; Confirmed=SCHEDULED+PROCESSING_FOR_DISPATCH; Follow-Up Required=WILL_CALL_BACK or has an open task assigned to caller; Out for Delivery=DISPATCHED+IN_TRANSIT+PARTIALLY_DELIVERED; Delivered/Cancelled/Returned map 1:1. Never a second revenue/status formula — reuses the exact lifecycle from get_order_stats() (0025).';


-- ============================================================
-- PART C — get_my_priority_queue(): "Today's Work" — orders
-- assigned to the caller that need action right now, grouped by
-- reason. An order can legitimately appear under more than one
-- group (e.g. both overdue AND not yet contacted); the frontend
-- renders one section per group.
-- ============================================================
create or replace function public.get_my_priority_queue(p_workspace_id uuid, p_brand_id uuid default null, p_limit integer default 30)
returns table (
  queue_group text,
  order_id uuid,
  order_number text,
  customer_name text,
  customer_phone text,
  product_summary text,
  total_amount numeric,
  customer_city text,
  customer_state text,
  status text,
  priority text,
  last_interaction_at timestamptz,
  last_interaction_summary text,
  next_follow_up_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_can_view_support boolean;
begin
  if v_uid is null then
    raise exception 'insufficient_permission: must be signed in';
  end if;
  if not public.user_has_permission(p_workspace_id, 'orders.view') then
    raise exception 'insufficient_permission: orders.view required';
  end if;
  -- Interaction summaries are gated by support.view separately from
  -- orders.view — mirrors the existing Order Detail Support panel's
  -- own visibility boundary (canViewSupport), not a new one.
  v_can_view_support := public.user_has_permission(p_workspace_id, 'support.view');

  return query
  with base as (
    select o.id, o.order_number, o.customer_name, o.customer_phone, o.total_amount,
      o.customer_city, o.customer_state, o.status, o.priority, o.updated_at
    from public.orders o
    where o.workspace_id = p_workspace_id
      and (p_brand_id is null or o.brand_id = p_brand_id)
      and o.deleted_at is null
      and o.assigned_to = v_uid
  ),
  enriched as (
    select
      b.id, b.order_number, b.customer_name, b.customer_phone,
      (select string_agg(oi.product_name, ', ' order by oi.created_at) from public.order_items oi where oi.order_id = b.id) as product_summary,
      b.total_amount, b.customer_city, b.customer_state, b.status, b.priority,
      case when v_can_view_support then
        (select si.created_at from public.support_interactions si where si.order_id = b.id order by si.created_at desc limit 1)
      end as last_interaction_at,
      case when v_can_view_support then
        (select si.summary from public.support_interactions si where si.order_id = b.id order by si.created_at desc limit 1)
      end as last_interaction_summary,
      case when v_can_view_support then
        (select si.outcome from public.support_interactions si where si.order_id = b.id order by si.created_at desc limit 1)
      end as last_interaction_outcome,
      (select t.due_at from public.order_tasks t where t.order_id = b.id and t.assigned_to = v_uid and t.status in ('OPEN', 'IN_PROGRESS') order by t.due_at asc nulls last limit 1) as next_follow_up_at,
      b.updated_at
    from base b
  ),
  grouped as (
    select 'OVERDUE_FOLLOW_UP'::text as queue_group, e.* from enriched e
      where e.next_follow_up_at is not null and e.next_follow_up_at < now()
    union all
    select 'DUE_TODAY'::text, e.* from enriched e
      where e.next_follow_up_at is not null and e.next_follow_up_at >= date_trunc('day', now()) and e.next_follow_up_at < date_trunc('day', now()) + interval '1 day'
    union all
    select 'AWAITING_CONFIRMATION'::text, e.* from enriched e
      where e.status in ('PENDING', 'WILL_CALL_BACK')
    union all
    select 'NOT_YET_CONTACTED'::text, e.* from enriched e
      where e.status = 'NEW' and e.last_interaction_at is null
    union all
    select 'MISSED_CONTACT'::text, e.* from enriched e
      where e.last_interaction_outcome = 'NO_ANSWER' and e.status not in ('DELIVERED', 'CANCELLED', 'RETURNED')
    union all
    select 'RECENTLY_ASSIGNED'::text, e.* from enriched e
      where exists (
        select 1 from public.order_events ev
        where ev.order_id = e.id and ev.event_type = 'ASSIGNED'
          and (ev.metadata ->> 'assigned_to') = v_uid::text
          and ev.created_at > now() - interval '24 hours'
      )
  )
  select
    grouped.queue_group, grouped.id, grouped.order_number, grouped.customer_name, grouped.customer_phone,
    grouped.product_summary, grouped.total_amount, grouped.customer_city, grouped.customer_state,
    grouped.status, grouped.priority, grouped.last_interaction_at, grouped.last_interaction_summary,
    grouped.next_follow_up_at, grouped.updated_at
  from grouped
  order by
    case grouped.queue_group
      when 'OVERDUE_FOLLOW_UP' then 1
      when 'DUE_TODAY' then 2
      when 'AWAITING_CONFIRMATION' then 3
      when 'NOT_YET_CONTACTED' then 4
      when 'MISSED_CONTACT' then 5
      when 'RECENTLY_ASSIGNED' then 6
      else 7
    end,
    (grouped.priority = 'urgent') desc,
    (grouped.priority = 'high') desc,
    coalesce(grouped.next_follow_up_at, grouped.updated_at) asc
  limit p_limit;
end;
$$;

comment on function public.get_my_priority_queue(uuid, uuid, integer) is
  'Today''s Work / priority queue for the caller''s own assigned orders. Hard-scoped to assigned_to = auth.uid(); interaction fields additionally respect support.view (null, not fabricated, when the caller lacks it). An order may appear in multiple groups by design — each group answers a different "why does this need attention" question.';


-- ============================================================
-- PART D — get_my_recent_orders(): plain recent-activity list for
-- the caller's own assigned orders, enriched the same way as the
-- priority queue (shared visibility rules).
-- ============================================================
create or replace function public.get_my_recent_orders(p_workspace_id uuid, p_brand_id uuid default null, p_limit integer default 50)
returns table (
  order_id uuid,
  order_number text,
  customer_name text,
  customer_phone text,
  product_summary text,
  total_amount numeric,
  customer_city text,
  customer_state text,
  status text,
  last_interaction_at timestamptz,
  last_interaction_summary text,
  next_follow_up_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_can_view_support boolean;
begin
  if v_uid is null then
    raise exception 'insufficient_permission: must be signed in';
  end if;
  if not public.user_has_permission(p_workspace_id, 'orders.view') then
    raise exception 'insufficient_permission: orders.view required';
  end if;
  v_can_view_support := public.user_has_permission(p_workspace_id, 'support.view');

  return query
  select
    o.id, o.order_number, o.customer_name, o.customer_phone,
    (select string_agg(oi.product_name, ', ' order by oi.created_at) from public.order_items oi where oi.order_id = o.id),
    o.total_amount, o.customer_city, o.customer_state, o.status,
    case when v_can_view_support then
      (select si.created_at from public.support_interactions si where si.order_id = o.id order by si.created_at desc limit 1)
    end,
    case when v_can_view_support then
      (select si.summary from public.support_interactions si where si.order_id = o.id order by si.created_at desc limit 1)
    end,
    (select t.due_at from public.order_tasks t where t.order_id = o.id and t.assigned_to = v_uid and t.status in ('OPEN', 'IN_PROGRESS') order by t.due_at asc nulls last limit 1),
    o.updated_at
  from public.orders o
  where o.workspace_id = p_workspace_id
    and (p_brand_id is null or o.brand_id = p_brand_id)
    and o.deleted_at is null
    and o.assigned_to = v_uid
  order by o.updated_at desc
  limit p_limit;
end;
$$;

comment on function public.get_my_recent_orders(uuid, uuid, integer) is
  'Recent-activity list for the caller''s own assigned orders only (assigned_to = auth.uid(), hard-scoped). Same support.view interaction-visibility rule as get_my_priority_queue().';


-- ============================================================
-- PART E — Realtime: support_interactions was never added to the
-- publication (orders/order_tasks were, in 0032) — a newly logged
-- interaction couldn't update a live dashboard. Same guarded pattern
-- every prior phase has used.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_interactions'
    )
  then
    execute 'alter publication supabase_realtime add table public.support_interactions';
  end if;
end $$;
