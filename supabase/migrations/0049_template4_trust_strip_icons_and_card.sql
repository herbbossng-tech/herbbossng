-- =====================================================================
-- GCOS — Template 4: icon badges for the default (non-ticker) trust strip
-- =====================================================================
-- Follow-up to 0048. The reference page's plain trust strip (the one
-- below the hero, not the scrolling ticker) shows a distinct icon per
-- badge — a leaf, a delivery truck, cash, a checkmark — inside a
-- floating rounded card, not a plain row of identical checkmarks on a
-- full-width bar. The renderer's default TRUST_STRIP layout was updated
-- separately (in PublicSections.tsx) to render as that floating card;
-- this migration only adds the matching icon to each of Template 4's
-- four default trust-strip items by their existing text — no wording
-- changes, and Template 4's ticker instance (matched by style=ticker)
-- is left untouched. As with 0046-0048, this does not touch any
-- landing_page_sections row already created for an existing page.
-- =====================================================================

update public.landing_page_templates
set starter_sections = (
  select jsonb_agg(
    case
      when s->>'type' = 'TRUST_STRIP' and coalesce(s->'config'->>'style', 'default') <> 'ticker'
        then jsonb_set(s, '{config,items}', (
          select jsonb_agg(
            case item->>'text'
              when '100% Natural' then jsonb_set(item, '{icon}', '"🌿"'::jsonb)
              when 'Free Delivery' then jsonb_set(item, '{icon}', '"🚚"'::jsonb)
              when 'Cash On Delivery' then jsonb_set(item, '{icon}', '"💵"'::jsonb)
              when 'Quality Guarantee' then jsonb_set(item, '{icon}', '"✅"'::jsonb)
              else item
            end
            order by item_ord
          )
          from jsonb_array_elements(s->'config'->'items') with ordinality as ti(item, item_ord)
        ))
      else s
    end
    order by ord
  )
  from jsonb_array_elements(starter_sections) with ordinality as t(s, ord)
)
where template_key = 'template_4';
