-- ============================================================
-- GOLDEN COMMERCE OS — Affiliate Portal v3, part 2: affiliate
-- manual order entry (single order, and the row-by-row target for
-- bulk CSV import). Distinct from the self-service embed order
-- form (0056/0057): here the AFFILIATE is the one typing in a
-- customer's details (a phone/DM order), not the end customer, so
-- the order is deliberately unverified until ops reviews it — it
-- starts at the existing 'PENDING' status rather than 'NEW', with
-- no affiliate-set shipping fee (ops sets that on review, same as
-- every other 'PENDING' order in the system).
-- ============================================================


-- ----------------------------------------------------------------
-- PART A — generalize affiliate_can_access_campaign() to check any
-- activity, not just 'CREATE_ORDER_FORMS'. Five RLS policies (0056/
-- 0057) already depend on the 1-argument signature, so it can't be
-- dropped directly — each dependent policy is dropped first and
-- recreated verbatim afterward (still calling with one argument,
-- which resolves against the new function's default just fine).
-- ----------------------------------------------------------------
drop policy "select_affiliate_campaigns_for_affiliate" on public.affiliate_campaigns;
drop policy "select_affiliate_campaign_products_for_affiliate" on public.affiliate_campaign_products;
drop policy "select_products_for_affiliate" on public.products;
drop policy "select_affiliate_campaign_assets_for_affiliate" on public.affiliate_campaign_assets;
drop policy "affiliates_bucket_read_for_affiliate" on storage.objects;

drop function public.affiliate_can_access_campaign(uuid);

create function public.affiliate_can_access_campaign(p_campaign_id uuid, p_activity text default 'CREATE_ORDER_FORMS')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.affiliate_campaigns c
    where c.id = p_campaign_id and c.status = 'ACTIVE' and c.deleted_at is null
      and p_activity = any(c.allowed_activities)
      and (
        c.affiliate_access = 'ALL_APPROVED_AFFILIATES'
        or exists (
          select 1 from public.affiliate_campaign_affiliates ca
          where ca.campaign_id = c.id and ca.affiliate_id = public.current_affiliate_id() and ca.relationship = 'ACCESS'
        )
      )
  );
$$;

grant execute on function public.affiliate_can_access_campaign(uuid, text) to authenticated;

comment on function public.affiliate_can_access_campaign(uuid, text) is
  'p_activity defaults to CREATE_ORDER_FORMS (0056 behavior unchanged). 0059 adds the SUBMIT_ORDERS activity for manual order entry — a campaign can grant either, both, or neither independently.';

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

create policy "select_affiliate_campaign_assets_for_affiliate" on public.affiliate_campaign_assets
  for select to authenticated
  using (public.current_affiliate_id() is not null and public.affiliate_can_access_campaign(campaign_id));

create policy "affiliates_bucket_read_for_affiliate" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'affiliates'
    and public.current_affiliate_id() is not null
    and public.affiliate_can_access_campaign((storage.foldername(name))[2]::uuid)
  );


