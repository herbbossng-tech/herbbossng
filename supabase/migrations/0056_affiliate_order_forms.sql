-- ============================================================
-- GOLDEN COMMERCE OS — replace code-based affiliate order
-- attribution with affiliate-created embeddable order forms.
--
-- Previously: an affiliate's referral_code had to be appended to a
-- landing page URL (?ref=CODE) or typed into a staff free-text field
-- at manual order creation. Both were fragile (a code can be
-- mistyped, forgotten, or dropped when a link is shared elsewhere)
-- and both are removed here entirely, per explicit product decision
-- — there is no fallback path.
--
-- Now: an affiliate gets their own portal login (email + password)
-- and can create an embeddable order form for any product on a
-- campaign they have ACCESS to (gated by the campaign's
-- allowed_activities containing 'CREATE_ORDER_FORMS' — a column that
-- has existed since 0024 but was never wired to anything). Each form
-- gets its own UUID; that id IS the attribution — whoever submits an
-- order through /order/:formId or its embed snippet is automatically
-- attributed to that form's affiliate_id/campaign_id, with no code to
-- carry, lose, or type.
-- ============================================================


-- ----------------------------------------------------------------
-- PART A — create_order(): drop the referral-code parameter and its
-- resolution/campaign-matching logic entirely. Signature otherwise
-- unchanged from 0052.
-- ----------------------------------------------------------------
drop function if exists public.create_order(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text
);

