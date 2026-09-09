-- =====================================================================
-- GCOS — Template 4: photo-grid layout for image-led Benefits sections
-- =====================================================================
-- Follow-up to 0045. The two "still struggling with these issues?" /
-- "nourish your body" sections were seeded as plain icon+text Benefits
-- cards with empty imageUrl slots, which renders as sparse text once a
-- workspace has no photos yet — the reference page uses an actual photo
-- grid for these. The section renderer and editor already gained a
-- `layout: 'photo'` mode for BENEFITS (renders an image tile per item,
-- with a clear "Add Photo" placeholder when imageUrl is empty, instead
-- of the icon/description card). This migration only sets that flag on
-- Template 4's two seeded instances so new pages created from the
-- template pick the right layout automatically — item copy/order is
-- unchanged, and this does not touch any landing_page_sections row
-- already created for an existing page (a workspace with an existing
-- page must switch those two sections' Layout dropdown to "Photo grid"
-- themselves, the same as any other starter-content edit).
-- =====================================================================

update public.landing_page_templates
set starter_sections = (
  select jsonb_agg(
    case
      when s->>'type' = 'BENEFITS' and s->'config'->>'title' in ('Are You Still Facing These Challenges?', 'Nourish Your Body, Elevate Your Day')
        then jsonb_set(s, '{config,layout}', '"photo"'::jsonb)
      else s
    end
    order by ord
  )
  from jsonb_array_elements(starter_sections) with ordinality as t(s, ord)
)
where template_key = 'template_4';
