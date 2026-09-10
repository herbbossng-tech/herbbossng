-- ============================================================
-- GOLDEN COMMERCE OS — rebuild the "Editorial Apothecary Funnel"
-- system template's starter_sections. The previous version (0044
-- PART C) used only vague placeholder copy ("Ingredient 1", "Role
-- in the blend", "Describe the products premium positioning...").
-- This migration replaces it with a real, structured long-form COD
-- flow (promo ticker, hero with rating, benefit checklist, problem
-- agitation, a 7-item ingredient grid, a second benefits pass, a
-- comparison table, a guarantee block, a closing CTA and FAQ) built
-- entirely from EXISTING section types/config fields — no new
-- section types or config fields were added. Only the starter
-- content changes; existing pages built from earlier clones of this
-- template are untouched.
-- ============================================================

update public.landing_page_templates
set
  description = 'A long-form, conversion-optimized herbal wellness page — problem/agitation, a real ingredient breakdown, benefit checklists, a comparison table, and FAQ.',
  starter_sections = '[
    {
      "type": "TRUST_STRIP",
      "config": {
        "style": "ticker",
        "items": [
          {"text": "50% Off With Payment on Delivery"},
          {"text": "100% Natural Herbal Ingredients"},
          {"text": "Cash on Delivery"}
        ]
      }
    },
    {
      "type": "HERO",
      "config": {
        "headline": "Your Body Is Screaming For Help",
        "subheadline": "The Daily Detox Tea That Works While You Sleep. Feel Lighter, Stronger & More Energized in Just Days.",
        "ctaLabel": "Buy Now - Cash on Delivery",
        "ctaTarget": "order-form",
        "priceLabel": "★ 4.8 (2,472 Reviews)",
        "imageUrl": null
      }
    },
    {
      "type": "TRUST_STRIP",
      "config": {
        "items": [
          {"icon": "🛡️", "text": "Immune Support+"},
          {"icon": "⚖️", "text": "Hormonal Balance+"},
          {"icon": "💪", "text": "Stamina Support+"}
        ]
      }
    },
    {
      "type": "BENEFITS",
      "config": {
        "items": [
          {"title": "Deep liver & kidney cleanse"},
          {"title": "Natural energy & stamina boost"},
          {"title": "Supports healthy libido & vitality"},
          {"title": "Helps balance hormones"},
          {"title": "Reduces bloating & sluggishness"}
        ],
        "ctaLabel": "Buy Now - Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "IMAGE_TEXT",
      "config": {
        "title": "Unlock Natural Energy, Deep Detox & Lasting Vitality",
        "body": "Ginseng Five Treasures Tea is your daily ritual for restoring balance, flushing toxins, and getting back the energy, drive, and lightness you have been missing.",
        "imagePosition": "right",
        "ctaLabel": "Buy with Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "BENEFITS",
      "config": {
        "title": "Our Kidney-Tonifying Tea Can Help You Greatly Enhance Your Quality of Life",
        "layout": "photo",
        "items": [
          {"title": "Soothes Your Skin''s Aging Effects"},
          {"title": "Eliminate Work Stress"},
          {"title": "Activate the Motivation of the Elderly"}
        ]
      }
    },
    {
      "type": "PROBLEM_AWARENESS",
      "config": {
        "headline": "Your Body Is Overloaded With Toxins",
        "body": "Packaged foods. Polluted air. Chronic stress. Poor sleep. Your liver and kidneys are working overtime — but they''re losing the battle.\n\nThe result? Constant fatigue, stubborn bloating, brain fog, dull skin, low drive, and that \"heavy\" feeling that won''t go away.\n\nThis isn''t normal aging. It''s toxin buildup. And it only gets worse until you do something about it.",
        "ctaLabel": "Buy Now - Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "INGREDIENTS",
      "config": {
        "headline": "Nature''s Most Powerful Daily Reset",
        "items": [
          {"name": "Red Dates", "description": "Boosts energy, supports blood health, improves digestion and strengthens immunity."},
          {"name": "Mulberries", "description": "Rich in antioxidants, supports eye health, promotes healthy aging and boosts immunity."},
          {"name": "Barley", "description": "Supports digestion, helps lower cholesterol, provides sustained energy and supports heart health."},
          {"name": "Polygonatum", "description": "Nourishes the body, supports lung health, boosts stamina and promotes moisture balance."},
          {"name": "Red Goji Berries", "description": "Supports eye health, boosts immunity, improves skin health and enhances vitality."},
          {"name": "Maca", "description": "Boosts energy & endurance, supports hormonal balance, enhances mood & stamina and supports reproductive health."},
          {"name": "American Ginseng", "description": "Boosts energy & focus, reduces stress & fatigue, supports immunity and promotes overall well-being."}
        ],
        "ctaLabel": "Buy Now - Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "TEXT",
      "config": {
        "title": "Feel Lighter, Stronger & More Alive Again",
        "body": "Modern life is slowly poisoning your system. The result? Low energy, stubborn weight, hormonal swings, poor sleep, and zero motivation.\n\nGinseng Five Treasures Tea combines Red Dates, Mulberries, Barley, Polygonatum, Red Goji Berries, Maca & American Ginseng — a time-tested blend used for centuries to gently detoxify, restore energy, support organs, and bring back natural vitality.\n\nOne cup a day. Real results you can feel.",
        "ctaLabel": "Buy Now - Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "BENEFITS",
      "config": {
        "eyebrow": "Users Report",
        "title": "Real Benefits You''ll Feel Within Days",
        "items": [
          {"title": "Deeper, more consistent energy (no crashes)"},
          {"title": "Noticeable reduction in bloating & heaviness"},
          {"title": "Better digestion and lighter feeling"},
          {"title": "Improved mood, focus & sleep quality"},
          {"title": "Stronger libido and physical stamina"},
          {"title": "Clearer skin and overall vitality"}
        ],
        "ctaLabel": "Buy Now - Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "COMPARISON",
      "config": {
        "headline": "Our Tea vs. Typical Detox Teas",
        "rows": [
          {"label": "100% Natural Herbal Ingredients", "us": "100% Natural Herbal Ingredients", "them": "Not always 100% natural"},
          {"label": "Gentle Daily Detox (No Harsh Laxatives)", "us": "Gentle daily detox — no harsh laxatives", "them": "May rely on harsh laxatives"},
          {"label": "Supports Liver, Kidney & Immune Health", "us": "Supports liver, kidney & immune health", "them": "No liver, kidney or immune support"},
          {"label": "Boosts Natural Energy & Libido", "us": "Boosts natural energy & libido", "them": "No energy or libido boost"},
          {"label": "Lasts Up to 6 Months Per Pack", "us": "Lasts up to 6 months per pack", "them": "Doesn''t last as long"}
        ],
        "ctaLabel": "Buy Now - Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "GUARANTEE",
      "config": {
        "headline": "One Cup a Day. Life-Changing Results.",
        "body": "No more dragging through the day. No more harsh chemical detoxes.",
        "ctaLabel": "Order Now - Cash on Delivery",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "CTA_BANNER",
      "config": {
        "buttonLabel": "Order Now - Cash on Delivery 🔥",
        "ctaTarget": "order-form"
      }
    },
    {
      "type": "FAQ",
      "config": {
        "items": [
          {"question": "How does this tea actually work?", "answer": "It is a blend of traditional herbal ingredients taken daily as part of your routine to support your body''s own detox and energy processes."},
          {"question": "Is it safe for daily long-term use?", "answer": "It is formulated for daily use. If you have a medical condition or take medication, consult a healthcare professional before starting any new herbal routine."},
          {"question": "How do I prepare it?", "answer": "Follow the preparation instructions on the pack — steep a sachet in hot water and enjoy as your daily cup."},
          {"question": "Suitable for both men and women?", "answer": "Yes — it is formulated to support both men and women as part of a daily wellness routine."}
        ]
      }
    },
    {"type": "PACKAGE_SELECTOR", "config": {}},
    {"type": "ORDER_FORM", "config": {}}
  ]'::jsonb
where workspace_id is null and slug = 'editorial-apothecary-funnel';
