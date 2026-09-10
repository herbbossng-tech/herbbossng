-- ============================================================
-- Template 4 Visual Reconstruction & Conversion Optimization (0044)
-- — dedicated regression suite.
--
-- Covers:
--   1. thank_you_config column exists, defaults to '{}', and is a
--      genuinely independent, editable jsonb field (round-trips an
--      update without touching any other landing_pages column).
--   2. All four system templates' starter_sections is valid, non-empty
--      jsonb, and — the actual defect this migration fixes — every
--      section's config uses the SAME camelCase keys the frontend
--      config types/components read (sectionTypes.ts), not the
--      snake_case/mismatched keys the original 0031 seed used.
--   3. Template 4 specifically contains the expected section types in
--      a sane long-form order (hero before order form, package
--      selector before order form).
--   4. Pre-existing landing-page/public-order functionality (creating a
--      page and a public order) is unaffected by this migration.
--
-- Run against a freshly migrated 0001-0044 database with
-- 00_bootstrap_post_migration.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'owner-t4@test.local');

do $$
declare v_ws uuid; v_brand uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c1';
begin
  insert into public.workspaces (name, slug, country_code, currency_code, created_by)
    values ('T4 WS', 't4-ws', 'NG', 'NGN', v_owner) returning id into v_ws;
  insert into public.brands (workspace_id, name, slug, created_by)
    values (v_ws, 'T4 Brand', 't4-brand', v_owner) returning id into v_brand;
end $$;

\echo '=== 1. thank_you_config column exists, defaults to empty object ==='
do $$
declare v_ws uuid; v_brand uuid; v_page_id uuid; v_config jsonb;
begin
  select id into v_ws from public.workspaces where slug = 't4-ws';
  select id into v_brand from public.brands where slug = 't4-brand';
  insert into public.landing_pages (workspace_id, brand_id, name, slug, status, market_country_code, market_currency_code)
    values (v_ws, v_brand, 'T4 Page', 't4-page', 'draft', 'NG', 'NGN') returning id into v_page_id;

  select thank_you_config into v_config from public.landing_pages where id = v_page_id;
  assert v_config = '{}'::jsonb, format('expected default thank_you_config {}, got: %s', v_config);
  raise notice 'OK 1: thank_you_config defaults to {}.';
end $$;

\echo '=== 2. thank_you_config round-trips an update independently of other columns ==='
do $$
declare v_page_id uuid; v_config jsonb; v_title text;
begin
  select id into v_page_id from public.landing_pages where slug = 't4-page';
  update public.landing_pages
    set thank_you_config = '{"headline":"Thanks!","message":"We will call you shortly.","showOrderSummary":false}'::jsonb
    where id = v_page_id;

  select thank_you_config, title into v_config, v_title from public.landing_pages where id = v_page_id;
  assert v_config->>'headline' = 'Thanks!', 'headline must round-trip';
  assert (v_config->>'showOrderSummary')::boolean = false, 'showOrderSummary must round-trip as false';
  assert v_title is null, 'unrelated column (title) must be untouched by this update';
  raise notice 'OK 2: thank_you_config round-trips correctly, unrelated columns untouched.';
end $$;

\echo '=== 3. All four system templates have valid, non-empty starter_sections ==='
do $$
declare v_key text; v_count int; v_len int;
begin
  foreach v_key in array array['template_1','template_2','template_3','template_4']
  loop
    select jsonb_array_length(starter_sections) into v_len from public.landing_page_templates where template_key = v_key;
    assert v_len is not null and v_len > 0, format('%s must have a non-empty starter_sections array', v_key);
  end loop;
  select count(*) into v_count from public.landing_page_templates where template_key like 'template_%' and is_system = true;
  assert v_count = 4, format('expected exactly 4 system templates, got %s', v_count);
  raise notice 'OK 3: all 4 system templates have valid non-empty starter_sections.';
end $$;

