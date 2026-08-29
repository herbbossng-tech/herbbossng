-- ============================================================
-- GOLDEN COMMERCE OS — Products + Inventory Foundation 0009
-- Categories, Products, Inventory Transactions
-- ============================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  image_url text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.categories is
  'Product categories, scoped to a brand. Supports one level of parent/child nesting.';

create unique index categories_brand_slug_unique_idx
  on public.categories (brand_id, slug) where deleted_at is null;
create index categories_workspace_id_idx on public.categories (workspace_id) where deleted_at is null;
create index categories_brand_id_idx on public.categories (brand_id) where deleted_at is null;
create index categories_parent_id_idx on public.categories (parent_id);

create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();


create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  slug text not null,
  sku text,
  short_description text,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),

  selling_price numeric(12, 2) not null default 0 check (selling_price >= 0),
  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0),
  compare_price numeric(12, 2) check (compare_price is null or compare_price >= 0),

  affiliate_commission_type text
    check (affiliate_commission_type is null or affiliate_commission_type in ('fixed', 'percentage')),
  affiliate_commission_value numeric(12, 2) check (affiliate_commission_value is null or affiliate_commission_value >= 0),

  -- Stock columns. NEVER updated directly — see 0010's guard trigger.
  -- The only sanctioned write path is public.adjust_inventory().
  track_inventory boolean not null default true,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  available_quantity integer generated always as (greatest(stock_quantity - reserved_quantity, 0)) stored,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  -- Generated (not just a query-time comparison) so PostgREST filters like
  -- `.eq('is_low_stock', true)` work without column-to-column operators.
  is_low_stock boolean generated always as (track_inventory and stock_quantity <= low_stock_threshold) stored,

  weight numeric(10, 2),
  delivery_information text,
  return_policy text,

  tags text[] not null default '{}',
  seo_title text,
  seo_description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.products is
  'Core product catalogue. stock_quantity/reserved_quantity are only ever mutated through public.adjust_inventory() — enforced by a trigger, not just convention.';

create unique index products_brand_slug_unique_idx
  on public.products (brand_id, slug) where deleted_at is null;
create unique index products_brand_sku_unique_idx
  on public.products (brand_id, sku) where sku is not null and deleted_at is null;
create index products_workspace_id_idx on public.products (workspace_id) where deleted_at is null;
create index products_brand_id_idx on public.products (brand_id) where deleted_at is null;
create index products_category_id_idx on public.products (category_id);
create index products_status_idx on public.products (status) where deleted_at is null;
create index products_low_stock_idx
  on public.products (brand_id)
  where deleted_at is null and is_low_stock;

create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();


create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  transaction_type text not null
    check (transaction_type in ('STOCK_IN', 'STOCK_OUT', 'RESERVED', 'RELEASED', 'SOLD', 'RETURNED', 'DAMAGED', 'ADJUSTMENT')),
  quantity integer not null,
  previous_quantity integer not null,
  new_quantity integer not null,
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.inventory_transactions is
  'Append-only ledger of every stock movement. previous_quantity/new_quantity reflect whichever bucket the transaction_type affects (stock_quantity for STOCK_IN/OUT/SOLD/RETURNED/DAMAGED/ADJUSTMENT, reserved_quantity for RESERVED/RELEASED). Rows are only ever inserted by public.adjust_inventory().';

create index inventory_transactions_product_id_idx on public.inventory_transactions (product_id, created_at desc);
create index inventory_transactions_workspace_id_idx on public.inventory_transactions (workspace_id);
create index inventory_transactions_reference_idx on public.inventory_transactions (reference_type, reference_id);


-- ---------------------------------------------------------------
-- Generalize the foundation's media_library to attach to any
-- entity (products today; brands/landing pages later) instead of
-- introducing a parallel product_images table.
-- ---------------------------------------------------------------
alter table public.media_library
  add column entity_type text,
  add column entity_id uuid,
  add column is_primary boolean not null default false,
  add column sort_order integer not null default 0;

create index media_library_entity_idx on public.media_library (entity_type, entity_id) where deleted_at is null;

comment on column public.media_library.entity_type is
  'e.g. "product" — pairs with entity_id to attach an uploaded file to a business record.';
