-- =====================================================================
-- GCOS — Template 4 Visual Reconstruction & Conversion Optimization
-- =====================================================================
-- Scope, per the brief: reconstruct the public renderer's VISUAL design
-- language (handled entirely in the frontend — PublicSections.tsx,
-- PackageSelectorSection.tsx, CodOrderForm.tsx, FloatingCtas.tsx — no
-- schema change needed for that) and refresh Template 4's seeded
-- section structure/copy to better match a long-form COD funnel's
-- conversion architecture.
--
-- Auditing the existing template seed data (0031) surfaced ONE genuine
-- backend gap (PART A) and ONE genuine, pre-existing, cross-template
-- DEFECT that this migration also fixes (PART C) because it silently
-- breaks the very "seeded starter content renders correctly" requirement
-- this task is graded against — it is not scope creep, it is the
-- "smallest underlying abstraction necessary" the brief explicitly
-- authorizes fixing:
--
-- PART A — thank_you_config (genuine backend gap). ThankYouPage.tsx was
-- 100% hardcoded: headline, confirmation copy, CTA, and order-summary
-- visibility could not be edited by any workspace, because
-- landing_pages had nowhere to store that content. Additive,
-- nullable-with-default column — every existing published page keeps
-- rendering its current (identical) hardcoded copy as the frontend's
-- fallback default whenever thank_you_config is empty. No existing
-- row's behavior changes.
--
-- PART B — refresh the `ginseng-five-treasures-conversion-funnel`
-- (Template 4) system template's starter_sections to a richer long-form
-- structure/order inspired by the attached reference screenshots, using
-- entirely original GCOS copy and the SAME generic, already-existing
-- section types/config shape every other template uses — zero new
-- section-type additions, zero product-specific rendering branches.
--
-- PART C — fix a real, pre-existing key-naming defect discovered while
-- writing PART B's config JSON and cross-checking it against
-- src/features/landingPages/sectionTypes.ts (the actual shape every
-- renderer component reads): the ORIGINAL 0031 seed data for ALL FOUR
-- system templates used a mix of snake_case keys (cta_label, anchor,
-- image_url, image_side) and wrong field names (TEXT/IMAGE_TEXT/
-- BENEFITS/HOW_IT_WORKS used "headline" where their config type is
-- "title"; FAQ items used {q,a} instead of {question,answer}; TRUST_STRIP/
-- BENEFITS/HOW_IT_WORKS seeded plain string arrays where the type is an
-- array of objects) that never matched the camelCase TypeScript config
-- shape the section components actually render — createLandingPage()
-- copies starter_sections' config into each new page's section verbatim,
-- with no normalization step. The practical effect: for every page ever
-- created from Templates 1, 2, or 3 (and the pre-refresh Template 4),
-- the Hero CTA button/image, every Trust Strip badge, every Benefit
-- card, every How-It-Works step, every FAQ question, and both CTA
-- banners silently rendered BLANK — no error, just missing content,
-- which is exactly the kind of defect that is easy to miss without
-- reading the component source next to the seed data. This migration
-- corrects the KEYS ONLY for Templates 1-3 (their copy/content/order is
-- completely unchanged — this is a data-shape bug fix, not the
-- redesign the brief explicitly says not to do to those templates) and
-- Template 4 is seeded correctly from the start in PART B. Only
-- starter_sections is corrected here; it only affects sections seeded
-- for NEW pages created from a template from this point forward — no
-- existing landing_page_sections row (a per-page copy made at creation
-- time) is touched by this migration.
-- =====================================================================

alter table public.landing_pages
  add column if not exists thank_you_config jsonb not null default '{}'::jsonb;

comment on column public.landing_pages.thank_you_config is
  'Editable thank-you-page content: {headline, message, ctaLabel, ctaTarget, showOrderSummary, upsell:{enabled,title,body,imageUrl,ctaLabel,ctaTarget}}. Empty/missing keys fall back to ThankYouPage.tsx''s built-in default copy — added in 0044 (Template 4 visual reconstruction) to close a genuine gap: the thank-you page had no configurable content at all before this column existed.';