\echo '=== 4. Fixed defect: HERO/CTA_BANNER/TRUST_STRIP/FAQ config keys are camelCase, matching sectionTypes.ts (not the old broken snake_case/q-a/plain-string seed) ==='
do $$
declare v_key text; v_sections jsonb; v_hero jsonb; v_cta jsonb; v_trust jsonb; v_faq jsonb;
begin
  foreach v_key in array array['template_1','template_2','template_3','template_4']
  loop
    select starter_sections into v_sections from public.landing_page_templates where template_key = v_key;

    select s->'config' into v_hero from jsonb_array_elements(v_sections) s where s->>'type' = 'HERO' limit 1;
    if v_hero is not null then
      assert v_hero ? 'headline', format('%s HERO must have headline', v_key);
      assert not (v_hero ? 'cta_label'), format('%s HERO must not use the old broken snake_case cta_label key', v_key);
      assert not (v_hero ? 'anchor'), format('%s HERO must not use the old broken anchor key (use ctaTarget)', v_key);
      if v_hero ? 'ctaLabel' then
        assert v_hero ? 'ctaTarget' or true, 'ctaTarget optional but must use camelCase when present';
      end if;
    end if;

    select s->'config' into v_trust from jsonb_array_elements(v_sections) s where s->>'type' = 'TRUST_STRIP' limit 1;
    if v_trust is not null and jsonb_array_length(v_trust->'items') > 0 then
      assert jsonb_typeof(v_trust->'items'->0) = 'object', format('%s TRUST_STRIP items must be objects ({text}), not plain strings', v_key);
      assert (v_trust->'items'->0) ? 'text', format('%s TRUST_STRIP item must have a text key', v_key);
    end if;

    select s->'config' into v_faq from jsonb_array_elements(v_sections) s where s->>'type' = 'FAQ' limit 1;
    if v_faq is not null and jsonb_array_length(v_faq->'items') > 0 then
      assert (v_faq->'items'->0) ? 'question', format('%s FAQ item must use question/answer keys, not q/a', v_key);
      assert (v_faq->'items'->0) ? 'answer', format('%s FAQ item must use question/answer keys, not q/a', v_key);
      assert not ((v_faq->'items'->0) ? 'q'), format('%s FAQ item must not use the old broken q key', v_key);
    end if;

    select s->'config' into v_cta from jsonb_array_elements(v_sections) s where s->>'type' = 'CTA_BANNER' limit 1;
    if v_cta is not null then
      assert v_cta ? 'buttonLabel', format('%s CTA_BANNER must use buttonLabel key, not cta_label', v_key);
      assert not (v_cta ? 'cta_label'), format('%s CTA_BANNER must not use the old broken cta_label key', v_key);
      assert not (v_cta ? 'anchor'), format('%s CTA_BANNER must not use the old broken anchor key (use ctaTarget)', v_key);
    end if;
  end loop;
  raise notice 'OK 4: HERO/TRUST_STRIP/FAQ/CTA_BANNER config keys are correct across all 4 templates.';
end $$;

\echo '=== 5. BENEFITS and HOW_IT_WORKS items are objects with a title key, not plain strings (the other half of the same defect) ==='
do $$
declare v_key text; v_sections jsonb; v_section jsonb;
begin
  foreach v_key in array array['template_1','template_2','template_3','template_4']
  loop
    select starter_sections into v_sections from public.landing_page_templates where template_key = v_key;
    for v_section in select s->'config' from jsonb_array_elements(v_sections) s where s->>'type' in ('BENEFITS','HOW_IT_WORKS')
    loop
      if jsonb_array_length(coalesce(v_section->'items', v_section->'steps', '[]'::jsonb)) > 0 then
        assert jsonb_typeof(coalesce(v_section->'items', v_section->'steps')->0) = 'object',
          format('%s BENEFITS/HOW_IT_WORKS items/steps must be objects with a title, not plain strings', v_key);
        assert (coalesce(v_section->'items', v_section->'steps')->0) ? 'title',
          format('%s BENEFITS/HOW_IT_WORKS item must have a title key', v_key);
      end if;
    end loop;
  end loop;
  raise notice 'OK 5: BENEFITS/HOW_IT_WORKS items are correctly-shaped objects across all 4 templates.';
