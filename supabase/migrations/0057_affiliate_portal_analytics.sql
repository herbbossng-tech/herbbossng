-- ============================================================
-- GOLDEN COMMERCE OS — Affiliate Portal v2: analytics-grade
-- dashboard, campaign browsing/detail, richer order-form
-- authoring (badges + add-ons), form-level conversion stats,
-- and a dedicated "My Orders" view.
--
-- 0056 shipped the minimum viable affiliate portal (login,
-- dashboard, order-form CRUD, embed). This migration closes the
-- gap against a mature competitor affiliate console the user
-- benchmarked against, without inventing a promotions engine or
-- duplicating the shipping-fee logic that already exists.
-- ============================================================


-- ----------------------------------------------------------------
-- PART A — affiliate_campaigns.instructions: free-text guidance
-- staff can give affiliates about how to promote a campaign,
-- surfaced on the affiliate portal's campaign detail page.
-- ----------------------------------------------------------------
alter table public.affiliate_campaigns add column if not exists instructions text;

comment on column public.affiliate_campaigns.instructions is
  'Staff-authored promotion guidance shown to affiliates on the campaign detail page (e.g. "promote with ads on Facebook and TikTok"). Purely informational — never read by any RPC.';


-- ----------------------------------------------------------------
-- PART B — affiliate_order_form_views: a page-load ping from the
-- public embed/direct-link page, so the portal can show real
-- conversion rates (orders / views) instead of just an order count.
-- No RLS select/insert policy — every read goes through the
-- SECURITY DEFINER aggregate RPCs below, every write through
-- record_affiliate_order_form_view(), matching the no-direct-
-- access pattern order_items already uses.
-- ----------------------------------------------------------------
create table public.affiliate_order_form_views (
  id uuid primary key default gen_random_uuid(),
  order_form_id uuid not null references public.affiliate_order_forms (id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index affiliate_order_form_views_form_id_idx on public.affiliate_order_form_views (order_form_id, viewed_at);

comment on table public.affiliate_order_form_views is
  'One row per page-load of a public affiliate order form (direct link or embed iframe). Deliberately unauthenticated/undeduped — a simple view counter for conversion-rate math, not a fraud-proof analytics system.';

alter table public.affiliate_order_form_views enable row level security;

create or replace function public.record_affiliate_order_form_view(p_form_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.affiliate_order_form_views (order_form_id)
  select id from public.affiliate_order_forms where id = p_form_id and status = 'ACTIVE' and deleted_at is null;
$$;

grant execute on function public.record_affiliate_order_form_view(uuid) to anon, authenticated;

comment on function public.record_affiliate_order_form_view(uuid) is
  'Public, anonymous-callable. Silently no-ops for an inactive/missing form id, same fail-quiet shape as get_public_affiliate_order_form.';


-- ----------------------------------------------------------------
-- PART C — affiliate_order_form_packages.badge: a short label an
-- affiliate can attach to a price option ("Most Popular", "Buy 2
-- Get 1 Free") shown on the public form. Pricing/quantity stay the
-- single source of truth computed server-side; badge is display-
-- only, never interpreted by create_affiliate_order_form_order().
-- ----------------------------------------------------------------
alter table public.affiliate_order_form_packages add column if not exists badge text;


-- ----------------------------------------------------------------
-- PART D — affiliate_order_form_addons: optional flat-fee extras
-- a customer can add to their order from the public form (e.g.
-- "Add a travel pouch — +N2,000"). Not linked to a real product/
-- inventory row — these are informational upsell line items, kept
-- deliberately simple rather than building a second product catalog
-- inside the order-form builder.
-- ----------------------------------------------------------------
create table public.affiliate_order_form_addons (
  id uuid primary key default gen_random_uuid(),
  order_form_id uuid not null references public.affiliate_order_forms (id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index affiliate_order_form_addons_form_id_idx on public.affiliate_order_form_addons (order_form_id);

comment on table public.affiliate_order_form_addons is
  'Optional add-on line items for one affiliate_order_forms row. Written only via create_affiliate_order_form()/update_affiliate_order_form() — no direct-write RLS policy, matching affiliate_order_form_packages.';

alter table public.affiliate_order_form_addons enable row level security;

create policy "select_affiliate_order_form_addons" on public.affiliate_order_form_addons
  for select to authenticated
  using (
    exists (
      select 1 from public.affiliate_order_forms f
      where f.id = affiliate_order_form_addons.order_form_id
        and (
          f.affiliate_id = public.current_affiliate_id()
          or (f.workspace_id in (select public.user_workspace_ids()) and public.user_has_permission(f.workspace_id, 'campaigns.view'))
        )
    )
  );


-- ----------------------------------------------------------------
-- PART E — create_affiliate_order_form() / update_affiliate_order_form():
-- accept badge (inside each package object) and a new trailing
-- p_addons param. A function's identity in Postgres is its (name,
-- argument types) tuple, so appending a new parameter does NOT
-- replace the old signature via CREATE OR REPLACE — it creates a
-- second overload, and any call that only supplies the original
-- arguments then becomes ambiguous ("is not unique") between the
-- two defaulted candidates. The old signatures must be dropped
-- first.
-- ----------------------------------------------------------------
drop function if exists public.create_affiliate_order_form(uuid, uuid, text, jsonb, jsonb, jsonb);
drop function if exists public.update_affiliate_order_form(uuid, text, jsonb, jsonb, jsonb, text);
drop function if exists public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text);

create function public.create_affiliate_order_form(
  p_campaign_id uuid,
  p_product_id uuid,
  p_internal_title text,
  p_packages jsonb,
  p_theme_config jsonb default '{}'::jsonb,
  p_form_config jsonb default '{}'::jsonb,
  p_addons jsonb default '[]'::jsonb
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
  v_addon jsonb;
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
      order_form_id, name, quantity, price, compare_at_price, shipping_rule, badge, position, is_default
    ) values (
      v_form.id, trim(v_pkg ->> 'name'), (v_pkg ->> 'quantity')::integer, (v_pkg ->> 'price')::numeric,
      nullif(v_pkg ->> 'compare_at_price', '')::numeric,
      coalesce(v_pkg -> 'shipping_rule', '{"type": "free"}'::jsonb),
      nullif(trim(v_pkg ->> 'badge'), ''),
      v_position, coalesce((v_pkg ->> 'is_default')::boolean, v_position = 0)
    );
    v_position := v_position + 1;
  end loop;

  v_position := 0;
  for v_addon in select * from jsonb_array_elements(coalesce(p_addons, '[]'::jsonb))
  loop
    if coalesce(nullif(trim(v_addon ->> 'name'), ''), null) is null then
      raise exception 'Every add-on needs a name';
    end if;
    if (v_addon ->> 'price')::numeric is null or (v_addon ->> 'price')::numeric < 0 then
      raise exception 'Every add-on needs a non-negative price';
    end if;

    insert into public.affiliate_order_form_addons (order_form_id, name, price, position)
    values (v_form.id, trim(v_addon ->> 'name'), (v_addon ->> 'price')::numeric, v_position);
    v_position := v_position + 1;
  end loop;

  return v_form;
end;
$$;

grant execute on function public.create_affiliate_order_form(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

create function public.update_affiliate_order_form(
  p_form_id uuid,
  p_internal_title text,
  p_packages jsonb,
  p_theme_config jsonb default '{}'::jsonb,
  p_form_config jsonb default '{}'::jsonb,
  p_status text default 'ACTIVE',
  p_addons jsonb default null
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
  v_addon jsonb;
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
        order_form_id, name, quantity, price, compare_at_price, shipping_rule, badge, position, is_default
      ) values (
        v_form.id, trim(v_pkg ->> 'name'), (v_pkg ->> 'quantity')::integer, (v_pkg ->> 'price')::numeric,
        nullif(v_pkg ->> 'compare_at_price', '')::numeric,
        coalesce(v_pkg -> 'shipping_rule', '{"type": "free"}'::jsonb),
        nullif(trim(v_pkg ->> 'badge'), ''),
        v_position, coalesce((v_pkg ->> 'is_default')::boolean, v_position = 0)
      );
      v_position := v_position + 1;
    end loop;
  end if;

  if p_addons is not null then
    delete from public.affiliate_order_form_addons where order_form_id = p_form_id;

    v_position := 0;
    for v_addon in select * from jsonb_array_elements(p_addons)
    loop
      if coalesce(nullif(trim(v_addon ->> 'name'), ''), null) is null then
        raise exception 'Every add-on needs a name';
      end if;
      if (v_addon ->> 'price')::numeric is null or (v_addon ->> 'price')::numeric < 0 then
        raise exception 'Every add-on needs a non-negative price';
      end if;

      insert into public.affiliate_order_form_addons (order_form_id, name, price, position)
      values (v_form.id, trim(v_addon ->> 'name'), (v_addon ->> 'price')::numeric, v_position);
      v_position := v_position + 1;
    end loop;
  end if;

  return v_form;
end;
$$;

grant execute on function public.update_affiliate_order_form(uuid, text, jsonb, jsonb, jsonb, text, jsonb) to authenticated;

comment on function public.update_affiliate_order_form(uuid, text, jsonb, jsonb, jsonb, text, jsonb) is
  'p_packages/p_addons are each independently optional (pass null to leave that collection untouched); when provided, either wholesale-replaces its existing rows for this form.';


-- ----------------------------------------------------------------
-- PART F — get_public_affiliate_order_form(): DROP+CREATE (adding
-- output columns changes the function's return type, which
-- CREATE OR REPLACE cannot do) to also return each package's badge
-- and the form's addons.
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
  addons jsonb
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
  'Public. Returns nothing (zero rows, not an error) if the form/campaign is not ACTIVE or the owning affiliate is no longer approved+active. 0057 adds each package''s badge and the form''s addons array.';


-- ----------------------------------------------------------------
-- PART G — create_affiliate_order_form_order(): accept an optional
-- p_addon_ids array, priced from the form's own addons (never a
-- client-supplied amount), added to the order total as extra
-- order_items rows.
-- ----------------------------------------------------------------
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
  p_addon_ids uuid[] default '{}'::uuid[]
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
  v_total numeric;
  v_unit_price numeric;
  v_currency text;
  v_addon public.affiliate_order_form_addons%rowtype;
  v_addon_id uuid;
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

  -- Addon ids are trusted only as far as "belongs to this form" —
  -- price always comes from the stored row, never from the client.
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

  v_shipping := public.compute_shipping_fee(v_package.shipping_rule, p_customer_state);
  v_total := v_package.price + v_shipping + v_addon_total;
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
    v_currency, v_package.price + v_addon_total, v_shipping, 0, v_total,
    coalesce(v_product.cost_price, 0) * v_package.quantity,
    v_package.price + v_addon_total - coalesce(v_product.cost_price, 0) * v_package.quantity,
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

grant execute on function public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid[]) to anon, authenticated;

comment on function public.create_affiliate_order_form_order(uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid[]) is
  'Public, anonymous-callable. 0057 adds p_addon_ids: each id is verified to belong to this exact form and priced from the stored row, never a client-supplied amount, then added to subtotal/total as its own order_items row (product_id null — an informational upsell line, not a real product).';


-- ----------------------------------------------------------------
-- PART H — affiliate access to campaign promo materials. Reuses
-- affiliate_can_access_campaign() (0056) rather than inventing a
-- separate "materials" activity: if an affiliate can build an order
-- form for a campaign, they can also see its promo assets.
-- ----------------------------------------------------------------
create policy "select_affiliate_campaign_assets_for_affiliate" on public.affiliate_campaign_assets
  for select to authenticated
  using (public.current_affiliate_id() is not null and public.affiliate_can_access_campaign(campaign_id));


-- ----------------------------------------------------------------
-- PART I — get_my_affiliate_dashboard(): DROP+CREATE (return shape
-- changes substantially). Adds a date range (defaulting to the
-- trailing 14 days, matching the reference console's default),
-- period vs. prior-period conversion, a zero-filled daily revenue
-- series, best/average day, refund rate, and top products — while
-- keeping wallet balance and lifetime delivered-revenue/pending-
-- orders always-current (a running balance has no "period").
-- ----------------------------------------------------------------
drop function if exists public.get_my_affiliate_dashboard();

create function public.get_my_affiliate_dashboard(p_date_from date default null, p_date_to date default null)
returns table (
  period_from date,
  period_to date,
  total_orders bigint,
  delivered_orders bigint,
  total_revenue numeric,
  conversion_rate numeric,
  prior_conversion_rate numeric,
  best_day date,
  best_day_revenue numeric,
  avg_per_day numeric,
  refund_rate numeric,
  commission_earned numeric,
  daily_revenue jsonb,
  top_products jsonb,
  wallet_balance numeric,
  wallet_reserved_balance numeric,
  wallet_currency_code text,
  delivered_revenue numeric,
  pending_orders bigint,
  recent_orders jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_aff uuid := public.current_affiliate_id();
  v_from date := coalesce(p_date_from, current_date - 13);
  v_to date := coalesce(p_date_to, current_date);
  v_from_ts timestamptz := v_from::timestamptz;
  v_to_ts timestamptz := (v_to + 1)::timestamptz;
  v_days integer := greatest(v_to - v_from + 1, 1);
  v_prior_from_ts timestamptz := v_from_ts - make_interval(days => v_days);
  v_prior_to_ts timestamptz := v_from_ts;
  v_period_orders bigint;
  v_period_views bigint;
  v_prior_orders bigint;
  v_prior_views bigint;
begin
  select count(*) into v_period_orders from public.orders o
    where o.affiliate_id = v_aff and o.deleted_at is null and o.created_at >= v_from_ts and o.created_at < v_to_ts;
  select count(*) into v_period_views from public.affiliate_order_form_views v
    join public.affiliate_order_forms f on f.id = v.order_form_id
    where f.affiliate_id = v_aff and v.viewed_at >= v_from_ts and v.viewed_at < v_to_ts;

  select count(*) into v_prior_orders from public.orders o
    where o.affiliate_id = v_aff and o.deleted_at is null and o.created_at >= v_prior_from_ts and o.created_at < v_prior_to_ts;
  select count(*) into v_prior_views from public.affiliate_order_form_views v
    join public.affiliate_order_forms f on f.id = v.order_form_id
    where f.affiliate_id = v_aff and v.viewed_at >= v_prior_from_ts and v.viewed_at < v_prior_to_ts;

  return query
  select
    v_from, v_to,
    v_period_orders,
    (select count(*) from public.orders o where o.affiliate_id = v_aff and o.deleted_at is null
       and o.created_at >= v_from_ts and o.created_at < v_to_ts and o.status = 'DELIVERED'),
    (select coalesce(sum(o.total_amount), 0) from public.orders o where o.affiliate_id = v_aff and o.deleted_at is null
       and o.created_at >= v_from_ts and o.created_at < v_to_ts and o.status not in ('CANCELLED', 'RETURNED')),
    case when v_period_views = 0 then 0 else round(100.0 * v_period_orders / v_period_views, 1) end,
    case when v_prior_views = 0 then 0 else round(100.0 * v_prior_orders / v_prior_views, 1) end,
    (select d.day from (
        select gs::date as day, coalesce(sum(o.total_amount), 0) as revenue
        from generate_series(v_from, v_to, interval '1 day') gs
        left join public.orders o on o.affiliate_id = v_aff and o.deleted_at is null
          and o.status not in ('CANCELLED', 'RETURNED') and o.created_at >= gs and o.created_at < gs + interval '1 day'
        group by gs
      ) d
      order by d.revenue desc, d.day asc limit 1),
    (select d.revenue from (
        select gs::date as day, coalesce(sum(o.total_amount), 0) as revenue
        from generate_series(v_from, v_to, interval '1 day') gs
        left join public.orders o on o.affiliate_id = v_aff and o.deleted_at is null
          and o.status not in ('CANCELLED', 'RETURNED') and o.created_at >= gs and o.created_at < gs + interval '1 day'
        group by gs
      ) d
      order by d.revenue desc, d.day asc limit 1),
    round((select coalesce(sum(o.total_amount), 0) from public.orders o where o.affiliate_id = v_aff and o.deleted_at is null
       and o.created_at >= v_from_ts and o.created_at < v_to_ts and o.status not in ('CANCELLED', 'RETURNED')) / v_days, 2),
    case when v_period_orders = 0 then 0 else round(100.0 * (
      select count(*) from public.orders o where o.affiliate_id = v_aff and o.deleted_at is null
        and o.created_at >= v_from_ts and o.created_at < v_to_ts and o.status = 'RETURNED'
    ) / v_period_orders, 1) end,
    (select coalesce(sum(c.commission_amount), 0) from public.affiliate_commissions c
       where c.affiliate_id = v_aff and c.status = 'ELIGIBLE' and c.created_at >= v_from_ts and c.created_at < v_to_ts),
    (select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'revenue', d.revenue) order by d.day), '[]'::jsonb)
       from (
         select gs::date as day, coalesce(sum(o.total_amount), 0) as revenue
         from generate_series(v_from, v_to, interval '1 day') gs
         left join public.orders o on o.affiliate_id = v_aff and o.deleted_at is null
           and o.status not in ('CANCELLED', 'RETURNED') and o.created_at >= gs and o.created_at < gs + interval '1 day'
         group by gs
       ) d),
    (select coalesce(jsonb_agg(jsonb_build_object('product_name', t.product_name, 'orders', t.orders, 'revenue', t.revenue) order by t.revenue desc), '[]'::jsonb)
       from (
         select oi.product_name, count(distinct oi.order_id) as orders, sum(oi.total_amount) as revenue
         from public.order_items oi
         join public.orders o on o.id = oi.order_id
         where o.affiliate_id = v_aff and o.deleted_at is null and o.created_at >= v_from_ts and o.created_at < v_to_ts
         group by oi.product_name
         order by sum(oi.total_amount) desc
         limit 5
       ) t),
    coalesce((select w.balance from public.affiliate_wallets w where w.affiliate_id = v_aff), 0),
    coalesce((select w.reserved_balance from public.affiliate_wallets w where w.affiliate_id = v_aff), 0),
    (select w.currency_code from public.affiliate_wallets w where w.affiliate_id = v_aff),
    (select coalesce(sum(o.total_amount), 0) from public.orders o where o.affiliate_id = v_aff and o.deleted_at is null and o.status = 'DELIVERED'),
    (select count(*) from public.orders o where o.affiliate_id = v_aff and o.deleted_at is null and o.status not in ('DELIVERED', 'CANCELLED', 'RETURNED')),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number, 'status', o.status, 'total_amount', o.total_amount,
        'currency_code', o.currency_code, 'created_at', o.created_at
      ) order by o.created_at desc)
      from (
        select * from public.orders o2
        where o2.affiliate_id = v_aff and o2.deleted_at is null
        order by o2.created_at desc
        limit 20
      ) o
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_affiliate_dashboard(date, date) to authenticated;

