-- ============================================================
-- GOLDEN COMMERCE OS — Affiliate Portal v3, part 3: "My Offers"
-- (order bumps, upsells, downsells) — reusable, product-linked
-- promotional line items an affiliate manages once and attaches to
-- any number of their own order forms, distinct from the simpler
-- per-form "addons" (0057), which stay untouched.
--
-- Scope, stated plainly: ORDER_BUMP offers are fully wired end to
-- end — created here, shown as a checkbox on the public order form,
-- and priced into the order the same way addons are. UPSELL/
-- DOWNSELL offers are fully manageable (create/edit/pause, linked to
-- forms, counted in stats) but this migration does NOT build a
-- post-submit upsell/downsell interstitial page — that is a
-- genuinely separate checkout-flow feature, not implemented here.
-- An UPSELL/DOWNSELL offer will show 0 redemptions until that flow
-- exists.
-- ============================================================


-- ----------------------------------------------------------------
-- PART A — SUBMIT_ORDERS is validated by affiliate_can_access_campaign()
-- (0059) but has never actually been granted anywhere; add it next to
-- CREATE_ORDER_FORMS in the same check constraint documentation
-- (no schema change needed — allowed_activities is already a plain
-- text[] with no check constraint restricting its values).
-- ----------------------------------------------------------------
comment on column public.affiliate_campaigns.allowed_activities is
  'Free-form activity flags checked by affiliate_can_access_campaign(): CREATE_ORDER_FORMS (0056) and SUBMIT_ORDERS (0059, manual order entry + bulk import) are the two currently read anywhere.';


