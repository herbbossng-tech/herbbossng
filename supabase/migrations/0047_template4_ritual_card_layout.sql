-- =====================================================================
-- GCOS — Template 4: card-grid layout for the "How to use it" ritual step
-- =====================================================================
-- Follow-up to 0046. Template 4 seeds two HOW_IT_WORKS sections: "The
-- Ritual" (three plain steps, no per-step eyebrow) and "What A Daily
-- Ritual Looks Like" (per-step eyebrow, already renders as a timeline).
-- The reference page presents the first of these as a side-by-side card
-- grid with an italic Roman-numeral mark and a colored top border, not a
-- plain numbered list. The renderer and editor already gained a
-- `layout: 'cards'` mode for HOW_IT_WORKS plus an optional section-level
-- `eyebrow` — this migration only sets those on Template 4's "The
-- Ritual" instance so new pages created from the template render it
-- correctly; the step copy/order is unchanged, and this does not touch
-- any landing_page_sections row already created for an existing page (a
-- workspace with an existing page must switch that section's Layout
-- dropdown to "Card grid" and set its Eyebrow/Title themselves, the same
-- as any other starter-content edit).
-- =====================================================================

update public.landing_page_templates
set starter_sections = (
  select jsonb_agg(
    case
      when s->>'type' = 'HOW_IT_WORKS' and s->'config'->>'title' = 'The Ritual'
        then jsonb_set(
          jsonb_set(
            jsonb_set(s, '{config,layout}', '"cards"'::jsonb),
            '{config,eyebrow}', '"The Ritual"'::jsonb
          ),
          '{config,title}', '"How to use it"'::jsonb
        )
      else s
    end
    order by ord
  )
  from jsonb_array_elements(starter_sections) with ordinality as t(s, ord)
)
where template_key = 'template_4';
