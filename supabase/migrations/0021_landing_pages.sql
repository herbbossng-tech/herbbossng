-- ============================================================
-- GOLDEN COMMERCE OS — Landing Pages, COD Funnels & Order Capture
-- Engine (0021)
-- landing_pages / landing_page_sections / landing_page_packages /
-- landing_page_events, public (anon-safe) order capture, and the
-- shared customer-matching helper factored out of create_order().
-- ============================================================

-- ---------------------------------------------------------------
-- landing_pages — one product per page (packages below are
-- quantity/price variants of that same product, e.g. "1 Pack" /
-- "3 Packs"). slug is globally unique, not just per-brand/workspace:
-- the public route is /l/{slug} with no tenant segment in the path,
-- so two different businesses cannot collide on the same slug.
-- ---------------------------------------------------------------
create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,

  name text not null,
  slug text not null,
  title text,
  description text,

  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived')),
  -- A template only seeds a starter section list at creation time —
  -- it never constrains what sections a page can have afterward.
  page_type text not null default 'product_sales' check (page_type in ('product_sales', 'direct_response')),

  theme_config jsonb not null default '{}'::jsonb,
  seo_config jsonb not null default '{}'::jsonb,
  -- Which order-form fields are required/shown, e.g.
  -- {"collectEmail": false, "collectAlternatePhone": false, "collectLandmark": true}.
  form_config jsonb not null default '{}'::jsonb,
  -- Non-sensitive acquisition context capture toggles, e.g. {"captureUtm": true}.
  -- The actual Meta/TikTok/GA pixel engines are a future Marketing phase.
  tracking_config jsonb not null default '{}'::jsonb,
  whatsapp_config jsonb not null default '{"enabled": false, "phone": null, "message": null, "label": "Chat With Us"}'::jsonb,
  floating_cta_config jsonb not null default '{"enabled": false, "label": "Order Now"}'::jsonb,
  order_summary_enabled boolean not null default true,

  -- Copied once from the owning workspace at creation time (see
  -- set_landing_page_market() below) so the PUBLIC renderer can know
  -- the market (for currency formatting and phone-validation rules)
  -- from the landing_pages row alone — anon has no access to
  -- `workspaces`/`countries` directly, and this avoids needing a
  -- dedicated RPC just to answer "what market is this page in".
  market_country_code text,
  market_currency_code text,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  deleted_at timestamptz
);

comment on table public.landing_pages is
  'A COD funnel page. Publishing is an explicit status change (draft/published/unpublished/archived) — a disjoint vocabulary from OrderStatus/CustomerStatus. Public read access (anon) is restricted to status=published rows only; see RLS below.';

create unique index landing_pages_slug_unique_idx on public.landing_pages (slug) where deleted_at is null;
create index landing_pages_workspace_id_idx on public.landing_pages (workspace_id) where deleted_at is null;
create index landing_pages_brand_id_idx on public.landing_pages (brand_id) where deleted_at is null;
create index landing_pages_status_idx on public.landing_pages (status) where deleted_at is null;
create index landing_pages_product_id_idx on public.landing_pages (product_id) where product_id is not null;

create trigger set_landing_pages_updated_at
  before update on public.landing_pages
  for each row execute function public.set_updated_at();

create or replace function public.set_landing_page_market()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select country_code, currency_code into new.market_country_code, new.market_currency_code
    from public.workspaces where id = new.workspace_id;
  return new;
end;
$$;

comment on function public.set_landing_page_market() is
  'Copies the owning workspace''s market once, at insert time, onto landing_pages.market_country_code/market_currency_code — see the column comments for why this is denormalized rather than joined live.';

create trigger set_landing_pages_market
  before insert on public.landing_pages
  for each row execute function public.set_landing_page_market();


