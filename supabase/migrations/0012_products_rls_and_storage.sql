-- ============================================================
-- GOLDEN COMMERCE OS — Products + Inventory Foundation 0012
-- RLS for categories/products/inventory_transactions + Storage
-- ============================================================

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory_transactions enable row level security;

-- ---------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------
create policy "select_categories" on public.categories
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "insert_categories" on public.categories
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'categories.create') or public.user_has_permission(workspace_id, 'categories.manage'))
  );

create policy "update_categories" on public.categories
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'categories.update') or public.user_has_permission(workspace_id, 'categories.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'categories.update') or public.user_has_permission(workspace_id, 'categories.manage'))
  );

create policy "delete_categories" on public.categories
  for delete to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'categories.delete') or public.user_has_permission(workspace_id, 'categories.manage'))
  );

-- ---------------------------------------------------------------
-- products
-- ---------------------------------------------------------------
create policy "select_products" on public.products
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "insert_products" on public.products
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'products.create') or public.user_has_permission(workspace_id, 'products.manage'))
  );

create policy "update_products" on public.products
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'products.update') or public.user_has_permission(workspace_id, 'products.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'products.update') or public.user_has_permission(workspace_id, 'products.manage'))
  );

create policy "delete_products" on public.products
  for delete to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'products.delete') or public.user_has_permission(workspace_id, 'products.manage'))
  );

-- ---------------------------------------------------------------
-- inventory_transactions — immutable ledger. select-only for
-- clients; every row is written by adjust_inventory() (SECURITY
-- DEFINER), so no insert/update/delete policy is needed here.
-- ---------------------------------------------------------------
create policy "select_inventory_transactions" on public.inventory_transactions
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'inventory.view')
  );

-- ---------------------------------------------------------------
-- Storage buckets referenced by the foundation spec. Only
-- `products` is wired into the UI this phase; the rest are created
-- now so later phases don't need another storage migration.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('products', 'products', true),
  ('brands', 'brands', true),
  ('landing-pages', 'landing-pages', true),
  ('avatars', 'avatars', true),
  ('documents', 'documents', false),
  ('affiliates', 'affiliates', false),
  ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- Convention: object path is always `${workspace_id}/...`, so the
-- first path segment gates access via user_workspace_ids().
create policy "products_bucket_public_read" on storage.objects
  for select
  using (bucket_id = 'products');

create policy "products_bucket_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'products'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "products_bucket_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "products_bucket_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'products'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );
