-- ============================================================
-- GOLDEN COMMERCE OS — Customer Intelligence & Operations (0020)
-- customers, customer_notes, market-aware phone normalization,
-- customer<->order linking, and denormalized order-summary sync.
-- ============================================================

-- ---------------------------------------------------------------
-- normalize_phone(): builds a canonical, market-aware phone key so
-- "0801 234 5678" and "+234 801 234 5678" (same Nigerian number)
-- collapse to the same customer, while a Kenyan and Nigerian number
-- that happen to share trailing digits do NOT — unlike the Phase 1
-- Orders heuristic (last-9-digits only), this uses the workspace's
-- actual country dial code. Not a full E.164 parser (no
-- libphonenumber-equivalent in this stack yet) — see the function
-- comment for exactly what it does and doesn't handle.
-- ---------------------------------------------------------------
create or replace function public.normalize_phone(p_phone text, p_dial_code text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_dial_digits text;
begin
  if p_phone is null or trim(p_phone) = '' then
    return null;
  end if;

  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_dial_digits := regexp_replace(coalesce(p_dial_code, ''), '[^0-9]', '', 'g');

  if v_digits = '' then
    return null;
  end if;

  -- Already carries the market's dial code (with or without a leading
  -- '+', already stripped above) — use the digits as-is.
  if v_dial_digits <> '' and left(v_digits, length(v_dial_digits)) = v_dial_digits
     and length(v_digits) > length(v_dial_digits) then
    return v_digits;
  end if;

  -- Local format with a trunk prefix "0" (Nigeria 0801…, Kenya 0712…,
  -- Ghana 024…) — drop the leading 0, prepend the market's dial code.
  if left(v_digits, 1) = '0' then
    return v_dial_digits || substring(v_digits from 2);
  end if;

  -- No recognizable prefix (e.g. a national number typed without the
  -- leading 0) — assume it's a bare national number for this market.
  return v_dial_digits || v_digits;
end;
$$;

comment on function public.normalize_phone(text, text) is
  'Canonical phone key = market dial-code digits + national significant number. Pass the ordering workspace''s countries.dial_code so numbers from different markets never collide just because their trailing digits match. Not full E.164 parsing — a pragmatic, replaceable normalization layer, not a claim of perfect global correctness.';


