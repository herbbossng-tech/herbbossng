-- ============================================================
-- GOLDEN COMMERCE OS — Order Operations OS, Phase 1 (0015)
-- Additive extension to adjust_inventory(): allow order-driven
-- stock movements without requiring inventory.* permissions.
-- ============================================================

-- A Customer Support agent reserving/releasing/converting stock as a
-- direct, automatic consequence of an order they're legitimately
-- allowed to create/update (orders.create / orders.update) shouldn't
-- also need inventory.update — they're not doing a manual stock count,
-- the order lifecycle is doing it on their behalf. This is scoped
-- tightly: it only ever applies when the caller passes
-- p_reference_type = 'order', which only the orders trigger machinery
-- does (see handle_order_inventory_effects / create_order in later
-- migrations) — a client cannot pass an arbitrary reference_type to
-- unlock this branch for a manual adjustment.
create or replace function public.adjust_inventory(
  p_product_id uuid,
  p_transaction_type text,
  p_quantity integer,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns public.inventory_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_prev_quantity integer;
  v_new_quantity integer;
  v_new_stock integer;
  v_new_reserved integer;
  v_txn public.inventory_transactions;
begin
  if p_transaction_type not in ('STOCK_IN', 'STOCK_OUT', 'RESERVED', 'RELEASED', 'SOLD', 'RETURNED', 'DAMAGED', 'ADJUSTMENT') then
    raise exception 'Unknown transaction_type %', p_transaction_type;
  end if;

  if p_transaction_type <> 'ADJUSTMENT' and (p_quantity is null or p_quantity <= 0) then
    raise exception 'quantity must be positive for transaction_type %', p_transaction_type;
  end if;

  if p_transaction_type = 'ADJUSTMENT' and (p_quantity is null or p_quantity = 0) then
    raise exception 'quantity must be non-zero for an ADJUSTMENT';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

  if not (
    public.user_has_permission(v_product.workspace_id, 'inventory.update')
    or public.user_has_permission(v_product.workspace_id, 'inventory.create')
    or (
      p_reference_type = 'order'
      and (
        public.user_has_permission(v_product.workspace_id, 'orders.create')
        or public.user_has_permission(v_product.workspace_id, 'orders.update')
      )
    )
  ) then
    raise exception 'insufficient_permission: inventory.update, inventory.create, or orders.create/orders.update (for order-referenced movements) required';
  end if;

  v_new_stock := v_product.stock_quantity;
  v_new_reserved := v_product.reserved_quantity;

  case p_transaction_type
    when 'STOCK_IN' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := v_product.stock_quantity + p_quantity;
      v_new_quantity := v_new_stock;
    when 'STOCK_OUT' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := greatest(v_product.stock_quantity - p_quantity, 0);
      v_new_quantity := v_new_stock;
    when 'RESERVED' then
      v_prev_quantity := v_product.reserved_quantity;
      v_new_reserved := v_product.reserved_quantity + p_quantity;
      v_new_quantity := v_new_reserved;
    when 'RELEASED' then
      v_prev_quantity := v_product.reserved_quantity;
      v_new_reserved := greatest(v_product.reserved_quantity - p_quantity, 0);
      v_new_quantity := v_new_reserved;
    when 'SOLD' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_reserved := greatest(v_product.reserved_quantity - p_quantity, 0);
      v_new_stock := greatest(v_product.stock_quantity - p_quantity, 0);
      v_new_quantity := v_new_stock;
    when 'RETURNED' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := v_product.stock_quantity + p_quantity;
      v_new_quantity := v_new_stock;
    when 'DAMAGED' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := greatest(v_product.stock_quantity - p_quantity, 0);
      v_new_quantity := v_new_stock;
    when 'ADJUSTMENT' then
      v_prev_quantity := v_product.stock_quantity;
      v_new_stock := greatest(v_product.stock_quantity + p_quantity, 0);
      v_new_quantity := v_new_stock;
  end case;

  perform set_config('gcos.allow_stock_write', 'on', true);
  update public.products
    set stock_quantity = v_new_stock, reserved_quantity = v_new_reserved
    where id = p_product_id;
  perform set_config('gcos.allow_stock_write', 'off', true);

  insert into public.inventory_transactions (
    workspace_id, brand_id, product_id, transaction_type, quantity,
    previous_quantity, new_quantity, reason, reference_type, reference_id, created_by
  ) values (
    v_product.workspace_id, v_product.brand_id, p_product_id, p_transaction_type, p_quantity,
    v_prev_quantity, v_new_quantity, p_reason, p_reference_type, p_reference_id, auth.uid()
  )
  returning * into v_txn;

  if v_product.track_inventory and v_new_stock <= v_product.low_stock_threshold then
    if not exists (
      select 1 from public.notifications
      where workspace_id = v_product.workspace_id
        and type = 'inventory_low'
        and is_archived = false
        and is_read = false
        and (metadata ->> 'product_id')::uuid = p_product_id
    ) then
      insert into public.notifications (workspace_id, brand_id, type, title, message, priority, link, metadata)
      values (
        v_product.workspace_id,
        v_product.brand_id,
        'inventory_low',
        'Low stock: ' || v_product.name,
        'Available stock (' || v_new_stock || ') is at or below the low stock threshold (' || v_product.low_stock_threshold || ').',
        'high',
        '/products/inventory',
        jsonb_build_object('product_id', p_product_id, 'stock_quantity', v_new_stock, 'low_stock_threshold', v_product.low_stock_threshold)
      );
    end if;
  end if;

  return v_txn;
end;
$$;