create function public.create_order(
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
  v_item_summary text[] := '{}';
  v_item_quantity integer := 0;
  v_dup_order_number text;
  v_dup_created_at timestamptz;
  v_possible_duplicate boolean := false;
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

  select currency_code, country_code into v_currency, v_workspace_country
    from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace % not found', p_workspace_id;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_workspace_country;

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

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  select o.order_number, o.created_at into v_dup_order_number, v_dup_created_at
    from public.orders o
    where o.customer_id = v_customer_id and o.deleted_at is null
      and o.status not in ('CANCELLED', 'RETURNED')
      and o.created_at > now() - interval '24 hours'
    order by o.created_at desc
    limit 1;
  v_possible_duplicate := found;

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
    v_item_summary := array_append(v_item_summary, v_product.name || ' x' || v_quantity);
    v_item_quantity := v_item_quantity + v_quantity;
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
    metadata,
    created_by, updated_by
  ) values (
    p_workspace_id, p_brand_id, v_order_number, p_source, 'NEW', coalesce(p_priority, 'normal'),
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), p_customer_email, p_customer_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2,
    p_customer_postal_code, p_customer_notes,
    v_currency, v_subtotal, coalesce(p_shipping_fee, 0), coalesce(p_discount_amount, 0), v_total,
    v_cost, v_subtotal - v_cost,
    p_source_detail, p_internal_notes, p_idempotency_key, v_is_repeat,
    jsonb_build_object(
      'item_summary', array_to_string(v_item_summary, ', '), 'item_quantity', v_item_quantity,
      'possible_duplicate', v_possible_duplicate,
      'duplicate_of_order_number', v_dup_order_number,
      'duplicate_minutes_ago', case when v_possible_duplicate then round(extract(epoch from (now() - v_dup_created_at)) / 60) else null end
    ),
    auth.uid(), auth.uid()
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    insert into public.order_items (
      order_id, workspace_id, brand_id, product_id, product_name, sku,
      quantity, unit_price, unit_cost, compare_price, total_amount
    ) values (
      v_order.id, p_workspace_id, p_brand_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.selling_price, v_product.cost_price, v_product.compare_price, v_product.selling_price * v_quantity
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
  'The only way to staff-create an order. Prices/costs are always read from the live products row server-side. Finds-or-creates the ordering customer by canonical phone and links order.customer_id. 0056: the affiliate-referral-code parameter/resolution was removed entirely — affiliate/campaign attribution now happens only via create_affiliate_order_form_order(), keyed to the order form the customer actually submitted, never a typed code.';


-- ----------------------------------------------------------------
-- PART B — create_public_order(): same removal, same reasoning.
-- ----------------------------------------------------------------
drop function if exists public.create_public_order(
  text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
);

create function public.create_public_order(
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
  p_utm_term text default null,
  p_fbclid text default null,
  p_ttclid text default null
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
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_dial_code text;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_is_repeat boolean;
  v_order_number text;
  v_shipping numeric;
  v_total numeric;
  v_unit_price numeric;
  v_dup_order_number text;
  v_dup_created_at timestamptz;
  v_possible_duplicate boolean := false;
begin
  select * into v_page from public.landing_pages
    where slug = p_landing_page_slug and status = 'published' and deleted_at is null;
  if not found then
    raise exception 'This page is not available';
  end if;

  select * into v_package from public.landing_page_packages
    where id = p_package_id and landing_page_id = v_page.id and enabled = true;
  if not found then
    raise exception 'This package is not available';
  end if;

  if v_page.product_id is not null then
    select * into v_product from public.products
      where id = v_page.product_id and deleted_at is null;
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Full name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'Phone number is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'Delivery address is required';
  end if;
  if coalesce(trim(p_customer_city), '') = '' then
    raise exception 'City is required';
  end if;
  if coalesce(trim(p_customer_state), '') = '' then
    raise exception 'State/Region is required';
  end if;

  if p_submission_token is not null then
    select * into v_existing from public.orders
      where workspace_id = v_page.workspace_id and idempotency_key = p_submission_token;
    if found then
      return v_existing;
    end if;
  end if;

  select dial_code into v_dial_code from public.countries where code = v_page.market_country_code;
  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select id into v_customer_id from public.customers
    where workspace_id = v_page.workspace_id and brand_id = v_page.brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, address_2, landmark, acquisition_source,
      created_by, updated_by
    ) values (
      v_page.workspace_id, v_page.brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      nullif(trim(p_customer_email), ''), v_page.market_country_code, p_customer_state, p_customer_city,
      trim(p_customer_address), p_customer_address_2, p_landmark, 'landing_page',
      null, null
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  select o.order_number, o.created_at into v_dup_order_number, v_dup_created_at
    from public.orders o
    where o.customer_id = v_customer_id and o.deleted_at is null
      and o.status not in ('CANCELLED', 'RETURNED')
      and o.created_at > now() - interval '24 hours'
    order by o.created_at desc
    limit 1;
  v_possible_duplicate := found;

  v_shipping := public.compute_shipping_fee(v_package.shipping_rule, p_customer_state);
  v_total := v_package.price + v_shipping;

  v_order_number := public.generate_order_number(v_page.workspace_id);
  v_unit_price := case when v_package.quantity > 0 then round(v_package.price / v_package.quantity, 2) else v_package.price end;

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    landing_page_id, source_detail, metadata, idempotency_key, is_repeat_customer,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, ttclid,
    created_by, updated_by
  ) values (
    v_page.workspace_id, v_page.brand_id, v_order_number, 'landing_page', 'NEW', 'normal',
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), v_page.market_country_code,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2, p_customer_notes,
    v_page.market_currency_code, v_package.price, v_shipping, 0, v_total,
    coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_package.price - coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_page.id, v_page.name,
    jsonb_build_object(
      'landing_page_package_id', v_package.id, 'landmark', p_landmark,
      'item_summary', v_package.name, 'item_quantity', v_package.quantity,
      'possible_duplicate', v_possible_duplicate,
      'duplicate_of_order_number', v_dup_order_number,
      'duplicate_minutes_ago', case when v_possible_duplicate then round(extract(epoch from (now() - v_dup_created_at)) / 60) else null end
    ),
    p_submission_token, v_is_repeat,
    nullif(trim(p_utm_source), ''), nullif(trim(p_utm_medium), ''), nullif(trim(p_utm_campaign), ''),
    nullif(trim(p_utm_term), ''), nullif(trim(p_utm_content), ''), nullif(trim(p_fbclid), ''), nullif(trim(p_ttclid), ''),
    null, null
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, workspace_id, brand_id, product_id, product_name, sku, package_id, package_name,
    quantity, unit_price, unit_cost, compare_price, total_amount, metadata
  ) values (
    v_order.id, v_page.workspace_id, v_page.brand_id, v_page.product_id, coalesce(v_product.name, v_package.name), v_product.sku,
    v_package.id, v_package.name,
    v_package.quantity, v_unit_price, v_product.cost_price, v_package.compare_at_price, v_package.price,
    jsonb_build_object('landing_page_package_id', v_package.id, 'package_name', v_package.name)
  );

  if v_product.id is not null and v_product.track_inventory then
    perform public.adjust_inventory_internal(
      v_product.id, 'RESERVED', v_package.quantity,
      'Order ' || v_order_number || ' created (landing page: ' || v_page.name || ')', 'order', v_order.id
    );
  end if;

  perform public.enqueue_tracking_event(v_page.workspace_id, v_page.brand_id, v_page.id, v_order.id, 'ORDER_CREATED');
  perform public.enqueue_tracking_event(v_page.workspace_id, v_page.brand_id, v_page.id, v_order.id, 'PURCHASE');

  return v_order;
end;
$$;