-- ---------------------------------------------------------------------
-- PART B — Template 4 refresh (original GCOS copy, correct config keys)
-- ---------------------------------------------------------------------
update public.landing_page_templates
set starter_sections = '[
    {"type":"CTA_BANNER","config":{"style":"urgency","buttonLabel":"Claim Yours — Pay on Delivery","ctaTarget":"order-form"}},
    {"type":"HERO","config":{"eyebrow":"Apothecary Formula · Original GCOS Blend","headline":"Five Roots. One Quiet Ritual of Repair.","subheadline":"Ginseng Five Treasures Tea blends ginseng, red date, goji, mulberry and maca into a daily cup built to support everyday energy and general wellness.","ctaLabel":"Order Now","ctaTarget":"order-form","imageUrl":null}},
    {"type":"TRUST_STRIP","config":{"style":"ticker","items":[{"text":"100% Natural Ingredients"},{"text":"Pay on Delivery"},{"text":"Nationwide Shipping"},{"text":"Quality Guarantee"}]}},
    {"type":"BENEFITS","config":{"tone":"warning","title":"Is Your Body Giving You These Signs?","items":[
      {"icon":"😴","title":"Constant Fatigue","description":"Tired even after a full night''s sleep."},
      {"icon":"🩺","title":"Low Vitality","description":"A general sense of running on empty."},
      {"icon":"🍽️","title":"Digestive Trouble","description":"Bloating and sluggish digestion."},
      {"icon":"🛡️","title":"Weak Immunity","description":"Falling sick more often than usual."}
    ]}},
    {"type":"TEXT","config":{"eyebrow":"The Formula","title":"Five Treasures, Steeped Into One Cup","body":"Each ingredient in this blend has a role: ginseng for steady energy, red date and goji for gentle nourishment, mulberry for balance, maca for recovery — brewed into a simple daily ritual, no capsules, no complicated routine.","ctaLabel":"See The Blend","ctaTarget":"formula"}},
    {"type":"INGREDIENTS","config":{"headline":"Five Treasures, Five Roles","items":[
      {"name":"Ginseng","description":"Steady, all-day energy."},
      {"name":"Red Date","description":"Gentle daily nourishment."},
      {"name":"Goji Berry","description":"Antioxidant support."},
      {"name":"Mulberry","description":"Daily balance."},
      {"name":"Maca Root","description":"Recovery and stamina."}
    ]}},
    {"type":"HOW_IT_WORKS","config":{"title":"The Ritual","steps":[
      {"title":"Boil fresh water","description":"Use clean water and bring it to a gentle boil."},
      {"title":"Steep the blend","description":"Pour over the herbs and let the aroma turn rich and full."},
      {"title":"Sip daily","description":"Drink once a day — consistency is what makes the ritual work."}
    ]}},
    {"type":"BENEFITS","config":{"title":"Clear Benefits, Steeped Daily","items":[
      {"icon":"🌿","title":"Kidney Wellness Support","description":"Traditionally associated with kidney wellness as part of a healthy routine."},
      {"icon":"⚡","title":"Steady Energy","description":"A ginseng-led blend built for stamina, not a caffeine spike."},
      {"icon":"🛡️","title":"Stronger Immunity","description":"Supports your body''s natural defenses."},
      {"icon":"💧","title":"Easier Digestion","description":"Eases bloating and supports a calmer, more regular gut."}
    ]}},
    {"type":"HOW_IT_WORKS","config":{"title":"What A Daily Ritual Looks Like","steps":[
      {"eyebrow":"First Few Days","title":"Building the habit","description":"A warm cup becomes part of your morning or evening — nothing to force, just something to keep."},
      {"eyebrow":"About 2 Weeks","title":"A steadier rhythm","description":"Many people say the ritual starts to feel routine rather than a chore."},
      {"eyebrow":"About 1 Month","title":"A settled routine","description":"The daily cup is just part of how the day starts or ends — simple and consistent."}
    ]}},
    {"type":"COMPARISON","config":{"headline":"Not Your Typical Herbal Tea","rows":[
      {"label":"Ingredients","us":"Real, whole herbs — not extract powder","them":"Artificial flavoring"},
      {"label":"Formula","us":"Five-treasure formula, brewed fresh","them":"Hidden fillers"},
      {"label":"Potency","us":"Full-bodied traditional blend","them":"Low potency, one-note blends"},
      {"label":"Ordering","us":"Cash on delivery, zero risk","them":"Online payment only"}
    ]}},
    {"type":"TESTIMONIALS","config":{"items":[]}},
    {"type":"GUARANTEE","config":{"headline":"Order With Confidence","body":"Pay only when your order arrives at your door — no upfront payment required."}},
    {"type":"FAQ","config":{"items":[
      {"question":"Is this a treatment for a medical condition?","answer":"No. Ginseng Five Treasures Tea is a wellness ritual, not a treatment, cure, or substitute for medical care. Speak with a healthcare professional about any medical condition."},
      {"question":"How do I prepare it?","answer":"Boil fresh water, steep the blend, and drink once a day as part of your routine."},
      {"question":"How does delivery work?","answer":"We deliver nationwide — you pay in cash when your order arrives."}
    ]}},
    {"type":"CTA_BANNER","config":{"style":"final","headline":"Start Your Daily Ritual Today","buttonLabel":"Claim Yours Now","ctaTarget":"order-form"}},
    {"type":"PACKAGE_SELECTOR","config":{"title":"Choose Your Package"}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb
where template_key = 'template_4';


-- ---------------------------------------------------------------------
-- PART C — fix the pre-existing key-naming defect for Templates 1-3.
-- Copy/content/section order is completely unchanged from 0031; only
-- the JSON keys inside each section's config are corrected so the
-- SAME copy actually reaches the screen.
-- ---------------------------------------------------------------------
update public.landing_page_templates
set starter_sections = '[
    {"type":"CTA_BANNER","config":{"style":"urgency","headline":"Limited Stock — Pay on Delivery, Nationwide","buttonLabel":"Order Now","ctaTarget":"order-form"}},
    {"type":"HERO","config":{"headline":"Feel the Difference in Weeks, Not Months","subheadline":"A daily wellness ritual thousands of customers trust.","ctaLabel":"Order Now — Pay on Delivery","ctaTarget":"order-form","imageUrl":null}},
    {"type":"TRUST_STRIP","config":{"items":[{"text":"Pay on Delivery"},{"text":"Fast Nationwide Shipping"},{"text":"Thousands of Happy Customers"}]}},
    {"type":"PROBLEM_AWARENESS","config":{"headline":"Why You Might Be Feeling Off","body":"Modern routines can quietly drain daily energy and wellness — most people never trace it back to the real cause."}},
    {"type":"TEXT","config":{"title":"The Root Cause, Explained","body":"Describe the underlying wellness gap this product addresses, in plain language."}},
    {"type":"INGREDIENTS","config":{"headline":"What Is Inside", "items":[{"name":"Ingredient 1","description":"Traditional herbal ingredient and its role."},{"name":"Ingredient 2","description":"Traditional herbal ingredient and its role."}]}},
    {"type":"BENEFITS","config":{"title":"What You Can Expect","items":[{"title":"Daily energy support"},{"title":"General wellness support"},{"title":"Digestive comfort"}]}},
    {"type":"COMPARISON","config":{"headline":"Why This, Not That","rows":[{"label":"Convenience","us":"Simple daily ritual","them":"Complicated regimens"},{"label":"Ingredients","us":"Traditional herbal blend","them":"Unclear formulations"}]}},
    {"type":"HOW_IT_WORKS","config":{"title":"Your Transformation, Step by Step","steps":[{"title":"Order today, pay on delivery"},{"title":"Start your daily ritual"},{"title":"Feel the difference over weeks of consistent use"}]}},
    {"type":"FAQ","config":{"items":[{"question":"Is this safe to use daily?","answer":"Follow the label instructions; consult a healthcare professional if you have a medical condition."},{"question":"How is it shipped?","answer":"Nationwide delivery, pay when it arrives."}]}},
    {"type":"CTA_BANNER","config":{"style":"final","headline":"Ready to Feel the Difference?","buttonLabel":"Order Now","ctaTarget":"order-form"}},
    {"type":"PACKAGE_SELECTOR","config":{}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb
where template_key = 'template_1';

update public.landing_page_templates
set starter_sections = '[
    {"type":"TRUST_STRIP","config":{"items":[{"text":"Traditional Herbal Blend"},{"text":"Pay on Delivery"},{"text":"Crafted in Small Batches"}]}},
    {"type":"HERO","config":{"headline":"A Daily Ritual, Rooted in Tradition","subheadline":"Thoughtfully blended for everyday wellness.","ctaLabel":"Discover the Ritual","ctaTarget":"order-form","imageUrl":null}},
    {"type":"IMAGE_TEXT","config":{"title":"Positioned for the Modern Ritual","body":"Describe the products premium positioning and origin story.","imageUrl":null,"imagePosition":"right"}},
    {"type":"PROBLEM_AWARENESS","config":{"headline":"The Signs Worth Paying Attention To","body":"Everyday fatigue, sluggish digestion, and low vitality are easy to dismiss — until they are not."}},
    {"type":"INGREDIENTS","config":{"headline":"The Formula","items":[{"name":"Ingredient 1","description":"Role in the blend."},{"name":"Ingredient 2","description":"Role in the blend."}]}},
    {"type":"HOW_IT_WORKS","config":{"title":"The Ritual","steps":[{"title":"Prepare your daily serving"},{"title":"Enjoy it as part of your morning or evening routine"},{"title":"Stay consistent for best results over time"}]}},
    {"type":"BENEFITS","config":{"title":"What This Ritual Supports","items":[{"title":"Daily vitality"},{"title":"Digestive wellness"},{"title":"A calm, consistent routine"}]}},
    {"type":"COMPARISON","config":{"headline":"Why This Blend Is Different","rows":[{"label":"Sourcing","us":"Traditional herbal ingredients","them":"Unclear sourcing"}]}},
    {"type":"TEXT","config":{"title":"A Ritual, Over Time","body":"Describe how the experience is intended to build over weeks of consistent use."}},
    {"type":"FAQ","config":{"items":[{"question":"How do I prepare it?","answer":"Follow the on-pack preparation instructions."},{"question":"Is it safe alongside other routines?","answer":"Consult a healthcare professional if you have a medical condition or take medication."}]}},
    {"type":"TESTIMONIALS","config":{"items":[]}},
    {"type":"PACKAGE_SELECTOR","config":{}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb
where template_key = 'template_2';

update public.landing_page_templates
set starter_sections = '[
    {"type":"HERO","config":{"headline":"Meet Your New Daily Essential","subheadline":"See why customers keep coming back.","ctaLabel":"Shop Now","ctaTarget":"order-form","imageUrl":null}},
    {"type":"IMAGE_TEXT","config":{"title":"What Makes It Work","body":"Explain the product mechanism/formulation in plain language.","imageUrl":null,"imagePosition":"left"}},
    {"type":"BENEFITS","config":{"title":"Results You Can Expect","items":[{"title":"Benefit 1"},{"title":"Benefit 2"},{"title":"Benefit 3"}]}},
    {"type":"TESTIMONIALS","config":{"items":[]}},
    {"type":"COMPARISON","config":{"headline":"How It Compares","rows":[{"label":"Ease of Use","us":"Simple daily use","them":"Complicated alternatives"}]}},
    {"type":"FAQ","config":{"items":[{"question":"How long until I see results?","answer":"Individual results vary; consistent daily use over several weeks is recommended."}]}},
    {"type":"CTA_BANNER","config":{"style":"final","headline":"Get Yours Today","buttonLabel":"Order Now","ctaTarget":"order-form"}},
    {"type":"PACKAGE_SELECTOR","config":{}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb
where template_key = 'template_3';

comment on table public.landing_page_templates is
  'System + custom landing-page templates. starter_sections is a convenience preset copied into landing_page_sections at page-creation time — never a rendering constraint afterward (0031). All four system templates'' starter_sections were corrected/refreshed in 0044 (see that migration''s header comment: PART C fixes a real config-key mismatch bug in Templates 1-3, PART B refreshes Template 4). This only affects pages created from a template from this point forward.';