-- ---------------------------------------------------------------
-- landing_page_sections — the "content configuration": a real,
-- reorderable, enable/disable-able relational list rather than one
-- giant JSON blob, since that's exactly the shape section management
-- needs (add/remove/reorder/enable/duplicate). Each section's own
-- type-specific fields live in `config` jsonb, where a flexible
-- shape genuinely is the right tool.
-- ---------------------------------------------------------------
create table public.landing_page_sections (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  type text not null check (type in (
    'HERO', 'TRUST_STRIP', 'TEXT', 'IMAGE_TEXT', 'BENEFITS', 'HOW_IT_WORKS',
    'TESTIMONIALS', 'FAQ', 'CTA_BANNER', 'PACKAGE_SELECTOR', 'ORDER_FORM'
  )),
  position integer not null default 0,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.landing_page_sections is
  'Ordered, toggleable content blocks for a landing page. PACKAGE_SELECTOR/ORDER_FORM sections render live from landing_page_packages/the page''s form_config — they are not separately duplicated content.';

create index landing_page_sections_page_id_idx on public.landing_page_sections (landing_page_id, position);
create index landing_page_sections_workspace_id_idx on public.landing_page_sections (workspace_id);

create trigger set_landing_page_sections_updated_at
  before update on public.landing_page_sections
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- landing_page_packages — the price-authority table. The public
-- order form must always resolve price from here server-side; never
-- from anything the browser sends. shipping_rule is a small JSONB
-- shape interpreted by compute_shipping_fee() below:
--   {"type": "free"}
--   {"type": "fixed", "amount": 1500}
--   {"type": "by_state", "default": 1500, "rates": {"Lagos": 1000, "Kano": 2000}}
-- ---------------------------------------------------------------
create table public.landing_page_packages (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,

  name text not null,
  -- Total physical units shipped for this package, e.g. 4 for a
  -- "Buy 3 Get 1 Free" bundle — inventory reservation uses this, not
  -- a separately-tracked free_quantity.
  quantity integer not null check (quantity > 0),
  price numeric(14, 2) not null check (price >= 0),
  compare_at_price numeric(14, 2),
  badge text,
  savings_text text,
  offer_text text,
  shipping_rule jsonb not null default '{"type": "free"}'::jsonb,
  position integer not null default 0,
  enabled boolean not null default true,
  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.landing_page_packages is
  'Authoritative offer/package pricing for a landing page. create_public_order() always reads price from here server-side — the public order form may display a price but is never trusted as its source.';

create index landing_page_packages_page_id_idx on public.landing_page_packages (landing_page_id, position);
create index landing_page_packages_workspace_id_idx on public.landing_page_packages (workspace_id);

create trigger set_landing_page_packages_updated_at
  before update on public.landing_page_packages
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------
-- landing_page_events — clean, minimal event points for a future
-- Marketing/Analytics phase to build on. No Meta/TikTok/GA engine
-- here — just an append-only log the public renderer writes to via
-- track_landing_page_event() below.
-- ---------------------------------------------------------------
create table public.landing_page_events (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  event_type text not null check (event_type in (
    'page_view', 'cta_click', 'package_selected', 'form_started', 'form_submitted', 'order_created', 'thank_you_view'
  )),
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index landing_page_events_page_id_idx on public.landing_page_events (landing_page_id, created_at desc);
create index landing_page_events_workspace_id_idx on public.landing_page_events (workspace_id);


-- ---------------------------------------------------------------
-- Backfill the relationship Phase 1 anticipated: orders.landing_page_id
-- has existed since migration 0013 as a bare uuid with no FK (this
-- table didn't exist yet). Safe to add now — every order's
-- landing_page_id has been NULL up to this point.
-- ---------------------------------------------------------------
alter table public.orders
  add constraint orders_landing_page_id_fkey foreign key (landing_page_id) references public.landing_pages (id) on delete set null;

-- Order sources: add 'landing_page' as its own value, distinct from
-- the generic 'website' — a landing-page order is directly
-- attributable to a specific page via landing_page_id, which
-- 'website' alone doesn't capture.
alter table public.orders drop constraint orders_source_check;
alter table public.orders add constraint orders_source_check
  check (source in (
    'website', 'whatsapp', 'phone', 'facebook', 'instagram', 'tiktok',
    'walk_in', 'manual', 'affiliate', 'landing_page', 'other'
  ));

create index orders_landing_page_id_idx on public.orders (landing_page_id) where landing_page_id is not null;


-- ---------------------------------------------------------------
-- compute_shipping_fee(): interprets a package's shipping_rule
-- against the customer's submitted state. Deliberately small — a
-- clean abstraction, not a full shipping-zone engine.
-- ---------------------------------------------------------------
create or replace function public.compute_shipping_fee(p_shipping_rule jsonb, p_state text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_type text;
begin
  if p_shipping_rule is null then
    return 0;
  end if;

  v_type := p_shipping_rule ->> 'type';

  if v_type = 'fixed' then
    return coalesce((p_shipping_rule ->> 'amount')::numeric, 0);
  elsif v_type = 'by_state' then
    if p_state is not null and p_shipping_rule -> 'rates' ? p_state then
      return coalesce((p_shipping_rule -> 'rates' ->> p_state)::numeric, 0);
    end if;
    return coalesce((p_shipping_rule ->> 'default')::numeric, 0);
  else
    -- 'free' or any unrecognized type defaults safely to free rather
    -- than silently charging an undefined amount.
    return 0;
  end if;
end;
$$;

comment on function public.compute_shipping_fee(jsonb, text) is
  'Interprets a landing_page_packages.shipping_rule against the customer''s state. Server-side only — never trust a client-computed shipping figure.';


-- ---------------------------------------------------------------
-- find_or_create_customer(): the customer match-or-create logic
-- factored out of create_order() so create_public_order() below
-- doesn't duplicate it. Same canonical-phone matching, same
-- ON CONFLICT race-safety.
-- ---------------------------------------------------------------
create or replace function public.find_or_create_customer(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_address text default null,
  p_acquisition_source text default null
)
returns table (customer_id uuid, is_repeat boolean)
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
  v_customer_id uuid;
  v_is_repeat boolean;
begin
  select country_code into v_workspace_country from public.workspaces where id = p_workspace_id;
  select dial_code into v_dial_code from public.countries where code = v_workspace_country;

  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select c.id into v_customer_id from public.customers c
    where c.workspace_id = p_workspace_id and c.brand_id = p_brand_id
      and c.canonical_phone = v_canonical_phone and c.deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, acquisition_source, created_by, updated_by
    ) values (
      p_workspace_id, p_brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      p_customer_email, v_workspace_country, p_customer_state, p_customer_city, p_customer_address, p_acquisition_source,
      auth.uid(), auth.uid()
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders o where o.customer_id = v_customer_id and o.deleted_at is null
  ) into v_is_repeat;

  return query select v_customer_id, v_is_repeat;
end;
$$;

comment on function public.find_or_create_customer(uuid, uuid, text, text, text, text, text, text, text) is
  'Shared customer find-or-create by canonical phone, used by both create_order() and create_public_order(). auth.uid() is NULL when called from an anon (public landing page) context, which is correct — no staff user created that customer.';


-- ---------------------------------------------------------------
-- create_order(): unchanged behavior, now calling the shared
-- find_or_create_customer() helper instead of inlining the same
-- logic a second time.
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
  v_order_number text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_is_repeat boolean;
  v_customer_id uuid;
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

  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select currency_code into v_currency from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  select customer_id, is_repeat into v_customer_id, v_is_repeat from public.find_or_create_customer(
    p_workspace_id, p_brand_id, p_customer_name, p_customer_phone, p_customer_email,
    p_customer_state, p_customer_city, trim(p_customer_address), p_source
  );

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
  'The only way to create an order from the admin. Prices are always read from the live products row server-side. Customer matching delegated to find_or_create_customer().';


-- ---------------------------------------------------------------
-- create_public_order(): the public, anon-callable COD order
-- capture entrypoint for a published landing page. Mirrors
-- create_order()'s price-safety discipline exactly — the client
-- sends only a landing_page slug + package id + customer details;
-- every price figure is resolved server-side from
-- landing_page_packages, never from anything the browser computed.
--
-- No orders.create permission check here (there is no authenticated
-- user at all for a public submission) — the authorization boundary
-- instead is "does a matching PUBLISHED page and ENABLED package
-- exist", which is exactly what a public storefront's write boundary
-- should be.
-- ---------------------------------------------------------------
create or replace function public.create_public_order(
  p_landing_page_slug text,
  p_package_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_state text default null,
  p_customer_city text default null,
  p_customer_email text default null,
  p_customer_address_2 text default null,
  p_landmark text default null,
  p_customer_notes text default null,
  p_submission_token text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.landing_pages%rowtype;
  v_package public.landing_page_packages%rowtype;
  v_product public.products%rowtype;
  v_existing public.orders%rowtype;
  v_currency text;
  v_shipping numeric;
  v_total numeric;
  v_order_number text;
  v_order public.orders%rowtype;
  v_customer_id uuid;
  v_is_repeat boolean;
  v_unit_price numeric;
begin
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'customer_name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'customer_phone is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'customer_address is required';
  end if;

  select * into v_page from public.landing_pages
    where slug = p_landing_page_slug and status = 'published' and deleted_at is null;
  if not found then
    raise exception 'landing_page_unavailable';
  end if;

  -- Scenario 5 / 6: a disabled package or an unpublished page (the
  -- select above already excludes non-published pages) is rejected
  -- here even if a stale browser tab still has it in its DOM.
  select * into v_package from public.landing_page_packages
    where id = p_package_id and landing_page_id = v_page.id and enabled = true;
  if not found then
    raise exception 'package_unavailable';
  end if;

  select * into v_product from public.products
    where id = v_page.product_id and deleted_at is null;
  if not found then
    raise exception 'product_unavailable';
  end if;

  -- Idempotency: the client generates one submission_token per form
  -- render and reuses it across retries, so a double-click or a
  -- flaky-network resubmit returns the order already created instead
  -- of creating a duplicate. Deliberately NOT keyed on phone number —
  -- a legitimate customer may place multiple genuine orders.
  if p_submission_token is not null then
    select * into v_existing from public.orders
      where workspace_id = v_page.workspace_id and idempotency_key = p_submission_token;
    if found then
      return v_existing;
    end if;
  end if;

  select currency_code into v_currency from public.workspaces where id = v_page.workspace_id;

  v_shipping := public.compute_shipping_fee(v_package.shipping_rule, p_customer_state);
  v_total := v_package.price + v_shipping;
  -- Display-only per-unit figure for order_items.unit_price; the
  -- authoritative charged amount is v_package.price, inserted below
  -- as order_items.total_amount directly (not recomputed as
  -- unit_price * quantity, which can be off by a cent on bundle
  -- prices that don't divide evenly by quantity).
  v_unit_price := round(v_package.price / v_package.quantity, 2);

  select customer_id, is_repeat into v_customer_id, v_is_repeat from public.find_or_create_customer(
    v_page.workspace_id, v_page.brand_id, p_customer_name, p_customer_phone, p_customer_email,
    p_customer_state, p_customer_city, trim(p_customer_address), 'landing_page'
  );

  v_order_number := public.generate_order_number(v_page.workspace_id);

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email,
    customer_state, customer_city, customer_address, customer_address_2, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    landing_page_id, source_detail, metadata, idempotency_key, is_repeat_customer,
    created_by, updated_by
  ) values (
    v_page.workspace_id, v_page.brand_id, v_order_number, 'landing_page', 'NEW', 'normal',
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), p_customer_email,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2, p_customer_notes,
    v_currency, v_package.price, v_shipping, 0, v_total,
    coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_package.price - coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_page.id, v_page.name,
    jsonb_build_object(
      'utm_source', p_utm_source, 'utm_medium', p_utm_medium, 'utm_campaign', p_utm_campaign,
      'utm_content', p_utm_content, 'utm_term', p_utm_term,
      'landing_page_package_id', p_package_id, 'landmark', p_landmark
    ),
    p_submission_token, v_is_repeat,
    null, null
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, workspace_id, brand_id, product_id, product_name, sku,
    quantity, unit_price, compare_price, total_amount, metadata
  ) values (
    v_order.id, v_page.workspace_id, v_page.brand_id, v_product.id, v_product.name, v_product.sku,
    v_package.quantity, v_unit_price, v_package.compare_at_price, v_package.price,
    jsonb_build_object('landing_page_package_id', v_package.id, 'package_name', v_package.name)
  );

  if v_product.track_inventory then
    perform public.adjust_inventory(
      v_product.id, 'RESERVED', v_package.quantity,
      'Order ' || v_order_number || ' created (landing page: ' || v_page.name || ')', 'order', v_order.id
    );
  end if;

  return v_order;
end;
$$;

comment on function public.create_public_order(
  text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) is
  'The only public (anon-callable) way to create an order. Price is always landing_page_packages.price, resolved server-side from p_package_id — the client cannot influence it. Rejects unpublished pages and disabled packages outright.';


-- ---------------------------------------------------------------
-- track_landing_page_event(): the one write path landing_page_events
-- has. Validates the page is actually published before logging
-- anything, so this can't be used to write junk data tied to
-- arbitrary/private landing_page_ids. Silently no-ops on an unknown
-- page or event type rather than erroring — this is a best-effort
-- analytics beacon, not something that should ever break the page.
-- ---------------------------------------------------------------
create or replace function public.track_landing_page_event(
  p_landing_page_slug text,
  p_event_type text,
  p_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.landing_pages%rowtype;
begin
  select * into v_page from public.landing_pages
    where slug = p_landing_page_slug and status = 'published' and deleted_at is null;
  if not found then
    return;
  end if;

  if p_event_type not in ('page_view', 'cta_click', 'package_selected', 'form_started', 'form_submitted', 'order_created', 'thank_you_view') then
    return;
  end if;

  insert into public.landing_page_events (landing_page_id, workspace_id, brand_id, event_type, session_id, metadata)
  values (v_page.id, v_page.workspace_id, v_page.brand_id, p_event_type, p_session_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

comment on function public.track_landing_page_event(text, text, text, jsonb) is
  'Best-effort public analytics beacon for the Landing Page Engine''s event points (page_view, cta_click, package_selected, form_started, form_submitted, order_created, thank_you_view). Not a Meta/TikTok/GA integration — that is a future Marketing phase.';


-- ---------------------------------------------------------------
-- log_audit_event(): extended (additive) to recognize publish/
-- unpublish transitions on landing_pages specifically, instead of
-- logging every status change as a generic "update".
-- ---------------------------------------------------------------
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
      when TG_TABLE_NAME = 'landing_pages' and new.status = 'published' and old.status is distinct from 'published'
        then 'publish'
      when TG_TABLE_NAME = 'landing_pages' and old.status = 'published' and new.status = 'unpublished'
        then 'unpublish'
      when TG_TABLE_NAME = 'landing_pages' and new.status = 'archived' and old.status is distinct from 'archived'
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

create trigger audit_landing_pages
  after insert or update or delete on public.landing_pages
  for each row execute function public.log_audit_event('landing_pages');

create trigger audit_landing_page_sections
  after insert or update or delete on public.landing_page_sections
  for each row execute function public.log_audit_event('landing_pages');

create trigger audit_landing_page_packages
  after insert or update or delete on public.landing_page_packages
  for each row execute function public.log_audit_event('landing_pages');


-- ---------------------------------------------------------------
-- RLS. Two permissive SELECT policies per table (staff-own-workspace
-- and public-published) — Postgres OR's them together, so an
-- authenticated staff member sees their own workspace's pages (any
-- status) plus any published page anywhere, which is harmless: a
-- published page is by definition public content already visible to
-- anonymous visitors.
-- ---------------------------------------------------------------
alter table public.landing_pages enable row level security;
alter table public.landing_page_sections enable row level security;
alter table public.landing_page_packages enable row level security;
alter table public.landing_page_events enable row level security;

create policy "select_own_landing_pages" on public.landing_pages
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.view')
  );

create policy "select_published_landing_pages" on public.landing_pages
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

create policy "insert_landing_pages" on public.landing_pages
  for insert to authenticated
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.create') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  );

create policy "update_landing_pages" on public.landing_pages
  for update to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.update') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.update') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  );

create policy "delete_landing_pages" on public.landing_pages
  for delete to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.delete') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  );

create policy "select_own_landing_page_sections" on public.landing_page_sections
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.view')
  );

create policy "select_published_landing_page_sections" on public.landing_page_sections
  for select to anon, authenticated
  using (
    enabled = true
    and landing_page_id in (select id from public.landing_pages where status = 'published' and deleted_at is null)
  );

create policy "manage_landing_page_sections" on public.landing_page_sections
  for all to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.update') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.update') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  );