-- ---------------------------------------------------------------
-- customers — the canonical customer record. Scoped by brand (like
-- products/orders), not just workspace: two brands under one
-- workspace are different storefronts and may legitimately have
-- separate customer relationships with the same phone number.
--
-- total_orders/delivered_count/…/last_order_at are denormalized and
-- kept in sync by sync_customer_order_stats() below (attached to
-- orders, not customers). This is a deliberate exception to "derive,
-- don't store": sorting/filtering a customer list of hundreds of
-- thousands of rows by "most orders" or "highest value" needs an
-- indexed column, not a live aggregation over all of `orders` on
-- every list request. The trigger is the single writer — nothing
-- else may set these columns, and the frontend never computes them.
-- ---------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  first_name text,
  last_name text,
  full_name text not null,
  phone text not null,
  canonical_phone text not null,
  alternate_phone text,
  email text,

  country_code text,
  state text,
  city text,
  address text,
  address_2 text,
  landmark text,
  postal_code text,

  -- Active/inactive/blocked — an operational flag on the customer
  -- relationship. Deliberately a disjoint vocabulary from OrderStatus
  -- (NEW/PENDING/DELIVERED/…) — these are two separate state machines.
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),

  -- Kept in sync by sync_customer_order_stats().
  is_repeat_customer boolean not null default false,
  total_orders integer not null default 0,
  delivered_count integer not null default 0,
  pending_count integer not null default 0,
  returned_count integer not null default 0,
  cancelled_count integer not null default 0,
  total_order_value numeric(14, 2) not null default 0,
  delivered_value numeric(14, 2) not null default 0,
  pending_value numeric(14, 2) not null default 0,
  returned_value numeric(14, 2) not null default 0,
  first_order_at timestamptz,
  last_order_at timestamptz,

  -- Where this customer relationship originated — captured once from
  -- their first order and never overwritten by a later order from a
  -- different channel. Distinct from orders.source, which stays
  -- per-order (a repeat customer's 2nd order can come from anywhere).
  acquisition_source text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.customers is
  'Canonical customer record, brand-scoped. Order-summary columns are trigger-maintained from public.orders (see sync_customer_order_stats) — never written directly by the client, and always using the same revenue definitions as get_order_stats() so Dashboard/Orders/Customers financial figures cannot drift apart.';

-- True dedup key: one customer per (brand, canonical phone). The
-- partial index (deleted_at is null) lets a phone number be reused by
-- a *new* customer record if the old one was archived/soft-deleted.
create unique index customers_workspace_brand_canonical_phone_idx
  on public.customers (workspace_id, brand_id, canonical_phone) where deleted_at is null;

create index customers_workspace_id_idx on public.customers (workspace_id) where deleted_at is null;
create index customers_brand_id_idx on public.customers (brand_id) where deleted_at is null;
create index customers_workspace_brand_idx on public.customers (workspace_id, brand_id) where deleted_at is null;
create index customers_phone_idx on public.customers (phone);
create index customers_created_at_idx on public.customers (created_at desc);
create index customers_updated_at_idx on public.customers (updated_at desc);
create index customers_last_order_at_idx on public.customers (last_order_at desc) where last_order_at is not null;
create index customers_status_idx on public.customers (status) where deleted_at is null;

create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- customer_notes — internal staff notes only, same append-only shape
-- as order_notes. Never exposed to customers.
-- ---------------------------------------------------------------
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  body text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_notes is
  'Internal-only operational notes on a customer (e.g. delivery preferences). Never surfaced to the customer.';

create index customer_notes_customer_id_idx on public.customer_notes (customer_id);
create index customer_notes_workspace_id_idx on public.customer_notes (workspace_id);

create trigger set_customer_notes_updated_at
  before update on public.customer_notes
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- Link orders to customers for real. orders.customer_id has existed
-- since 0013 as a bare uuid with no FK (customers didn't exist yet);
-- add the constraint now. Safe: every order's customer_id has been
-- NULL up to this point (create_order() never set it), so there is
-- nothing to violate.
-- ---------------------------------------------------------------
alter table public.orders
  add constraint orders_customer_id_fkey foreign key (customer_id) references public.customers (id) on delete set null;


-- ---------------------------------------------------------------
-- sync_customer_order_stats(): the single writer for every
-- denormalized summary column on customers. Recomputes one
-- customer's aggregate from their full order set on every order
-- insert/relevant-update/delete — bounded cost (one customer's own
-- orders, indexed by customer_id), not a scan of all orders. Uses
-- the exact same status/cash-collection classification as
-- get_order_stats() so a customer's Delivered Value always agrees
-- with what that same order contributes to Dashboard Delivered
-- Revenue.
-- ---------------------------------------------------------------
create or replace function public.sync_customer_order_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := coalesce(new.customer_id, old.customer_id);
  if v_customer_id is null then
    return coalesce(new, old);
  end if;

  update public.customers c set
    total_orders = agg.total_orders,
    delivered_count = agg.delivered_count,
    pending_count = agg.pending_count,
    returned_count = agg.returned_count,
    cancelled_count = agg.cancelled_count,
    total_order_value = agg.total_order_value,
    delivered_value = agg.delivered_value,
    pending_value = agg.pending_value,
    returned_value = agg.returned_value,
    first_order_at = agg.first_order_at,
    last_order_at = agg.last_order_at,
    is_repeat_customer = (agg.total_orders >= 2)
  from (
    select
      count(*) as total_orders,
      count(*) filter (where status = 'DELIVERED') as delivered_count,
      count(*) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')) as pending_count,
      count(*) filter (where status = 'RETURNED') as returned_count,
      count(*) filter (where status = 'CANCELLED') as cancelled_count,
      coalesce(sum(total_amount) filter (where status <> 'CANCELLED'), 0) as total_order_value,
      coalesce(sum(total_amount) filter (where status = 'DELIVERED' and cash_collection_status = 'collected'), 0) as delivered_value,
      coalesce(sum(total_amount) filter (where status not in ('DELIVERED', 'RETURNED', 'CANCELLED')), 0) as pending_value,
      coalesce(sum(total_amount) filter (where status = 'RETURNED'), 0) as returned_value,
      min(created_at) as first_order_at,
      max(created_at) as last_order_at
    from public.orders
    where customer_id = v_customer_id and deleted_at is null
  ) agg
  where c.id = v_customer_id;

  return coalesce(new, old);
end;
$$;

comment on function public.sync_customer_order_stats() is
  'The only writer for customers.total_orders/…/last_order_at. Fires per-order-mutation, recomputes just that one customer''s aggregate from public.orders — never trust or accept a client-submitted value for these columns.';

create trigger sync_customer_order_stats_trigger
  after insert or delete or update of status, cash_collection_status, total_amount, deleted_at, customer_id
  on public.orders
  for each row execute function public.sync_customer_order_stats();

comment on trigger sync_customer_order_stats_trigger on public.orders is
  'Recomputes coalesce(new,old).customer_id''s aggregate on every relevant order change. Known gap: if an order''s customer_id is ever reassigned, only the NEW customer gets recomputed here — the OLD one is left stale. No UI path reassigns customer_id in this phase, so this is a documented edge case, not a bug being silently accepted.';


-- Customer-facing audit trail, reusing the existing generic trigger —
-- customer created / updated / archived and note-added all land in
-- audit_logs exactly like products/orders do. No parallel logging
-- system.
create trigger audit_customers
  after insert or update or delete on public.customers
  for each row execute function public.log_audit_event('customers');

create trigger audit_customer_notes
  after insert or update or delete on public.customer_notes
  for each row execute function public.log_audit_event('customers');


-- ---------------------------------------------------------------
-- create_order(): extended to match-or-create the customer and link
-- the order, replacing the Phase 1 last-9-digits-of-phone heuristic
-- entirely with real canonical-phone customer identity. Same
-- signature as before (0017/0019) — CREATE OR REPLACE, not a new
-- function, since this must stay the single order-creation entrypoint.
-- ---------------------------------------------------------------
create or replace function public.create_order(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_source text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_items jsonb,
  p_customer_email text default null,
  p_customer_country_code text default null,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_address_2 text default null,
  p_customer_postal_code text default null,
  p_customer_notes text default null,
  p_shipping_fee numeric default 0,
  p_discount_amount numeric default 0,
  p_source_detail text default null,
  p_internal_notes text default null,
  p_priority text default 'normal',
  p_idempotency_key text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_currency text;
  v_workspace_country text;
  v_dial_code text;
  v_order_number text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_is_repeat boolean;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
begin
  if not public.user_has_permission(p_workspace_id, 'orders.create') then
    raise exception 'insufficient_permission: orders.create required';
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'customer_name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'customer_phone is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'customer_address is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
  end if;

  -- Idempotency: a retried submission with the same key returns the
  -- order already created instead of creating a duplicate.
  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select currency_code, country_code into v_currency, v_workspace_country
    from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_workspace_country;

  -- Customer matching: find-or-create by canonical phone, scoped to
  -- this brand. The unique index makes this race-safe under
  -- concurrent order creation for a brand-new customer — whichever
  -- request loses the race just resolves to the row the other one
  -- inserted, rather than erroring or duplicating.
  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select id into v_customer_id from public.customers
    where workspace_id = p_workspace_id and brand_id = p_brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, acquisition_source, created_by, updated_by
    ) values (
      p_workspace_id, p_brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      p_customer_email, v_workspace_country, p_customer_state, p_customer_city, trim(p_customer_address), p_source,
      auth.uid(), auth.uid()
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  -- Repeat status is now real customer history, not a phone digit
  -- heuristic: does this customer already have at least one other
  -- order (placed before this one)?
  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  -- Price the order. The client supplies only product_id + quantity in
  -- p_items — unit_price is always read from the live products row.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'quantity must be a positive integer for every order item';
    end if;

    select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid
        and workspace_id = p_workspace_id
        and brand_id = p_brand_id
        and deleted_at is null;
    if not found then
      raise exception 'Product % not found in this brand', v_item ->> 'product_id';
    end if;

    v_subtotal := v_subtotal + v_product.selling_price * v_quantity;
    v_cost := v_cost + coalesce(v_product.cost_price, 0) * v_quantity;
  end loop;

  v_total := v_subtotal + coalesce(p_shipping_fee, 0) - coalesce(p_discount_amount, 0);
  if v_total < 0 then
    raise exception 'Order total cannot be negative';
  end if;

  v_order_number := public.generate_order_number(p_workspace_id);

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2,
    customer_postal_code, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    source_detail, internal_notes, idempotency_key, is_repeat_customer,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_order_number, p_source, 'NEW', coalesce(p_priority, 'normal'),
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), p_customer_email, p_customer_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2,
    p_customer_postal_code, p_customer_notes,
    v_currency, v_subtotal, coalesce(p_shipping_fee, 0), coalesce(p_discount_amount, 0), v_total,
    v_cost, v_subtotal - v_cost,
    p_source_detail, p_internal_notes, p_idempotency_key, v_is_repeat,
    auth.uid(), auth.uid()
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    insert into public.order_items (
      order_id, workspace_id, brand_id, product_id, product_name, sku,
      quantity, unit_price, compare_price, total_amount
    ) values (
      v_order.id, p_workspace_id, p_brand_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.selling_price, v_product.compare_price, v_product.selling_price * v_quantity
    );

    if v_product.track_inventory then
      perform public.adjust_inventory(
        v_product.id, 'RESERVED', v_quantity,
        'Order ' || v_order_number || ' created', 'order', v_order.id
      );
    end if;
  end loop;

  return v_order;
end;
$$;

comment on function public.create_order(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text
) is
  'The only way to create an order. Prices are always read from the live products row server-side. Also finds-or-creates the ordering customer by canonical (market-aware) phone and links order.customer_id; is_repeat_customer reflects real prior-order history for that customer, not a phone-digit heuristic.';


-- ---------------------------------------------------------------
-- get_customer_stats() — SECURITY INVOKER, same RLS-scoped pattern as
-- get_order_stats(): a user without customers.view gets an all-zero
-- row rather than an error. Powers the Customers page summary strip.
-- ---------------------------------------------------------------
create or replace function public.get_customer_stats(p_workspace_id uuid, p_brand_id uuid default null)
returns table (
  total_customers bigint,
  new_customers bigint,
  repeat_customers bigint,
  active_customers bigint,
  customers_with_pending_orders bigint
)
language sql
stable
as $$
  select
    count(*),
    count(*) filter (where not is_repeat_customer),
    count(*) filter (where is_repeat_customer),
    count(*) filter (where status = 'active'),
    count(*) filter (where pending_count > 0)
  from public.customers
  where workspace_id = p_workspace_id
    and (p_brand_id is null or brand_id = p_brand_id)
    and deleted_at is null;
$$;

comment on function public.get_customer_stats(uuid, uuid) is
  'Authoritative customer summary for the Customers page header. Reads the trigger-maintained summary columns on customers, never recomputes from orders directly.';


-- ---------------------------------------------------------------
-- create_customer() — the manual "+ Add Customer" entrypoint.
-- Deliberately does NOT auto-merge into an existing customer with a
-- matching canonical phone the way create_order() does: this is an
-- explicit staff action to create a NEW record, so silently reusing
-- an existing one would be confusing. Instead it raises a clear,
-- parseable error so the frontend can point staff at the existing
-- customer rather than erroring on a raw unique-constraint violation.
-- This is intentionally the extent of "duplicate handling" here — a
-- real merge tool (per the spec's explicit instruction not to
-- implement automatic merging) is future work.
-- ---------------------------------------------------------------
create or replace function public.create_customer(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_full_name text,
  p_phone text,
  p_alternate_phone text default null,
  p_email text default null,
  p_state text default null,
  p_city text default null,
  p_address text default null,
  p_address_2 text default null,
  p_landmark text default null,
  p_postal_code text default null
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_country text;
  v_dial_code text;
  v_canonical_phone text;
  v_first_name text;
  v_last_name text;
  v_existing_id uuid;
  v_customer public.customers%rowtype;
begin
  if not (public.user_has_permission(p_workspace_id, 'customers.create') or public.user_has_permission(p_workspace_id, 'customers.manage')) then
    raise exception 'insufficient_permission: customers.create required';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'full_name is required';
  end if;
  if coalesce(trim(p_phone), '') = '' then
    raise exception 'phone is required';
  end if;

  select country_code into v_workspace_country from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_workspace_country;
  v_canonical_phone := public.normalize_phone(p_phone, v_dial_code);

  select id into v_existing_id from public.customers
    where workspace_id = p_workspace_id and brand_id = p_brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if found then
    raise exception 'customer_phone_exists:%', v_existing_id;
  end if;

  v_first_name := split_part(trim(p_full_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_full_name) from length(v_first_name) + 1)), '');

  insert into public.customers (
    workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
    alternate_phone, email, country_code, state, city, address, address_2, landmark, postal_code,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_first_name, v_last_name, trim(p_full_name), trim(p_phone), v_canonical_phone,
    nullif(trim(p_alternate_phone), ''), nullif(trim(p_email), ''), v_workspace_country, p_state, p_city,
    p_address, p_address_2, p_landmark, p_postal_code,
    auth.uid(), auth.uid()
  )
  returning * into v_customer;

  return v_customer;
end;
$$;

comment on function public.create_customer(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text
) is
  'Manual "+ Add Customer" entrypoint. Raises customer_phone_exists:<id> rather than merging or erroring on the raw unique constraint if the canonical phone already belongs to another customer in this brand.';


-- ---------------------------------------------------------------
-- RLS. customers gets select/insert/update — insert exists so a
-- direct client-side "Add Customer" flow doesn't need to go through
-- create_order(); customer auto-creation from create_order() runs
-- SECURITY DEFINER and bypasses RLS entirely regardless of the
-- calling user's customers.create permission (mirrors how
-- adjust_inventory''s order-triggered branch works in Phase 1). No
-- delete policy — customers are archived via UPDATE (status/
-- deleted_at), never hard-deleted from the client; update_customers
-- also accepts customers.delete so the "archive" action in the UI
-- (gated on customers.delete) can actually perform its UPDATE.
-- ---------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customer_notes enable row level security;

create policy "select_customers" on public.customers
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'customers.view')
  );

create policy "insert_customers" on public.customers
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'customers.create') or public.user_has_permission(workspace_id, 'customers.manage'))
  );

create policy "update_customers" on public.customers
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (
      public.user_has_permission(workspace_id, 'customers.update')
      or public.user_has_permission(workspace_id, 'customers.delete')
      or public.user_has_permission(workspace_id, 'customers.manage')
    )
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (
      public.user_has_permission(workspace_id, 'customers.update')
      or public.user_has_permission(workspace_id, 'customers.delete')
      or public.user_has_permission(workspace_id, 'customers.manage')
    )
  );

create policy "select_customer_notes" on public.customer_notes
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'customers.view')
  );

create policy "insert_customer_notes" on public.customer_notes
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'customers.update') or public.user_has_permission(workspace_id, 'customers.manage'))
  );