comment on function public.create_public_order(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'Public, anonymous-callable landing-page order creation. Full name, phone, delivery address, city, and state/region are all required and rejected server-side if blank/whitespace-only. Idempotent on p_submission_token. 0056: the affiliate-referral-code parameter/resolution was removed entirely — affiliate/campaign attribution for a landing page is not this function''s concern anymore; use create_affiliate_order_form_order() for affiliate-attributed orders.';


-- ----------------------------------------------------------------
-- PART C — affiliate portal login: affiliates gain their own
-- auth.users identity, separate from staff/workspace members.
-- ----------------------------------------------------------------
alter table public.affiliates
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null,
  add column if not exists portal_access_enabled boolean not null default false;

comment on column public.affiliates.auth_user_id is
  'Set once via activate-affiliate-portal-access (Edge Function, service-role admin API — a password-holding auth.users row cannot be created from plain SQL). Null means this affiliate has no portal login yet.';

create table public.affiliate_portal_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index affiliate_portal_setup_tokens_affiliate_id_idx on public.affiliate_portal_setup_tokens (affiliate_id);

comment on table public.affiliate_portal_setup_tokens is
  'One-time, staff-issued tokens for an affiliate to set their portal password. Same shape as staff_invitations (0023): only the sha256 hash is stored, the raw token is shown to staff once (create_affiliate_portal_setup_token) and shared with the affiliate directly — no email-sending pipeline is wired here, matching the existing staff-invite precedent.';

alter table public.affiliate_portal_setup_tokens enable row level security;

create policy "select_affiliate_portal_setup_tokens" on public.affiliate_portal_setup_tokens
  for select to authenticated
  using (
    exists (
      select 1 from public.affiliates a
      where a.id = affiliate_portal_setup_tokens.affiliate_id
        and a.workspace_id in (select public.user_workspace_ids())
        and (public.user_has_permission(a.workspace_id, 'affiliates.approve') or public.user_has_permission(a.workspace_id, 'affiliates.manage'))
    )
  );

-- No insert/update/delete policy: rows are only ever written by
-- create_affiliate_portal_setup_token() (SECURITY DEFINER, below) or
-- consumed by the activate-affiliate-portal-access Edge Function
-- using the service role, which bypasses RLS entirely.


-- ----------------------------------------------------------------
-- PART D — current_affiliate_id(): the identity-resolution helper
-- every affiliate-portal RLS policy and RPC below builds on. Mirrors
-- the role user_workspace_ids() plays for staff.
-- ----------------------------------------------------------------
create or replace function public.current_affiliate_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.affiliates
    where auth_user_id = auth.uid()
      and approval_status = 'approved'
      and status = 'active'
      and deleted_at is null
    limit 1;
$$;

grant execute on function public.current_affiliate_id() to authenticated;

comment on function public.current_affiliate_id() is
  'Resolves the calling affiliate-portal session to its affiliates.id, or null if this auth.uid() is not a logged-in, approved, active affiliate (including staff/workspace-member sessions, which never have an affiliates row pointing at them). Deliberately excludes suspended/rejected affiliates so a portal session survives login but loses all access the moment staff suspend the account.';


-- ----------------------------------------------------------------
-- PART E — create_affiliate_portal_setup_token(): staff-issued,
-- one-time token an affiliate uses to set their portal password.
-- ----------------------------------------------------------------
create or replace function public.create_affiliate_portal_setup_token(p_affiliate_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_raw_token text;
begin
  select * into v_affiliate from public.affiliates where id = p_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Affiliate not found';
  end if;

  if not (public.user_has_permission(v_affiliate.workspace_id, 'affiliates.approve') or public.user_has_permission(v_affiliate.workspace_id, 'affiliates.manage')) then
    raise exception 'insufficient_permission: affiliates.approve or affiliates.manage required';
  end if;

  if coalesce(trim(v_affiliate.email), '') = '' then
    raise exception 'This affiliate has no email address on file — add one before issuing portal access';
  end if;

  if v_affiliate.auth_user_id is not null then
    raise exception 'This affiliate already has portal access — there is no re-issue flow yet; use Supabase''s standard password reset instead';
  end if;

  v_raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.affiliate_portal_setup_tokens (affiliate_id, token_hash, expires_at, created_by)
  values (p_affiliate_id, encode(digest(v_raw_token, 'sha256'), 'hex'), now() + interval '7 days', auth.uid());

  return v_raw_token;
end;
$$;

grant execute on function public.create_affiliate_portal_setup_token(uuid) to authenticated;

comment on function public.create_affiliate_portal_setup_token(uuid) is
  'Staff-only. Returns the RAW one-time setup token exactly once — only its sha256 hash is persisted. The frontend builds a link like {origin}/affiliate/setup-password?token=... and shows it to staff to share with the affiliate, the same manual-share pattern staff invitations already use.';


-- ----------------------------------------------------------------
-- PART F — affiliate_order_forms / affiliate_order_form_packages.
-- ----------------------------------------------------------------
create table public.affiliate_order_forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  campaign_id uuid not null references public.affiliate_campaigns (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  internal_title text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  theme_config jsonb not null default '{}'::jsonb,
  form_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index affiliate_order_forms_affiliate_id_idx on public.affiliate_order_forms (affiliate_id) where deleted_at is null;
create index affiliate_order_forms_campaign_id_idx on public.affiliate_order_forms (campaign_id) where deleted_at is null;
create index affiliate_order_forms_workspace_id_idx on public.affiliate_order_forms (workspace_id) where deleted_at is null;

comment on table public.affiliate_order_forms is
  'An embeddable, single-product checkout an affiliate builds themselves from their portal. id is the public embed identifier (/order/:id) — there is no separate slug/token; a UUID is already unguessable. Every write goes through create_affiliate_order_form()/update_affiliate_order_form()/archive_affiliate_order_form() (all SECURITY DEFINER) — this table has no insert/update/delete RLS policy at all, only select.';

create table public.affiliate_order_form_packages (
  id uuid primary key default gen_random_uuid(),
  order_form_id uuid not null references public.affiliate_order_forms (id) on delete cascade,
  name text not null,
  quantity integer not null check (quantity > 0),
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  shipping_rule jsonb not null default '{"type": "free"}'::jsonb,
  position integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index affiliate_order_form_packages_form_id_idx on public.affiliate_order_form_packages (order_form_id);

comment on table public.affiliate_order_form_packages is
  'Quantity/price tiers for one affiliate_order_forms row. Same shipping_rule shape as landing_page_packages (consumed by the same compute_shipping_fee()). Written only via create_affiliate_order_form()/update_affiliate_order_form() — no direct-write RLS policy.';

alter table public.affiliate_order_forms enable row level security;
alter table public.affiliate_order_form_packages enable row level security;

create policy "select_affiliate_order_forms" on public.affiliate_order_forms
  for select to authenticated
  using (
    affiliate_id = public.current_affiliate_id()
    or (
      workspace_id in (select public.user_workspace_ids())
      and public.user_has_permission(workspace_id, 'campaigns.view')
    )
  );

create policy "select_affiliate_order_form_packages" on public.affiliate_order_form_packages
  for select to authenticated
  using (
    exists (
      select 1 from public.affiliate_order_forms f
      where f.id = affiliate_order_form_packages.order_form_id
        and (
          f.affiliate_id = public.current_affiliate_id()
          or (f.workspace_id in (select public.user_workspace_ids()) and public.user_has_permission(f.workspace_id, 'campaigns.view'))
        )
    )
  );


-- ----------------------------------------------------------------
-- PART G — create/update/archive an affiliate order form. All three
-- are SECURITY DEFINER, callable only by a logged-in affiliate
-- portal session (current_affiliate_id() must resolve), and
-- re-validate campaign access/activity every time rather than
-- trusting anything set at an earlier call.
-- ----------------------------------------------------------------
create or replace function public.create_affiliate_order_form(
  p_campaign_id uuid,
  p_product_id uuid,
  p_internal_title text,
  p_packages jsonb,
  p_theme_config jsonb default '{}'::jsonb,
  p_form_config jsonb default '{}'::jsonb
)
returns public.affiliate_order_forms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate_id uuid;
  v_campaign public.affiliate_campaigns%rowtype;
  v_form public.affiliate_order_forms%rowtype;
  v_pkg jsonb;
  v_position integer := 0;
begin
  v_affiliate_id := public.current_affiliate_id();
  if v_affiliate_id is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;

  if coalesce(trim(p_internal_title), '') = '' then
    raise exception 'A title for this form is required';
  end if;
  if p_packages is null or jsonb_array_length(p_packages) = 0 then
    raise exception 'At least one price option is required';
  end if;

  select * into v_campaign from public.affiliate_campaigns
    where id = p_campaign_id and status = 'ACTIVE' and deleted_at is null
      and (start_at is null or start_at <= now())
      and (end_at is null or end_at >= now());
  if not found then
    raise exception 'This campaign is not currently active';
  end if;

  if not ('CREATE_ORDER_FORMS' = any(v_campaign.allowed_activities)) then
    raise exception 'This campaign does not allow affiliates to create order forms';
  end if;

  if v_campaign.affiliate_access = 'SELECTED_AFFILIATES_ONLY' and not exists (
    select 1 from public.affiliate_campaign_affiliates
    where campaign_id = v_campaign.id and affiliate_id = v_affiliate_id and relationship = 'ACCESS'
  ) then
    raise exception 'You do not have access to this campaign';
  end if;

  if not exists (
    select 1 from public.affiliate_campaign_products where campaign_id = v_campaign.id and product_id = p_product_id
  ) then
    raise exception 'This product is not part of the campaign';
  end if;

  insert into public.affiliate_order_forms (
    workspace_id, brand_id, campaign_id, affiliate_id, product_id, internal_title, theme_config, form_config
  ) values (
    v_campaign.workspace_id, v_campaign.brand_id, v_campaign.id, v_affiliate_id, p_product_id,
    trim(p_internal_title), coalesce(p_theme_config, '{}'::jsonb), coalesce(p_form_config, '{}'::jsonb)
  )
  returning * into v_form;

  for v_pkg in select * from jsonb_array_elements(p_packages)
  loop
    if coalesce(nullif(trim(v_pkg ->> 'name'), ''), null) is null then
      raise exception 'Every price option needs a name';
    end if;
    if (v_pkg ->> 'quantity')::integer is null or (v_pkg ->> 'quantity')::integer <= 0 then
      raise exception 'Every price option needs a positive quantity';
    end if;
    if (v_pkg ->> 'price')::numeric is null or (v_pkg ->> 'price')::numeric < 0 then
      raise exception 'Every price option needs a non-negative price';
    end if;

    insert into public.affiliate_order_form_packages (
      order_form_id, name, quantity, price, compare_at_price, shipping_rule, position, is_default
    ) values (
      v_form.id, trim(v_pkg ->> 'name'), (v_pkg ->> 'quantity')::integer, (v_pkg ->> 'price')::numeric,
      nullif(v_pkg ->> 'compare_at_price', '')::numeric,
      coalesce(v_pkg -> 'shipping_rule', '{"type": "free"}'::jsonb),
      v_position, coalesce((v_pkg ->> 'is_default')::boolean, v_position = 0)
    );
    v_position := v_position + 1;
  end loop;

  return v_form;
end;
$$;

grant execute on function public.create_affiliate_order_form(uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.update_affiliate_order_form(
  p_form_id uuid,
  p_internal_title text,
  p_packages jsonb,
  p_theme_config jsonb default '{}'::jsonb,
  p_form_config jsonb default '{}'::jsonb,
  p_status text default 'ACTIVE'
)
returns public.affiliate_order_forms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate_id uuid;
  v_form public.affiliate_order_forms%rowtype;
  v_pkg jsonb;
  v_position integer := 0;
begin
  v_affiliate_id := public.current_affiliate_id();
  if v_affiliate_id is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;

  select * into v_form from public.affiliate_order_forms
    where id = p_form_id and affiliate_id = v_affiliate_id and deleted_at is null;
  if not found then
    raise exception 'Order form not found';
  end if;

  if coalesce(trim(p_internal_title), '') = '' then
    raise exception 'A title for this form is required';
  end if;
  if p_status not in ('ACTIVE', 'ARCHIVED') then
    raise exception 'Invalid status';
  end if;
  if p_status = 'ACTIVE' and (p_packages is null or jsonb_array_length(p_packages) = 0) then
    raise exception 'At least one price option is required';
  end if;

  update public.affiliate_order_forms set
    internal_title = trim(p_internal_title),
    theme_config = coalesce(p_theme_config, '{}'::jsonb),
    form_config = coalesce(p_form_config, '{}'::jsonb),
    status = p_status,
    updated_at = now()
  where id = p_form_id
  returning * into v_form;

  if p_packages is not null then
    delete from public.affiliate_order_form_packages where order_form_id = p_form_id;

    for v_pkg in select * from jsonb_array_elements(p_packages)
    loop
      if coalesce(nullif(trim(v_pkg ->> 'name'), ''), null) is null then
        raise exception 'Every price option needs a name';
      end if;
      if (v_pkg ->> 'quantity')::integer is null or (v_pkg ->> 'quantity')::integer <= 0 then
        raise exception 'Every price option needs a positive quantity';
      end if;
      if (v_pkg ->> 'price')::numeric is null or (v_pkg ->> 'price')::numeric < 0 then
        raise exception 'Every price option needs a non-negative price';
      end if;

      insert into public.affiliate_order_form_packages (
        order_form_id, name, quantity, price, compare_at_price, shipping_rule, position, is_default
      ) values (
        v_form.id, trim(v_pkg ->> 'name'), (v_pkg ->> 'quantity')::integer, (v_pkg ->> 'price')::numeric,
        nullif(v_pkg ->> 'compare_at_price', '')::numeric,
        coalesce(v_pkg -> 'shipping_rule', '{"type": "free"}'::jsonb),
        v_position, coalesce((v_pkg ->> 'is_default')::boolean, v_position = 0)
      );
      v_position := v_position + 1;
    end loop;
  end if;

  return v_form;
end;
$$;

grant execute on function public.update_affiliate_order_form(uuid, text, jsonb, jsonb, jsonb, text) to authenticated;

comment on function public.update_affiliate_order_form(uuid, text, jsonb, jsonb, jsonb, text) is
  'p_packages is optional (pass null to leave pricing untouched while only changing title/theme/status); when provided, it wholesale-replaces every existing package row for this form.';


-- ----------------------------------------------------------------
-- PART H — public, anonymous-callable: fetch a form to render it,
-- and submit an order through it.
-- ----------------------------------------------------------------
create or replace function public.get_public_affiliate_order_form(p_form_id uuid)
returns table (
  id uuid,
  internal_title text,
  theme_config jsonb,
  form_config jsonb,
  product_id uuid,
  product_name text,
  product_image_path text,
  brand_id uuid,
  brand_name text,
  workspace_country_code text,
  workspace_currency_code text,
  packages jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.id, f.internal_title, f.theme_config, f.form_config,
    p.id, p.name,
    (select ml.file_path from public.media_library ml
       where ml.bucket = 'products' and ml.entity_type = 'product' and ml.entity_id = p.id and ml.deleted_at is null
       order by ml.is_primary desc, ml.sort_order asc limit 1),
    b.id, b.name, w.country_code, w.currency_code,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fp.id, 'name', fp.name, 'quantity', fp.quantity, 'price', fp.price,
        'compare_at_price', fp.compare_at_price, 'is_default', fp.is_default
      ) order by fp.position)
      from public.affiliate_order_form_packages fp where fp.order_form_id = f.id
    ), '[]'::jsonb)
  from public.affiliate_order_forms f
  join public.products p on p.id = f.product_id and p.deleted_at is null
  join public.brands b on b.id = f.brand_id
  join public.workspaces w on w.id = f.workspace_id
  join public.affiliate_campaigns c on c.id = f.campaign_id and c.status = 'ACTIVE' and c.deleted_at is null
  join public.affiliates a on a.id = f.affiliate_id and a.approval_status = 'approved' and a.status = 'active' and a.deleted_at is null
  where f.id = p_form_id and f.status = 'ACTIVE' and f.deleted_at is null;
$$;

grant execute on function public.get_public_affiliate_order_form(uuid) to anon, authenticated;

comment on function public.get_public_affiliate_order_form(uuid) is
  'Public. Returns nothing (zero rows, not an error) if the form/campaign is not ACTIVE or the owning affiliate is no longer approved+active — the same fail-quiet-not-loud shape as create_public_order''s "page not available" gate, so an embedded form on a suspended affiliate''s external page simply stops rendering rather than exposing why.';


create or replace function public.create_affiliate_order_form_order(
  p_form_id uuid,
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
  p_submission_token text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.affiliate_order_forms%rowtype;
  v_campaign public.affiliate_campaigns%rowtype;
  v_package public.affiliate_order_form_packages%rowtype;
  v_product public.products%rowtype;
  v_workspace_country text;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_dial_code text;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_is_repeat boolean;
  v_order_number text;
  v_shipping numeric;
  v_total numeric;
  v_unit_price numeric;
  v_currency text;
begin
  select * into v_form from public.affiliate_order_forms
    where id = p_form_id and status = 'ACTIVE' and deleted_at is null;
  if not found then
    raise exception 'This form is not available';
  end if;

  select * into v_campaign from public.affiliate_campaigns
    where id = v_form.campaign_id and status = 'ACTIVE' and deleted_at is null;
  if not found then
    raise exception 'This form is not available';
  end if;

  if not exists (
    select 1 from public.affiliates
    where id = v_form.affiliate_id and approval_status = 'approved' and status = 'active' and deleted_at is null
  ) then
    raise exception 'This form is not available';
  end if;

  select * into v_package from public.affiliate_order_form_packages
    where id = p_package_id and order_form_id = v_form.id;
  if not found then
    raise exception 'This price option is not available';
  end if;

  select * into v_product from public.products where id = v_form.product_id and deleted_at is null;
  if not found then
    raise exception 'This product is not available';
  end if;

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Full name is required';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'Phone number is required';
  end if;
  if coalesce(trim(p_customer_address), '') = '' then
    raise exception 'Delivery address is required';
  end if;
  if coalesce(trim(p_customer_city), '') = '' then
    raise exception 'City is required';
  end if;
  if coalesce(trim(p_customer_state), '') = '' then
    raise exception 'State/Region is required';
  end if;

  if p_submission_token is not null then
    select * into v_existing from public.orders
      where workspace_id = v_form.workspace_id and idempotency_key = p_submission_token;
    if found then
      return v_existing;
    end if;
  end if;

  select country_code, currency_code into v_workspace_country, v_currency
    from public.workspaces where id = v_form.workspace_id;
  select dial_code into v_dial_code from public.countries where code = v_workspace_country;
  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select id into v_customer_id from public.customers
    where workspace_id = v_form.workspace_id and brand_id = v_form.brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, address_2, landmark, acquisition_source,
      created_by, updated_by
    ) values (
      v_form.workspace_id, v_form.brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      nullif(trim(p_customer_email), ''), v_workspace_country, p_customer_state, p_customer_city,
      trim(p_customer_address), p_customer_address_2, p_landmark, 'affiliate',
      null, null
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  v_shipping := public.compute_shipping_fee(v_package.shipping_rule, p_customer_state);
  v_total := v_package.price + v_shipping;
  v_order_number := public.generate_order_number(v_form.workspace_id);
  v_unit_price := case when v_package.quantity > 0 then round(v_package.price / v_package.quantity, 2) else v_package.price end;

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_address_2, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    source_detail, metadata, idempotency_key, is_repeat_customer,
    affiliate_id, affiliate_campaign_id,
    created_by, updated_by
  ) values (
    v_form.workspace_id, v_form.brand_id, v_order_number, 'affiliate', 'NEW', 'normal',
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), v_workspace_country,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_address_2, p_customer_notes,
    v_currency, v_package.price, v_shipping, 0, v_total,
    coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_package.price - coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_form.internal_title,
    jsonb_build_object(
      'affiliate_order_form_id', v_form.id, 'affiliate_order_form_package_id', v_package.id,
      'landmark', p_landmark, 'item_summary', v_package.name, 'item_quantity', v_package.quantity
    ),
    p_submission_token, v_is_repeat,
    v_form.affiliate_id, v_form.campaign_id,
    null, null
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, workspace_id, brand_id, product_id, product_name, sku,
    quantity, unit_price, unit_cost, compare_price, total_amount, metadata
  ) values (
    v_order.id, v_form.workspace_id, v_form.brand_id, v_product.id, v_product.name, v_product.sku,
    v_package.quantity, v_unit_price, v_product.cost_price, v_package.compare_at_price, v_package.price,
    jsonb_build_object('affiliate_order_form_package_id', v_package.id, 'package_name', v_package.name)
  );

  if v_product.track_inventory then
    perform public.adjust_inventory_internal(
      v_product.id, 'RESERVED', v_package.quantity,
      'Order ' || v_order_number || ' created (affiliate order form: ' || v_form.internal_title || ')', 'order', v_order.id
    );
  end if;

  -- Campaign/affiliate are already known up front here (unlike
  -- create_public_order's ?ref= path, which had to search for a
  -- matching campaign after the fact) — fire the commission engine
  -- immediately so a PER_ORDER_CREATED campaign pays out right away;
  -- process_affiliate_commission() itself no-ops for PER_DELIVERED_ORDER
  -- campaigns until the DELIVERED-status trigger fires later.
  perform public.process_affiliate_commission(v_order.id);

  return v_order;
end;
$$;

grant execute on function public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------
-- PART I — an affiliate portal session needs to discover WHICH
-- campaigns/products it may build a form for before it can call
-- create_affiliate_order_form() at all. affiliate_campaigns,
-- affiliate_campaign_products and products only had staff/workspace-
-- member SELECT policies until now (0009/0012/0024) — these are
-- additive (Postgres OR's multiple permissive policies together), so
-- staff access is unchanged; they only open a new, narrowly-scoped
-- read path for a logged-in affiliate.
--
-- affiliate_can_access_campaign() exists so these new policies never
-- run a raw subquery against affiliate_campaign_affiliates directly:
-- that table's OWN select policy queries back into
-- affiliate_campaigns for a campaigns.view permission check, and a
-- policy-to-policy round trip across the two tables is exactly what
-- Postgres reports as "infinite recursion detected in policy" —
-- SECURITY DEFINER here breaks the cycle by evaluating with the
-- function owner's privileges (RLS-bypassing), not the caller's.
-- ----------------------------------------------------------------
create or replace function public.affiliate_can_access_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.affiliate_campaigns c
    where c.id = p_campaign_id and c.status = 'ACTIVE' and c.deleted_at is null
      and 'CREATE_ORDER_FORMS' = any(c.allowed_activities)
      and (
        c.affiliate_access = 'ALL_APPROVED_AFFILIATES'
        or exists (
          select 1 from public.affiliate_campaign_affiliates ca
          where ca.campaign_id = c.id and ca.affiliate_id = public.current_affiliate_id() and ca.relationship = 'ACCESS'
        )
      )
  );
$$;

grant execute on function public.affiliate_can_access_campaign(uuid) to authenticated;

create policy "select_affiliate_campaigns_for_affiliate" on public.affiliate_campaigns
  for select to authenticated
  using (public.current_affiliate_id() is not null and public.affiliate_can_access_campaign(id));

create policy "select_affiliate_campaign_products_for_affiliate" on public.affiliate_campaign_products
  for select to authenticated
  using (public.current_affiliate_id() is not null and public.affiliate_can_access_campaign(campaign_id));

create policy "select_products_for_affiliate" on public.products
  for select to authenticated
  using (
    public.current_affiliate_id() is not null
    and exists (
      select 1 from public.affiliate_campaign_products cp
      where cp.product_id = products.id and public.affiliate_can_access_campaign(cp.campaign_id)
    )
  );

comment on function public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text) is
  'Public, anonymous-callable. The affiliate/campaign attribution on the resulting order comes entirely from p_form_id — there is no code or param a caller can supply to redirect attribution elsewhere. No Meta/TikTok pixel event is enqueued here (enqueue_tracking_event is landing-page-scoped and would silently no-op on a null landing_page_id anyway) — an affiliate''s embed lives on a page GCOS does not control and has no pixel configured against it.';