create policy "select_own_landing_page_packages" on public.landing_page_packages
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.view')
  );

create policy "select_published_landing_page_packages" on public.landing_page_packages
  for select to anon, authenticated
  using (
    enabled = true
    and landing_page_id in (select id from public.landing_pages where status = 'published' and deleted_at is null)
  );

create policy "manage_landing_page_packages" on public.landing_page_packages
  for all to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.update') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  )
  with check (
    workspace_id in (select public.user_workspace_ids())
    and (public.user_has_permission(workspace_id, 'landing_pages.update') or public.user_has_permission(workspace_id, 'landing_pages.manage'))
  );

-- landing_page_events: select is staff-only (own workspace); there is
-- no insert/update/delete policy at all — the only writer is
-- track_landing_page_event() (SECURITY DEFINER), matching the
-- append-only-ledger pattern used elsewhere (inventory_transactions,
-- order_events).
create policy "select_landing_page_events" on public.landing_page_events
  for select to authenticated
  using (
    workspace_id in (select public.user_workspace_ids())
    and public.user_has_permission(workspace_id, 'landing_pages.view')
  );


-- ---------------------------------------------------------------
-- Storage RLS for the 'landing-pages' bucket (created in 0012, but
-- never given policies since this table didn't exist yet). Mirrors
-- the 'products' bucket pattern exactly: public read, workspace-
-- scoped write, path convention `${workspace_id}/...`.
-- ---------------------------------------------------------------
create policy "landing_pages_bucket_public_read" on storage.objects
  for select
  using (bucket_id = 'landing-pages');

create policy "landing_pages_bucket_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'landing-pages'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "landing_pages_bucket_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'landing-pages'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );

create policy "landing_pages_bucket_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'landing-pages'
    and (storage.foldername(name))[1]::uuid in (select public.user_workspace_ids())
  );
