-- ============================================================
-- GOLDEN COMMERCE OS — shorten the 4 system landing-page templates'
-- gallery descriptions (0031). The originals enumerated every section
-- in the template's flow ("urgency banner, hero, social proof,
-- problem/root-cause, formula explanation, benefits, comparison,
-- transformation, FAQ, order form...") — accurate, but far too long
-- for a gallery card, and the Template Gallery's own card footer
-- ("Use This Template" + "Duplicate") had no room left once a
-- multi-line description pushed the card taller than its two-button
-- row could handle at 4-column width. This migration only shortens
-- the descriptive TEXT; starter_sections (what the template actually
-- builds) is completely unchanged.
-- ============================================================

update public.landing_page_templates
set description = 'A long-form wellness page built for pay-on-delivery conversions.'
where workspace_id is null and slug = 'wellness-cod-funnel';

update public.landing_page_templates
set description = 'A premium, editorial-style wellness page with a ritual/apothecary feel.'
where workspace_id is null and slug = 'editorial-apothecary-funnel';

update public.landing_page_templates
set description = 'A compact, product-focused page for a fast, direct-to-order pitch.'
where workspace_id is null and slug = 'product-spotlight-funnel';

update public.landing_page_templates
set description = 'A high-conversion long-form page — original copy, not from any third-party source.'
where workspace_id is null and slug = 'ginseng-five-treasures-conversion-funnel';