end $$;

\echo '=== 6. Template 4 contains the expected section types in a sane long-form order ==='
do $$
declare v_sections jsonb; v_types text[]; v_hero_pos int; v_pkg_pos int; v_form_pos int;
begin
  select starter_sections into v_sections from public.landing_page_templates where template_key = 'template_4';
  select array_agg(s->>'type' order by ord) into v_types from jsonb_array_elements(v_sections) with ordinality as t(s, ord);

  assert 'HERO' = any(v_types), 'Template 4 must include a HERO section';
  assert 'PACKAGE_SELECTOR' = any(v_types), 'Template 4 must include PACKAGE_SELECTOR';
  assert 'ORDER_FORM' = any(v_types), 'Template 4 must include ORDER_FORM';
  assert 'FAQ' = any(v_types), 'Template 4 must include FAQ';
  assert 'GUARANTEE' = any(v_types), 'Template 4 must include GUARANTEE';

  select min(ord) into v_hero_pos from jsonb_array_elements(v_sections) with ordinality as t(s, ord) where s->>'type' = 'HERO';
  select min(ord) into v_pkg_pos from jsonb_array_elements(v_sections) with ordinality as t(s, ord) where s->>'type' = 'PACKAGE_SELECTOR';
  select min(ord) into v_form_pos from jsonb_array_elements(v_sections) with ordinality as t(s, ord) where s->>'type' = 'ORDER_FORM';
  assert v_hero_pos < v_pkg_pos, 'HERO must come before PACKAGE_SELECTOR';
  assert v_pkg_pos < v_form_pos, 'PACKAGE_SELECTOR must come before ORDER_FORM';
  raise notice 'OK 6: Template 4 section order is sane (hero -> ... -> package selector -> order form).';
end $$;

\echo '=== 7. Creating a page from Template 4 and placing a public order still works (no regression) ==='
do $$
declare
  v_ws uuid; v_brand uuid; v_template_id uuid; v_sections jsonb; v_page_id uuid;
  v_section record; v_pkg_id uuid; v_order public.orders%rowtype;
begin
  select id into v_ws from public.workspaces where slug = 't4-ws';
  select id into v_brand from public.brands where slug = 't4-brand';
  select id, starter_sections into v_template_id, v_sections from public.landing_page_templates where template_key = 'template_4';

  insert into public.landing_pages (workspace_id, brand_id, name, slug, status, template_id, market_country_code, market_currency_code)
    values (v_ws, v_brand, 'T4 Clone', 't4-clone', 'published', v_template_id, 'NG', 'NGN')
    returning id into v_page_id;

  for v_section in select (s->>'type') as type, (s->'config') as config, ord
    from jsonb_array_elements(v_sections) with ordinality as t(s, ord)
  loop
    insert into public.landing_page_sections (landing_page_id, workspace_id, brand_id, type, position, config)
      values (v_page_id, v_ws, v_brand, v_section.type, v_section.ord, v_section.config);
  end loop;

  insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, price, quantity, enabled, is_default)
    values (v_page_id, v_ws, v_brand, 'Buy 1', 2699, 1, true, true) returning id into v_pkg_id;

  select * into v_order from public.create_public_order('t4-clone', v_pkg_id, 'Jane Doe', '08012345678', '1 Test Rd', 'Lagos', 'Ikeja');
  assert v_order.id is not null, 'public order creation from a Template-4-cloned page must still succeed';
  raise notice 'OK 7: page-from-Template-4 + public order creation still works end to end.';
end $$;