-- ----------------------------------------------------------------
-- PART J — the affiliate portal's own dashboard. affiliates/orders
-- have no "read your own row" policy at all until now (0024's
-- select_affiliates/select_orders are both workspace-member-only).
-- Rather than granting an affiliate raw SELECT on `orders` (which
-- would also hand them every customer's phone/address/email on any
-- order attributed to them — far more than a dashboard needs),
-- get_my_affiliate_dashboard() returns only the aggregate numbers and
-- a safe, PII-free slice of recent orders.
-- ----------------------------------------------------------------
create policy "select_affiliates_own_row" on public.affiliates
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy "select_affiliate_commissions_own" on public.affiliate_commissions
  for select to authenticated
  using (affiliate_id = public.current_affiliate_id());

create policy "select_affiliate_wallets_own" on public.affiliate_wallets
  for select to authenticated
  using (affiliate_id = public.current_affiliate_id());

create or replace function public.get_my_affiliate_dashboard()
returns table (
  total_orders bigint,
  total_revenue numeric,
  wallet_balance numeric,
  wallet_reserved_balance numeric,
  wallet_currency_code text,
  recent_orders jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.orders o where o.affiliate_id = public.current_affiliate_id() and o.deleted_at is null),
    (select coalesce(sum(o.total_amount), 0) from public.orders o where o.affiliate_id = public.current_affiliate_id() and o.deleted_at is null and o.status not in ('CANCELLED', 'RETURNED')),
    coalesce((select w.balance from public.affiliate_wallets w where w.affiliate_id = public.current_affiliate_id()), 0),
    coalesce((select w.reserved_balance from public.affiliate_wallets w where w.affiliate_id = public.current_affiliate_id()), 0),
    (select w.currency_code from public.affiliate_wallets w where w.affiliate_id = public.current_affiliate_id()),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number, 'status', o.status, 'total_amount', o.total_amount,
        'currency_code', o.currency_code, 'created_at', o.created_at
      ) order by o.created_at desc)
      from (
        select * from public.orders o2
        where o2.affiliate_id = public.current_affiliate_id() and o2.deleted_at is null
        order by o2.created_at desc
        limit 20
      ) o
    ), '[]'::jsonb);
$$;

grant execute on function public.get_my_affiliate_dashboard() to authenticated;

comment on function public.get_my_affiliate_dashboard() is
  'Public-to-authenticated but self-scoping: returns null-ish zeros for anyone whose auth.uid() is not a logged-in affiliate (current_affiliate_id() resolves to null), never another affiliate''s data. recent_orders deliberately excludes customer_name/phone/address/email — an affiliate does not need a customer''s personal details to see that their own order landed and what it is worth.';
