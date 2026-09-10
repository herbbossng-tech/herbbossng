-- =====================================================================
-- GCOS — Template 4: scrolling ticker leads the page, like the reference
-- =====================================================================
-- Follow-up to 0047. The reference page's scrolling trust ticker sits
-- pinned at the very top of the page, visible before any scrolling and
-- staying in view for the rest of the scroll. Two things were wrong on
-- our side:
--   1. The TRUST_STRIP ticker instance wasn't rendered sticky at all —
--      it scrolled away with the rest of the page like any other
--      section (fixed in the same app change as this migration, in
--      PublicSections.tsx's TrustStripSection).
--   2. Template 4 seeded the ticker well down the section list (after
--      the urgency CTA banner, hero, and the default checkmark trust
--      strip), so even once sticky it wouldn't appear at the very top
--      until the page had already been scrolled past it once.
-- This migration only reorders Template 4's existing ticker instance to
-- be the first section — no content or config changes — so new pages
-- created from the template get the "pinned ticker at the top" layout
-- automatically. As with 0046/0047, this does not touch any
-- landing_page_sections row already created for an existing page — a
-- workspace with an existing page must move their own ticker section to
-- the top themselves (now easy to find: the sections list labels it
-- "Scrolling Ticker", distinct from the plain "Trust Strip").
-- =====================================================================

update public.landing_page_templates
set starter_sections = (
  select jsonb_agg(elem order by is_ticker desc, ord)
  from jsonb_array_elements(starter_sections) with ordinality as t(elem, ord)
       cross join lateral (
         -- coalesce is load-bearing: config->>'style' is absent (sql null)
         -- on the default trust strip, and `true and null` is null rather
         -- than false — left un-coalesced, ORDER BY's default NULLS FIRST
         -- for DESC would sort that null-flagged row ahead of the actual
         -- ticker row instead of behind it.
         select coalesce(elem->>'type' = 'TRUST_STRIP' and elem->'config'->>'style' = 'ticker', false) as is_ticker
       ) flag
)
where template_key = 'template_4';
