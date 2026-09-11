-- ============================================================
-- Public order form required fields (0041) — dedicated
-- regression/security suite. The frontend's zod schema already
-- required Full Name/Phone/Address/City/State (min length 1), but
-- create_public_order() — the real security boundary, since a
-- malicious client can call the RPC directly and skip the frontend
-- entirely — only ever validated Name/Phone/Address as non-empty.
-- p_customer_state/p_customer_city were declared `default null` and
-- never checked. This suite calls the RPC directly (bypassing any
-- frontend validation) to prove the server itself now rejects a
-- missing or whitespace-only city/state, and that a fully valid
-- submission still succeeds and persists both fields correctly.
--
-- Run against a freshly migrated 0001-0041 database with
-- 00_bootstrap_post_migration.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'owner-rf@test.local');

do $$
declare
  v_ws uuid; v_brand uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000f2';
  v_cat uuid; v_prod uuid; v_page uuid; v_pkg uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('RF WS', 'rf-ws', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by)
    values (v_ws, 'RF Brand', 'rf-brand', v_owner) returning id into v_brand;
  insert into public.categories (workspace_id, brand_id, name, slug)
    values (v_ws, v_brand, 'Cat', 'rf-cat') returning id into v_cat;
  insert into public.products (workspace_id, brand_id, category_id, name, slug, sku, selling_price, cost_price, stock_quantity, status, track_inventory)
    values (v_ws, v_brand, v_cat, 'RF Prod', 'rf-prod', 'RF-SKU', 5000, 2000, 100, 'active', false) returning id into v_prod;
  insert into public.landing_pages (workspace_id, brand_id, product_id, name, slug, status, market_country_code, market_currency_code)
    values (v_ws, v_brand, v_prod, 'RF Page', 'rf-page', 'published', 'NG', 'NGN') returning id into v_page;
  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, price, quantity, enabled)
    values (v_page, v_ws, v_brand, 'Pkg 1', 5000, 1, true) returning id into v_pkg;
end $$;

\echo '=== 1. Missing city rejected by RPC directly (bypassing frontend) ==='
do $$
declare v_page uuid; v_pkg uuid; v_failed boolean := false; v_msg text;
begin
  select id into v_page from public.landing_pages where slug = 'rf-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  begin
    perform public.create_public_order(
      'rf-page', v_pkg, 'John Doe', '08012345678', '123 Main St',
      'Lagos', null -- state provided, city omitted
    );
  exception when others then
    v_failed := true;
    get stacked diagnostics v_msg = message_text;
  end;
  assert v_failed, 'missing city must be rejected';
  assert v_msg = 'City is required', format('expected City is required, got: %s', v_msg);
  raise notice 'OK 1: missing city rejected server-side (%).', v_msg;
end $$;

\echo '=== 2. Missing state rejected by RPC directly ==='
do $$
declare v_page uuid; v_pkg uuid; v_failed boolean := false; v_msg text;
begin
  select id into v_page from public.landing_pages where slug = 'rf-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  begin
    perform public.create_public_order(
      'rf-page', v_pkg, 'John Doe', '08012345678', '123 Main St',
      null, 'Ikeja' -- state omitted, city provided
    );
  exception when others then
    v_failed := true;
    get stacked diagnostics v_msg = message_text;
  end;
  assert v_failed, 'missing state must be rejected';
  assert v_msg = 'State/Region is required', format('expected State/Region is required, got: %s', v_msg);
  raise notice 'OK 2: missing state rejected server-side (%).', v_msg;
end $$;

\echo '=== 3. Whitespace-only city/state also rejected (not just NULL) ==='
do $$
declare v_page uuid; v_pkg uuid; v_failed boolean := false; v_msg text;
begin
  select id into v_page from public.landing_pages where slug = 'rf-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  begin
    perform public.create_public_order('rf-page', v_pkg, 'John Doe', '08012345678', '123 Main St', '   ', '   ');
  exception when others then
    v_failed := true;
    get stacked diagnostics v_msg = message_text;
  end;
  assert v_failed, 'whitespace-only city/state must be rejected, not treated as provided';
  assert v_msg in ('City is required', 'State/Region is required'), format('expected a required-field rejection, got: %s', v_msg);
  raise notice 'OK 3: whitespace-only city/state rejected (%).', v_msg;
end $$;

\echo '=== 4. Complete, valid submission succeeds and persists state/city ==='
do $$
declare v_page uuid; v_pkg uuid; v_order public.orders%rowtype;
begin
  select id into v_page from public.landing_pages where slug = 'rf-page';
  select id into v_pkg from public.landing_page_packages where landing_page_id = v_page;
  select * into v_order from public.create_public_order('rf-page', v_pkg, 'John Doe', '08012345678', '123 Main St', 'Lagos', 'Ikeja');
  assert v_order.customer_state = 'Lagos' and v_order.customer_city = 'Ikeja', 'a valid submission must persist state/city correctly';
  raise notice 'OK 4: complete valid submission succeeds and persists state/city.';
end $$;

\echo '=== ALL REQUIRED-FIELD TESTS PASSED ==='
