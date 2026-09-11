-- =====================================================================
-- GCOS — Template 4: structural fidelity pass + starter package seeding
-- =====================================================================
-- Follow-up to 0044. The workspace confirmed Template 4 should match
-- their reference page's SECTION STRUCTURE, ORDER, ingredient/package
-- data, and photo layout closely, and asked for the two photo-collage
-- sections that were missing in 0044 to be restored (with placeholder
-- image slots, since no real photo assets were provided) and for the
-- full 6-item symptom list / "Most Popular" package badge to come back.
-- Section-level marketing copy (headlines, body sentences, FAQ wording,
-- testimonials) is still original GCOS wording, not transcribed
-- sentence-for-sentence from the reference page — this migration does
-- not change that.
--
-- PART A — genuine schema gap: landing_page_templates had no way to
-- seed starter PACKAGES the way it already seeds starter SECTIONS, so
-- "Import Default Data" behavior for Template 4 (or any template) was
-- incomplete — a workspace creating a page from a template got the
-- section copy but had to build package tiers from scratch by hand.
-- Additive, backward-compatible: existing templates default to an
-- empty array (byte-identical behavior to today) until explicitly
-- seeded.
-- =====================================================================

alter table public.landing_page_templates
  add column if not exists starter_packages jsonb not null default '[]'::jsonb;

comment on column public.landing_page_templates.starter_packages is
  'Optional starter package tiers, seeded into landing_page_packages at page-creation time the same way starter_sections seeds landing_page_sections (0045) — never a constraint afterward. Shape: [{name, quantity, price, compare_at_price?, badge?, savings_text?, offer_text?, is_default?}].';