-- ----------------------------------------------------------------
-- PART B — affiliate_offers / affiliate_offer_forms.
-- ----------------------------------------------------------------
create table public.affiliate_offers (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  offer_type text not null check (offer_type in ('ORDER_BUMP', 'UPSELL', 'DOWNSELL')),
  product_id uuid not null references public.products (id) on delete cascade,
  internal_name text not null,
  headline text not null,
  description text,
  image_url text,
  cta_text text not null default 'Yes, add this to my order!',
  decline_text text not null default 'No thanks',
  quantity integer not null default 1 check (quantity > 0),
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  max_quantity integer check (max_quantity is null or max_quantity > 0),
  redeemed_count integer not null default 0,
  revenue_generated numeric(14, 2) not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index affiliate_offers_affiliate_id_idx on public.affiliate_offers (affiliate_id);

comment on table public.affiliate_offers is
  'Reusable promotional line items an affiliate creates once and attaches to any number of their own order forms via affiliate_offer_forms. redeemed_count/revenue_generated are denormalized counters incremented atomically by create_affiliate_order_form_order() — never recomputed from orders at read time, since a redemption is a point-in-time fact (an offer''s price can change after the fact without rewriting history).';

create table public.affiliate_offer_forms (
  offer_id uuid not null references public.affiliate_offers (id) on delete cascade,
  order_form_id uuid not null references public.affiliate_order_forms (id) on delete cascade,
  primary key (offer_id, order_form_id)
);

alter table public.affiliate_offers enable row level security;
alter table public.affiliate_offer_forms enable row level security;

create policy "select_affiliate_offers_own" on public.affiliate_offers
  for select to authenticated
  using (affiliate_id = public.current_affiliate_id());

create policy "select_affiliate_offer_forms_own" on public.affiliate_offer_forms
  for select to authenticated
  using (
    exists (select 1 from public.affiliate_offers o where o.id = affiliate_offer_forms.offer_id and o.affiliate_id = public.current_affiliate_id())
  );

-- No insert/update/delete policy on either table — all writes go
-- through the SECURITY DEFINER functions below, matching every other
-- affiliate-authored table in this schema (order forms, packages,
-- addons).


-- ----------------------------------------------------------------
-- PART C — create/update. product_id must belong to a campaign this
-- affiliate can access (either activity — an offer's product is
-- independent of which activity granted access); p_form_ids must
-- each be an order form this affiliate owns.
-- ----------------------------------------------------------------
create or replace function public.create_my_offer(
  p_offer_type text,
  p_product_id uuid,
  p_internal_name text,
  p_headline text,
  p_description text default null,
  p_image_url text default null,
  p_cta_text text default 'Yes, add this to my order!',
  p_decline_text text default 'No thanks',
  p_quantity integer default 1,
  p_price numeric default 0,
  p_compare_at_price numeric default null,
  p_max_quantity integer default null,
  p_form_ids uuid[] default '{}'::uuid[]
)
returns public.affiliate_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff uuid := public.current_affiliate_id();
  v_form_id uuid;
  v_offer public.affiliate_offers%rowtype;
begin
  if v_aff is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;
  if p_offer_type not in ('ORDER_BUMP', 'UPSELL', 'DOWNSELL') then
    raise exception 'Invalid offer type';
  end if;
  if coalesce(trim(p_internal_name), '') = '' then
    raise exception 'An internal name is required';
  end if;
  if coalesce(trim(p_headline), '') = '' then
    raise exception 'A customer-facing headline is required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive integer';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Offer price must be non-negative';
  end if;

  if not exists (
    select 1 from public.affiliate_campaign_products cp
    where cp.product_id = p_product_id
      and (public.affiliate_can_access_campaign(cp.campaign_id, 'CREATE_ORDER_FORMS') or public.affiliate_can_access_campaign(cp.campaign_id, 'SUBMIT_ORDERS'))
  ) then
    raise exception 'This product is not part of a campaign you have access to';
  end if;

  if p_form_ids is not null and array_length(p_form_ids, 1) > 0 then
    foreach v_form_id in array p_form_ids
    loop
      if not exists (select 1 from public.affiliate_order_forms where id = v_form_id and affiliate_id = v_aff) then
        raise exception 'One of the selected forms was not found';
      end if;
    end loop;
  end if;

  insert into public.affiliate_offers (
    affiliate_id, offer_type, product_id, internal_name, headline, description, image_url,
    cta_text, decline_text, quantity, price, compare_at_price, max_quantity
  ) values (
    v_aff, p_offer_type, p_product_id, trim(p_internal_name), trim(p_headline), nullif(trim(p_description), ''), nullif(trim(p_image_url), ''),
    coalesce(nullif(trim(p_cta_text), ''), 'Yes, add this to my order!'), coalesce(nullif(trim(p_decline_text), ''), 'No thanks'),
    p_quantity, p_price, p_compare_at_price, p_max_quantity
  )
  returning * into v_offer;

  if p_form_ids is not null then
    insert into public.affiliate_offer_forms (offer_id, order_form_id)
      select v_offer.id, unnest(p_form_ids);
  end if;

  return v_offer;
end;
$$;

grant execute on function public.create_my_offer(text, uuid, text, text, text, text, text, text, integer, numeric, numeric, integer, uuid[]) to authenticated;

create or replace function public.update_my_offer(
  p_offer_id uuid,
  p_internal_name text,
  p_headline text,
  p_description text default null,
  p_image_url text default null,
  p_cta_text text default 'Yes, add this to my order!',
  p_decline_text text default 'No thanks',
  p_quantity integer default 1,
  p_price numeric default 0,
  p_compare_at_price numeric default null,
  p_max_quantity integer default null,
  p_status text default 'ACTIVE',
  p_form_ids uuid[] default null
)
returns public.affiliate_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff uuid := public.current_affiliate_id();
  v_form_id uuid;
  v_offer public.affiliate_offers%rowtype;
begin
  if v_aff is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;

  select * into v_offer from public.affiliate_offers where id = p_offer_id and affiliate_id = v_aff;
  if not found then
    raise exception 'Offer not found';
  end if;

  if coalesce(trim(p_internal_name), '') = '' then
    raise exception 'An internal name is required';
  end if;
  if coalesce(trim(p_headline), '') = '' then
    raise exception 'A customer-facing headline is required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive integer';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Offer price must be non-negative';
  end if;
  if p_status not in ('ACTIVE', 'PAUSED') then
    raise exception 'Invalid status';
  end if;

  if p_form_ids is not null and array_length(p_form_ids, 1) > 0 then
    foreach v_form_id in array p_form_ids
    loop
      if not exists (select 1 from public.affiliate_order_forms where id = v_form_id and affiliate_id = v_aff) then
        raise exception 'One of the selected forms was not found';
      end if;
    end loop;
  end if;

  update public.affiliate_offers set
    internal_name = trim(p_internal_name),
    headline = trim(p_headline),
    description = nullif(trim(p_description), ''),
    image_url = nullif(trim(p_image_url), ''),
    cta_text = coalesce(nullif(trim(p_cta_text), ''), 'Yes, add this to my order!'),
    decline_text = coalesce(nullif(trim(p_decline_text), ''), 'No thanks'),
    quantity = p_quantity,
    price = p_price,
    compare_at_price = p_compare_at_price,
    max_quantity = p_max_quantity,
    status = p_status,
    updated_at = now()
  where id = p_offer_id
  returning * into v_offer;

  if p_form_ids is not null then
    delete from public.affiliate_offer_forms where offer_id = p_offer_id;
    insert into public.affiliate_offer_forms (offer_id, order_form_id)
      select p_offer_id, unnest(p_form_ids);
  end if;

  return v_offer;
end;
$$;

grant execute on function public.update_my_offer(uuid, text, text, text, text, text, text, integer, numeric, numeric, integer, text, uuid[]) to authenticated;

comment on function public.update_my_offer(uuid, text, text, text, text, text, text, integer, numeric, numeric, integer, text, uuid[]) is
  'p_form_ids is optional (pass null to leave linked forms untouched); when provided, wholesale-replaces the linked-forms set, same convention as update_affiliate_order_form''s p_packages/p_addons.';


-- ----------------------------------------------------------------
-- PART D — get_my_offers_with_stats(): conversion_rate is redemptions
-- as a share of orders placed through the offer's linked forms — the
-- honest metric available without a separate impression-tracking
-- system (there is no "shown but declined" event to count against).
-- ----------------------------------------------------------------
create or replace function public.get_my_offers_with_stats(p_offer_type text default null)
returns table (
  id uuid,
  offer_type text,
  product_id uuid,
  internal_name text,
  headline text,
  status text,
  price numeric,
  compare_at_price numeric,
  max_quantity integer,
  redeemed_count integer,
  revenue_generated numeric,
  linked_form_count bigint,
  linked_orders_count bigint,
  conversion_rate numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    o.id, o.offer_type, o.product_id, o.internal_name, o.headline, o.status, o.price, o.compare_at_price,
    o.max_quantity, o.redeemed_count, o.revenue_generated,
    coalesce(fc.linked_form_count, 0),
    coalesce(oc.linked_orders_count, 0),
    case when coalesce(oc.linked_orders_count, 0) = 0 then 0
      else round(100.0 * o.redeemed_count / oc.linked_orders_count, 1)
    end,
    o.created_at
  from public.affiliate_offers o
  left join lateral (
    select count(*) as linked_form_count from public.affiliate_offer_forms f where f.offer_id = o.id
  ) fc on true
  left join lateral (
    select count(*) as linked_orders_count
    from public.orders ord
    where ord.deleted_at is null
      and (ord.metadata ->> 'affiliate_order_form_id')::uuid in (
        select order_form_id from public.affiliate_offer_forms f where f.offer_id = o.id
      )
  ) oc on true
  where o.affiliate_id = public.current_affiliate_id()
    and (p_offer_type is null or o.offer_type = p_offer_type)
  order by o.created_at desc;
$$;

grant execute on function public.get_my_offers_with_stats(text) to authenticated;

create or replace function public.get_offer_linked_form_ids(p_offer_id uuid)
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(order_form_id), '{}'::uuid[])
  from public.affiliate_offer_forms f
  join public.affiliate_offers o on o.id = f.offer_id
  where f.offer_id = p_offer_id and o.affiliate_id = public.current_affiliate_id();
$$;

grant execute on function public.get_offer_linked_form_ids(uuid) to authenticated;


-- ----------------------------------------------------------------
-- PART E — wire ORDER_BUMP offers into the public order form.
-- get_public_affiliate_order_form() gains an `offers` array (DROP+
-- CREATE, output columns changed); create_affiliate_order_form_order()
-- gains a trailing p_offer_ids param (DROP+CREATE, same reasoning as
-- p_addon_ids in 0057 — appending a parameter creates a second,
-- ambiguous overload unless the old signature is dropped first).
-- ----------------------------------------------------------------
drop function if exists public.get_public_affiliate_order_form(uuid);

create function public.get_public_affiliate_order_form(p_form_id uuid)
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
  packages jsonb,
  addons jsonb,
  offers jsonb
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
        'compare_at_price', fp.compare_at_price, 'is_default', fp.is_default, 'badge', fp.badge
      ) order by fp.position)
      from public.affiliate_order_form_packages fp where fp.order_form_id = f.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', fa.id, 'name', fa.name, 'price', fa.price) order by fa.position)
      from public.affiliate_order_form_addons fa where fa.order_form_id = f.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ao.id, 'headline', ao.headline, 'description', ao.description, 'image_url', ao.image_url,
        'cta_text', ao.cta_text, 'decline_text', ao.decline_text, 'quantity', ao.quantity,
        'price', ao.price, 'compare_at_price', ao.compare_at_price
      ))
      from public.affiliate_offer_forms aof
      join public.affiliate_offers ao on ao.id = aof.offer_id
      where aof.order_form_id = f.id and ao.offer_type = 'ORDER_BUMP' and ao.status = 'ACTIVE'
        and (ao.max_quantity is null or ao.redeemed_count < ao.max_quantity)
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
  'Public. Returns nothing (zero rows, not an error) if the form/campaign is not ACTIVE or the owning affiliate is no longer approved+active. 0060 adds an offers array — ORDER_BUMP-type affiliate_offers linked to this form, still under their max_quantity cap. UPSELL/DOWNSELL offers are deliberately excluded here — there is no post-submit interstitial to show them in yet.';