comment on function public.get_my_affiliate_dashboard(date, date) is
  'Self-scoping via current_affiliate_id() — returns all-zero/empty rows for a non-affiliate session, never another affiliate''s data. p_date_from/p_date_to default to the trailing 14 days. wallet_balance/wallet_reserved_balance/delivered_revenue/pending_orders are always lifetime-current, not period-scoped, since a wallet balance has no "period". recent_orders stays PII-free (no customer_name/phone/address/email).';


-- ----------------------------------------------------------------
-- PART J — get_my_affiliate_orders(): a "My Orders" listing across
-- every one of the affiliate's forms, same PII-minimization as the
-- dashboard's recent_orders.
-- ----------------------------------------------------------------
create or replace function public.get_my_affiliate_orders(p_status text default null, p_limit integer default 20, p_offset integer default 0)
returns table (
  order_number text,
  status text,
  total_amount numeric,
  currency_code text,
  created_at timestamptz,
  source_detail text,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select o.order_number, o.status, o.total_amount, o.currency_code, o.created_at, o.source_detail,
    count(*) over() as total_count
  from public.orders o
  where o.affiliate_id = public.current_affiliate_id() and o.deleted_at is null
    and (p_status is null or o.status = p_status)
  order by o.created_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_my_affiliate_orders(text, integer, integer) to authenticated;

comment on function public.get_my_affiliate_orders(text, integer, integer) is
  'Self-scoping via current_affiliate_id(). PII-free, same shape as get_my_affiliate_dashboard''s recent_orders but paginated and filterable by status for a dedicated My Orders page.';


-- ----------------------------------------------------------------
-- PART K — get_my_order_forms_with_stats(): the affiliate's own
-- order forms plus per-form order/view counts and conversion rate,
-- for a stats-and-table "My Forms" page.
-- ----------------------------------------------------------------
create or replace function public.get_my_order_forms_with_stats()
returns table (
  id uuid,
  internal_title text,
  status text,
  product_id uuid,
  campaign_id uuid,
  created_at timestamptz,
  orders_count bigint,
  views_count bigint,
  conversion_rate numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.id, f.internal_title, f.status, f.product_id, f.campaign_id, f.created_at,
    coalesce(oc.orders_count, 0),
    coalesce(vc.views_count, 0),
    case when coalesce(vc.views_count, 0) = 0 then 0
      else round(100.0 * coalesce(oc.orders_count, 0) / vc.views_count, 1)
    end
  from public.affiliate_order_forms f
  left join lateral (
    select count(*) as orders_count from public.orders o
    where o.deleted_at is null and (o.metadata ->> 'affiliate_order_form_id')::uuid = f.id
  ) oc on true
  left join lateral (
    select count(*) as views_count from public.affiliate_order_form_views v where v.order_form_id = f.id
  ) vc on true
  where f.affiliate_id = public.current_affiliate_id() and f.deleted_at is null
  order by f.created_at desc;
$$;

grant execute on function public.get_my_order_forms_with_stats() to authenticated;


-- ----------------------------------------------------------------
-- PART L — get_my_order_form_submissions(): PII-minimized orders
-- for one specific form, for the "View Submissions" row action.
-- Ownership is explicitly checked (unlike the self-scoping SQL
-- functions above) since this takes a specific form id as input.
-- ----------------------------------------------------------------
create or replace function public.get_my_order_form_submissions(p_form_id uuid, p_limit integer default 50, p_offset integer default 0)
returns table (
  order_number text,
  status text,
  total_amount numeric,
  currency_code text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff uuid;
begin
  v_aff := public.current_affiliate_id();
  if v_aff is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;

  if not exists (select 1 from public.affiliate_order_forms where id = p_form_id and affiliate_id = v_aff) then
    raise exception 'Order form not found';
  end if;

  return query
    select o.order_number, o.status, o.total_amount, o.currency_code, o.created_at, count(*) over() as total_count
    from public.orders o
    where o.deleted_at is null and (o.metadata ->> 'affiliate_order_form_id')::uuid = p_form_id
    order by o.created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.get_my_order_form_submissions(uuid, integer, integer) to authenticated;


-- ----------------------------------------------------------------
-- PART M — the 'affiliates' storage bucket's existing read policy
-- (0024) only allows a staff/workspace-member session
-- (user_workspace_ids()) to read objects, so an affiliate could see
-- a campaign's promo assets in PART H's new table policy but never
-- actually fetch the file. Path convention is
-- `${workspace_id}/${campaign_id}/...` (0024's own comment), so the
-- campaign id is the second folder segment.
-- ----------------------------------------------------------------
create policy "affiliates_bucket_read_for_affiliate" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'affiliates'
    and public.current_affiliate_id() is not null
    and public.affiliate_can_access_campaign((storage.foldername(name))[2]::uuid)
  );