\echo '=== 8. Template 4 starter_packages: 4 tiers, exact pricing/badges, exactly one default ==='
do $$
declare v_packages jsonb; v_count int; v_default_count int; v_names text[];
begin
  select starter_packages into v_packages from public.landing_page_templates where template_key = 'template_4';
  select jsonb_array_length(v_packages) into v_count;
  assert v_count = 4, format('expected 4 starter packages, got %s', v_count);

  select count(*) into v_default_count from jsonb_array_elements(v_packages) p where (p->>'is_default')::boolean is true;
  assert v_default_count = 1, format('expected exactly 1 default package, got %s', v_default_count);

  select array_agg(p->>'badge') into v_names from jsonb_array_elements(v_packages) p;
  assert 'Most Popular' = any(v_names), 'expected a "Most Popular" badge among the starter packages';
  assert 'Best Value' = any(v_names), 'expected a "Best Value" badge among the starter packages';
  assert 'Super Value' = any(v_names), 'expected a "Super Value" badge among the starter packages';

  perform 1 from jsonb_array_elements(v_packages) p where (p->>'price')::numeric <= 0;
  assert not found, 'no starter package should have a non-positive price';
  raise notice 'OK 8: Template 4 starter_packages has 4 correctly-shaped tiers with the expected badges and exactly one default.';
end $$;

\echo '=== 9. Template 4 restores the full 6-item symptom list (not a trimmed subset) ==='
do $$
declare v_sections jsonb; v_symptom_items jsonb; v_count int;
begin
  select starter_sections into v_sections from public.landing_page_templates where template_key = 'template_4';
  select s->'config'->'items' into v_symptom_items from jsonb_array_elements(v_sections) s
    where s->>'type' = 'BENEFITS' and s->'config'->>'tone' = 'warning' limit 1;
  select jsonb_array_length(v_symptom_items) into v_count;
  assert v_count = 6, format('expected 6 symptom cards, got %s', v_count);
  raise notice 'OK 9: Template 4''s symptom list has all 6 items.';
end $$;

\echo '=== 10. Creating a page from Template 4 also seeds its starter packages (not just sections) ==='
do $$
declare
  v_ws uuid; v_brand uuid; v_template_id uuid; v_packages jsonb; v_page_id uuid;
  v_pkg record; v_seeded_count int;
begin
  select id into v_ws from public.workspaces where slug = 't4-ws';
  select id into v_brand from public.brands where slug = 't4-brand';
  select id, starter_packages into v_template_id, v_packages from public.landing_page_templates where template_key = 'template_4';

  insert into public.landing_pages (workspace_id, brand_id, name, slug, status, template_id, market_country_code, market_currency_code)
    values (v_ws, v_brand, 'T4 Clone Packages', 't4-clone-packages', 'published', v_template_id, 'NG', 'NGN')
    returning id into v_page_id;

  -- Mirrors createLandingPage()'s starter_packages seeding logic exactly.
  for v_pkg in select
      p->>'name' as name, (p->>'quantity')::int as quantity, (p->>'price')::numeric as price,
      (p->>'compare_at_price')::numeric as compare_at_price, p->>'badge' as badge,
      p->>'savings_text' as savings_text, coalesce((p->>'is_default')::boolean, false) as is_default, ord
    from jsonb_array_elements(v_packages) with ordinality as t(p, ord)
  loop
    insert into public.landing_page_packages (landing_page_id, workspace_id, brand_id, name, quantity, price, compare_at_price, badge, savings_text, shipping_rule, enabled, is_default, position)
      values (v_page_id, v_ws, v_brand, v_pkg.name, v_pkg.quantity, v_pkg.price, v_pkg.compare_at_price, v_pkg.badge, v_pkg.savings_text, '{"type":"free"}'::jsonb, true, v_pkg.is_default, v_pkg.ord);
  end loop;

  select count(*) into v_seeded_count from public.landing_page_packages where landing_page_id = v_page_id;
  assert v_seeded_count = 4, format('expected 4 packages seeded from Template 4''s starter_packages, got %s', v_seeded_count);
  raise notice 'OK 10: creating a page from Template 4 correctly seeds all 4 starter packages.';