drop function if exists public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid[]);

create function public.create_affiliate_order_form_order(
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
  p_submission_token text default null,
  p_addon_ids uuid[] default '{}'::uuid[],
  p_offer_ids uuid[] default '{}'::uuid[]
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
  v_addon_total numeric := 0;
  v_offer_total numeric := 0;
  v_total numeric;
  v_unit_price numeric;
  v_currency text;
  v_addon public.affiliate_order_form_addons%rowtype;
  v_addon_id uuid;
  v_offer public.affiliate_offers%rowtype;
  v_offer_id uuid;
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

  if p_addon_ids is not null and array_length(p_addon_ids, 1) > 0 then
    foreach v_addon_id in array p_addon_ids
    loop
      if not exists (select 1 from public.affiliate_order_form_addons where id = v_addon_id and order_form_id = v_form.id) then
        raise exception 'One of the selected add-ons is not available';
      end if;
    end loop;
    select coalesce(sum(price), 0) into v_addon_total
      from public.affiliate_order_form_addons where id = any(p_addon_ids) and order_form_id = v_form.id;
  end if;

  if p_offer_ids is not null and array_length(p_offer_ids, 1) > 0 then
    foreach v_offer_id in array p_offer_ids
    loop
      if not exists (
        select 1 from public.affiliate_offer_forms aof
        join public.affiliate_offers ao on ao.id = aof.offer_id
        where ao.id = v_offer_id and aof.order_form_id = v_form.id and ao.offer_type = 'ORDER_BUMP' and ao.status = 'ACTIVE'
          and (ao.max_quantity is null or ao.redeemed_count < ao.max_quantity)
      ) then
        raise exception 'One of the selected offers is not available';
      end if;
    end loop;
    select coalesce(sum(price), 0) into v_offer_total from public.affiliate_offers where id = any(p_offer_ids);
  end if;

  v_shipping := public.compute_shipping_fee(v_package.shipping_rule, p_customer_state);
  v_total := v_package.price + v_addon_total + v_offer_total + v_shipping;
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
    v_currency, v_package.price + v_addon_total + v_offer_total, v_shipping, 0, v_total,
    coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_package.price + v_addon_total + v_offer_total - coalesce(v_product.cost_price, 0) * v_package.quantity,
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

  if p_addon_ids is not null then
    for v_addon in select * from public.affiliate_order_form_addons where id = any(p_addon_ids) and order_form_id = v_form.id
    loop
      insert into public.order_items (
        order_id, workspace_id, brand_id, product_id, product_name,
        quantity, unit_price, total_amount, metadata
      ) values (
        v_order.id, v_form.workspace_id, v_form.brand_id, null, v_addon.name,
        1, v_addon.price, v_addon.price,
        jsonb_build_object('affiliate_order_form_addon_id', v_addon.id)
      );
    end loop;
  end if;

  if p_offer_ids is not null then
    for v_offer in select * from public.affiliate_offers where id = any(p_offer_ids)
    loop
      insert into public.order_items (
        order_id, workspace_id, brand_id, product_id, product_name,
        quantity, unit_price, total_amount, metadata
      ) values (
        v_order.id, v_form.workspace_id, v_form.brand_id, v_offer.product_id, v_offer.internal_name,
        v_offer.quantity, v_offer.price, v_offer.price,
        jsonb_build_object('affiliate_offer_id', v_offer.id)
      );

      update public.affiliate_offers
        set redeemed_count = redeemed_count + 1, revenue_generated = revenue_generated + v_offer.price
        where id = v_offer.id;
    end loop;
  end if;

  if v_product.track_inventory then
    perform public.adjust_inventory_internal(
      v_product.id, 'RESERVED', v_package.quantity,
      'Order ' || v_order_number || ' created (affiliate order form: ' || v_form.internal_title || ')', 'order', v_order.id
    );
  end if;

  perform public.process_affiliate_commission(v_order.id);

  return v_order;
end;
$$;

grant execute on function public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid[], uuid[]) to anon, authenticated;

comment on function public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid[], uuid[]) is
  'Public, anonymous-callable. 0060 adds p_offer_ids: each id must be an ACTIVE ORDER_BUMP offer linked to this exact form, priced from the stored row, and under its max_quantity cap (checked and incremented, though not with row-level locking — a max_quantity race is an accepted, low-stakes edge case for a promotional cap, unlike inventory or wallet balances).';
