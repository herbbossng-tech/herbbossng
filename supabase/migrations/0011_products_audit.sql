-- ============================================================
-- GOLDEN COMMERCE OS — Products + Inventory Foundation 0011
-- Generic audit trigger, attached to products/categories/inventory
-- ============================================================

-- Runs SECURITY DEFINER so the audit trail is written unconditionally
-- — a Warehouse Staff member archiving a product shouldn't need direct
-- INSERT rights on audit_logs for the record to be created.
create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_workspace_id uuid;
  v_brand_id uuid;
  v_entity_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_workspace_id := new.workspace_id;
    v_brand_id := new.brand_id;
    v_entity_id := new.id;
  elsif TG_OP = 'UPDATE' then
    v_action := case
      when TG_TABLE_NAME in ('products', 'categories') and new.deleted_at is not null and old.deleted_at is null
        then 'archive'
      else 'update'
    end;
    v_workspace_id := new.workspace_id;
    v_brand_id := new.brand_id;
    v_entity_id := new.id;
  else
    v_action := 'delete';
    v_workspace_id := old.workspace_id;
    v_brand_id := old.brand_id;
    v_entity_id := old.id;
  end if;

  insert into public.audit_logs (
    workspace_id, brand_id, user_id, module, action, entity_type, entity_id, previous_value, new_value
  ) values (
    v_workspace_id,
    v_brand_id,
    auth.uid(),
    TG_ARGV[0],
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

comment on function public.log_audit_event() is
  'Generic audit trigger. Attach with a module-name argument, e.g. execute function public.log_audit_event(''products'').';

create trigger audit_products
  after insert or update or delete on public.products
  for each row execute function public.log_audit_event('products');

create trigger audit_categories
  after insert or update or delete on public.categories
  for each row execute function public.log_audit_event('categories');

-- inventory_transactions is itself an append-only ledger; INSERT is the
-- only action that ever happens to it, so a "Stock Added"/"Stock Removed"-
-- style audit_logs entry is produced from that single insert.
create trigger audit_inventory_transactions
  after insert on public.inventory_transactions
  for each row execute function public.log_audit_event('inventory');