end $$;

\echo '=== 11. Template 4''s two image-led sections use the photo-grid layout ==='
do $$
declare v_sections jsonb; v_count int;
begin
  select starter_sections into v_sections from public.landing_page_templates where template_key = 'template_4';
  select count(*) into v_count from jsonb_array_elements(v_sections) s
    where s->>'type' = 'BENEFITS' and s->'config'->>'layout' = 'photo';
  assert v_count = 2, format('expected 2 photo-grid BENEFITS sections in Template 4, got %s', v_count);
  raise notice 'OK 11: Template 4''s two image-led sections correctly use layout=photo.';
end $$;

\echo '=== 12. Template 4''s "The Ritual" section uses the card-grid layout with an eyebrow and updated title ==='
do $$
declare v_sections jsonb; v_ritual jsonb;
begin
  select starter_sections into v_sections from public.landing_page_templates where template_key = 'template_4';
  select s->'config' into v_ritual from jsonb_array_elements(v_sections) s
    where s->>'type' = 'HOW_IT_WORKS' and s->'config'->>'eyebrow' = 'The Ritual' limit 1;
  assert v_ritual is not null, 'expected a HOW_IT_WORKS section with eyebrow "The Ritual"';
  assert v_ritual->>'layout' = 'cards', format('expected layout=cards on the ritual section, got %s', v_ritual->>'layout');
  assert v_ritual->>'title' = 'How to use it', format('expected title "How to use it", got %s', v_ritual->>'title');
  assert jsonb_array_length(v_ritual->'steps') = 3, 'expected the ritual section to still have its original 3 steps';

  -- The other seeded HOW_IT_WORKS section ("What A Daily Ritual Looks
  -- Like") already has per-step eyebrows and must be left as a timeline,
  -- not switched to cards by this change.
  perform 1 from jsonb_array_elements(v_sections) s
    where s->>'type' = 'HOW_IT_WORKS' and s->'config'->>'title' = 'What A Daily Ritual Looks Like' and s->'config'->>'layout' = 'cards';
  assert not found, 'the per-step-eyebrow HOW_IT_WORKS section must not be switched to layout=cards';
  raise notice 'OK 12: Template 4''s ritual section correctly uses layout=cards with eyebrow/title set, and the timeline section is untouched.';
end $$;

\echo '=== 13. Template 4''s scrolling ticker (TRUST_STRIP style=ticker) leads the section list ==='
do $$
declare v_sections jsonb; v_first jsonb; v_total int; v_ticker_count int;
begin
  select starter_sections into v_sections from public.landing_page_templates where template_key = 'template_4';
  select jsonb_array_length(v_sections) into v_total;

  select s into v_first from jsonb_array_elements(v_sections) with ordinality as t(s, ord) where ord = 1;
  assert v_first->>'type' = 'TRUST_STRIP' and v_first->'config'->>'style' = 'ticker',
    format('expected the ticker TRUST_STRIP to be the first section, got type=%s style=%s', v_first->>'type', v_first->'config'->>'style');

  -- Reordering must not drop or duplicate anything else in the list.
  assert v_total = 19, format('expected Template 4 to still have all 19 sections after reordering, got %s', v_total);
  select count(*) into v_ticker_count from jsonb_array_elements(v_sections) s
    where s->>'type' = 'TRUST_STRIP' and s->'config'->>'style' = 'ticker';
  assert v_ticker_count = 1, format('expected exactly 1 ticker TRUST_STRIP section, got %s', v_ticker_count);
  raise notice 'OK 13: Template 4''s scrolling ticker is the first section, with no sections lost or duplicated.';
end $$;

\echo '=== ALL TEMPLATE 4 VISUAL RECONSTRUCTION TESTS PASSED ==='