-- ---------------------------------------------------------------------
-- PART B — Template 4: restore full structure + seed starter packages.
-- ---------------------------------------------------------------------
update public.landing_page_templates
set starter_sections = '[
    {"type":"CTA_BANNER","config":{"style":"urgency","buttonLabel":"Claim Yours — Pay on Delivery","ctaTarget":"order-form"}},
    {"type":"HERO","config":{"eyebrow":"Apothecary Formula · HerbBossNG","headline":"Five Roots, One Daily Ritual of Renewal","subheadline":"A traditional five-herb blend — ginseng, red date, goji, mulberry and maca — brewed into one simple daily cup for steady energy and everyday wellness.","ctaLabel":"Order Now","ctaTarget":"order-form","imageUrl":null,"priceLabel":"From KSh 2,699 · Free Delivery"}},
    {"type":"TRUST_STRIP","config":{"items":[{"text":"100% Natural"},{"text":"Free Delivery"},{"text":"Cash On Delivery"},{"text":"Quality Guarantee"}]}},
    {"type":"TRUST_STRIP","config":{"style":"ticker","items":[{"text":"Cash On Delivery"},{"text":"Quality Guarantee"}]}},
    {"type":"BENEFITS","config":{"tone":"warning","eyebrow":"Is Your Body Giving You These Signs?","title":"Five Signs Worth Paying Attention To","items":[
      {"icon":"😴","title":"Constant Fatigue","description":"Waking up tired even after a full night''s rest."},
      {"icon":"🩺","title":"Kidney Discomfort","description":"A dull ache settling in the lower back."},
      {"icon":"🍽️","title":"Digestive Trouble","description":"Bloating and sluggish digestion after meals."},
      {"icon":"🛡️","title":"Weak Immunity","description":"Catching colds more often than usual."},
      {"icon":"💧","title":"Water Retention","description":"Puffiness that builds up as the day goes on."},
      {"icon":"🔋","title":"Low Energy","description":"Losing focus and drive by mid-afternoon."}
    ]}},
    {"type":"TEXT","config":{"eyebrow":"The Formula","title":"Five Treasures, Steeped Into One Cup","body":"Every ingredient plays a role — ginseng for steady energy, red date and goji for gentle nourishment, mulberry for balance, and maca for recovery. Brewed as a simple daily tea, with no capsules and no complicated routine.","ctaLabel":"See The Blend","ctaTarget":"formula"}},
    {"type":"INGREDIENTS","config":{"headline":"Five Treasures, Five Roles","items":[
      {"name":"Ginseng","description":"Steady, all-day energy."},
      {"name":"Red Date","description":"Gentle daily nourishment."},
      {"name":"Goji Berry","description":"Antioxidant support."},
      {"name":"Mulberry","description":"Everyday balance."},
      {"name":"Maca Root","description":"Recovery and stamina."}
    ]}},
    {"type":"HOW_IT_WORKS","config":{"title":"The Ritual","steps":[
      {"title":"Boil fresh water","description":"Bring clean water to a gentle boil."},
      {"title":"Steep the blend","description":"Let the herbs steep until the aroma turns rich and full."},
      {"title":"Drink daily","description":"One cup a day, consistently, is what makes the ritual work."}
    ]}},
    {"type":"BENEFITS","config":{"title":"Are You Still Facing These Challenges?","items":[
      {"title":"High Work Pressure","imageUrl":null},
      {"title":"Unhealthy Lifestyle","imageUrl":null},
      {"title":"Late Nights","imageUrl":null},
      {"title":"Sore Back & Waist","imageUrl":null}
    ]}},
    {"type":"BENEFITS","config":{"title":"What Customers Come Back For","items":[
      {"icon":"🌿","title":"Kidney Wellness Support","description":"Traditionally associated with kidney wellness as part of a healthy routine."},
      {"icon":"⚡","title":"Steady Energy","description":"A ginseng-led blend built for stamina, not a caffeine spike."},
      {"icon":"🛡️","title":"Stronger Immunity","description":"Supports your body''s natural defenses."},
      {"icon":"💧","title":"Easier Digestion","description":"Eases bloating and supports a calmer, more regular gut."},
      {"icon":"🌙","title":"Less Inflammation","description":"Soothes recurring joint discomfort and puffiness."},
      {"icon":"🌱","title":"Better Recovery","description":"A calming evening ritual that helps your body reset overnight."}
    ]}},
    {"type":"BENEFITS","config":{"title":"Nourish Your Body, Elevate Your Day","items":[
      {"title":"Boosts Energy & Stamina","imageUrl":null},
      {"title":"Boosts Immunity","imageUrl":null},
      {"title":"Supports Eye Health","imageUrl":null}
    ]}},
    {"type":"COMPARISON","config":{"headline":"Not Your Typical Herbal Tea","rows":[
      {"label":"Ingredients","us":"Real, whole herbs","them":"Artificial flavoring"},
      {"label":"Formula","us":"Five-treasure blend, brewed fresh","them":"Hidden fillers"},
      {"label":"Potency","us":"Full-bodied traditional blend","them":"Low potency, one-note blends"},
      {"label":"Ordering","us":"Cash on delivery, zero risk","them":"Online payment only"}
    ]}},
    {"type":"HOW_IT_WORKS","config":{"title":"What A Daily Ritual Looks Like","steps":[
      {"eyebrow":"First Few Days","title":"Building the Habit","description":"A warm cup becomes part of the morning or evening — nothing forced."},
      {"eyebrow":"About 2 Weeks","title":"Finding a Rhythm","description":"The ritual starts to feel routine instead of a chore."},
      {"eyebrow":"About 1 Month","title":"A Settled Routine","description":"The daily cup becomes simply part of how the day starts or ends."}
    ]}},
    {"type":"TESTIMONIALS","config":{"items":[]}},
    {"type":"GUARANTEE","config":{"headline":"Order With Confidence","body":"Pay only when your order arrives at your door — no upfront payment required."}},
    {"type":"FAQ","config":{"items":[
      {"question":"How do I pay for my order?","answer":"You pay in cash only when your order is delivered to your door."},
      {"question":"How long does delivery take?","answer":"Delivery timelines vary by location — our team will confirm an estimate when your order is confirmed."},
      {"question":"How do I prepare the tea?","answer":"Boil water, steep the blend, and enjoy one cup a day."}
    ]}},
    {"type":"CTA_BANNER","config":{"style":"final","headline":"Start Your Daily Ritual Today","buttonLabel":"Claim Yours Now","ctaTarget":"order-form"}},
    {"type":"PACKAGE_SELECTOR","config":{"title":"Choose Your Package"}},
    {"type":"ORDER_FORM","config":{}}
  ]'::jsonb,
  starter_packages = '[
    {"name":"Buy 1 Pack","quantity":1,"price":2699},
    {"name":"Buy 2 Pack","quantity":2,"price":4858,"compare_at_price":5398,"badge":"Most Popular","savings_text":"SAVE 10%"},
    {"name":"Buy 4, Get 2 Free","quantity":6,"price":10796,"compare_at_price":16194,"badge":"Best Value","savings_text":"SAVE 33%","is_default":true},
    {"name":"Buy 8, Get 4 Free","quantity":12,"price":21592,"compare_at_price":32388,"badge":"Super Value","savings_text":"SAVE 33%"}
  ]'::jsonb
where template_key = 'template_4';