-- ----------------------------------------------------------------
-- PART B — create_affiliate_manual_order(): the affiliate portal's
-- own order-creation RPC, mirroring create_affiliate_order_form_order()
-- (0056) for customer find-or-create/attribution/commission, but
-- priced directly from the campaign's product (no order-form
-- packages involved) and always landing on PENDING.
-- ----------------------------------------------------------------
create or replace function public.create_affiliate_manual_order(
  p_campaign_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_state text,
  p_customer_city text,
  p_customer_email text default null,
  p_customer_notes text default null,
  p_idempotency_key text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff_id uuid := public.current_affiliate_id();
  v_affiliate public.affiliates%rowtype;
  v_campaign public.affiliate_campaigns%rowtype;
  v_product public.products%rowtype;
  v_existing public.orders%rowtype;
  v_order public.orders%rowtype;
  v_workspace_country text;
  v_dial_code text;
  v_canonical_phone text;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_is_repeat boolean;
  v_order_number text;
  v_subtotal numeric;
  v_currency text;
begin
  if v_aff_id is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;
  select * into v_affiliate from public.affiliates where id = v_aff_id;

  select * into v_campaign from public.affiliate_campaigns
    where id = p_campaign_id and status = 'ACTIVE' and deleted_at is null
      and (start_at is null or start_at <= now())
      and (end_at is null or end_at >= now());
  if not found then
    raise exception 'This campaign is not currently active';
  end if;

  if not public.affiliate_can_access_campaign(p_campaign_id, 'SUBMIT_ORDERS') then
    raise exception 'This campaign does not allow affiliates to submit orders';
  end if;

  if not exists (
    select 1 from public.affiliate_campaign_products where campaign_id = p_campaign_id and product_id = p_product_id
  ) then
    raise exception 'This product is not part of the campaign';
  end if;

  select * into v_product from public.products where id = p_product_id and deleted_at is null;
  if not found then
    raise exception 'This product is not available';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive integer';
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

  if p_idempotency_key is not null then
    select * into v_existing from public.orders
      where workspace_id = v_campaign.workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select country_code, currency_code into v_workspace_country, v_currency from public.workspaces where id = v_campaign.workspace_id;
  select dial_code into v_dial_code from public.countries where code = v_workspace_country;
  v_canonical_phone := public.normalize_phone(p_customer_phone, v_dial_code);
  v_first_name := split_part(trim(p_customer_name), ' ', 1);
  v_last_name := nullif(trim(substring(trim(p_customer_name) from length(v_first_name) + 1)), '');

  select id into v_customer_id from public.customers
    where workspace_id = v_campaign.workspace_id and brand_id = v_campaign.brand_id
      and canonical_phone = v_canonical_phone and deleted_at is null;

  if not found then
    insert into public.customers (
      workspace_id, brand_id, first_name, last_name, full_name, phone, canonical_phone,
      email, country_code, state, city, address, acquisition_source, created_by, updated_by
    ) values (
      v_campaign.workspace_id, v_campaign.brand_id, v_first_name, v_last_name, trim(p_customer_name), trim(p_customer_phone), v_canonical_phone,
      nullif(trim(p_customer_email), ''), v_workspace_country, p_customer_state, p_customer_city, trim(p_customer_address), 'affiliate',
      null, null
    )
    on conflict (workspace_id, brand_id, canonical_phone) where deleted_at is null
      do update set updated_at = now()
    returning id into v_customer_id;
  end if;

  select exists(
    select 1 from public.orders where customer_id = v_customer_id and deleted_at is null
  ) into v_is_repeat;

  v_subtotal := v_product.selling_price * p_quantity;
  v_order_number := public.generate_order_number(v_campaign.workspace_id);

  insert into public.orders (
    workspace_id, brand_id, order_number, source, status, priority,
    customer_id, customer_name, customer_phone, customer_email, customer_country_code,
    customer_state, customer_city, customer_address, customer_notes,
    currency_code, subtotal, shipping_fee, discount_amount, total_amount,
    cost_amount, expected_profit,
    source_detail, metadata, idempotency_key, is_repeat_customer,
    affiliate_id, affiliate_campaign_id,
    created_by, updated_by
  ) values (
    v_campaign.workspace_id, v_campaign.brand_id, v_order_number, 'affiliate', 'PENDING', 'normal',
    v_customer_id, trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), v_workspace_country,
    p_customer_state, p_customer_city, trim(p_customer_address), p_customer_notes,
    v_currency, v_subtotal, 0, 0, v_subtotal,
    coalesce(v_product.cost_price, 0) * p_quantity,
    v_subtotal - coalesce(v_product.cost_price, 0) * p_quantity,
    v_campaign.name,
    jsonb_build_object(
      'affiliate_manual_entry', true, 'item_summary', v_product.name || ' x' || p_quantity, 'item_quantity', p_quantity
    ),
    p_idempotency_key, v_is_repeat,
    v_aff_id, v_campaign.id,
    null, null
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, workspace_id, brand_id, product_id, product_name, sku,
    quantity, unit_price, unit_cost, compare_price, total_amount
  ) values (
    v_order.id, v_campaign.workspace_id, v_campaign.brand_id, v_product.id, v_product.name, v_product.sku,
    p_quantity, v_product.selling_price, v_product.cost_price, v_product.compare_price, v_subtotal
  );

  if v_product.track_inventory then
    perform public.adjust_inventory_internal(
      v_product.id, 'RESERVED', p_quantity,
      'Order ' || v_order_number || ' created (affiliate manual entry: ' || v_campaign.name || ')', 'order', v_order.id
    );
  end if;

  perform public.process_affiliate_commission(v_order.id);

  return v_order;
end;
$$;

grant execute on function public.create_affiliate_manual_order(uuid, uuid, integer, text, text, text, text, text, text, text, text) to authenticated;

comment on function public.create_affiliate_manual_order(uuid, uuid, integer, text, text, text, text, text, text, text, text) is
  'Affiliate-authenticated only (unlike create_affiliate_order_form_order, which is anonymous-callable) — this is the affiliate hand-entering an order on their own behalf, not a public checkout page. Always lands on PENDING with shipping_fee=0; ops sets the real shipping fee and moves it forward through the normal order-status lifecycle like any other manually-entered order.';
