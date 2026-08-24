import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = "goldenempire25@gmail.com";
const ADMIN_PASSWORD = "ChangeMe123!";

async function main() {
  // ---------------------------------------------------------------------
  // Super admin
  // ---------------------------------------------------------------------
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      name: "Super Admin",
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: "SUPER_ADMIN",
    },
  });
  console.log(`Seeded super admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (change this password after first login)`);

  // ---------------------------------------------------------------------
  // Offices — Nigeria, Kenya, Ghana. Every field here is admin-editable
  // afterwards; this is just the starting configuration.
  // ---------------------------------------------------------------------
  const nigeria = await upsertOffice({
    name: "Nigeria",
    countryCode: "NG",
    currencyCode: "NGN",
    currencySymbol: "₦",
    divisionLabel: "State",
    phoneCountryCode: "+234",
    phoneRegex: "^0[789][01]\\d{8}$",
    orderPrefix: "NG-AF",
    timezone: "Africa/Lagos",
    whatsappNumber: "+2348012345678",
    officeEmail: "orders-ng@wellness247.example",
    officePhone: "+234 801 234 5678",
    defaultDeliveryFee: 1500,
    freeDeliveryThreshold: 15000,
    decimalDigits: 0,
    divisions: {
      Lagos: ["Ikeja", "Lekki", "Surulere"],
      Abuja: ["Garki", "Wuse", "Gwarinpa"],
      "Akwa Ibom": ["Uyo", "Eket"],
      Rivers: ["Port Harcourt"],
    },
    freeZones: ["Lagos", "Abuja"],
  });

  const kenya = await upsertOffice({
    name: "Kenya",
    countryCode: "KE",
    currencyCode: "KES",
    currencySymbol: "KSh ",
    divisionLabel: "County",
    phoneCountryCode: "+254",
    phoneRegex: "^0[71]\\d{8}$",
    orderPrefix: "KE-AF",
    timezone: "Africa/Nairobi",
    whatsappNumber: "+254712345678",
    officeEmail: "orders-ke@wellness247.example",
    officePhone: "+254 712 345 678",
    defaultDeliveryFee: 300,
    freeDeliveryThreshold: 5000,
    decimalDigits: 0,
    divisions: {
      Nairobi: ["Nairobi CBD", "Westlands", "Kasarani"],
      Mombasa: ["Mombasa Island", "Nyali"],
      Kisumu: ["Kisumu Central"],
    },
    freeZones: ["Nairobi"],
  });

  const ghana = await upsertOffice({
    name: "Ghana",
    countryCode: "GH",
    currencyCode: "GHS",
    currencySymbol: "GH₵",
    divisionLabel: "Region",
    phoneCountryCode: "+233",
    phoneRegex: "^0[2357]\\d{8}$",
    orderPrefix: "GH-AF",
    timezone: "Africa/Accra",
    whatsappNumber: "+233241234567",
    officeEmail: "orders-gh@wellness247.example",
    officePhone: "+233 24 123 4567",
    defaultDeliveryFee: 30,
    freeDeliveryThreshold: 400,
    divisions: {
      "Greater Accra": ["Accra", "Tema"],
      Ashanti: ["Kumasi"],
    },
    freeZones: ["Greater Accra"],
  });

  // ---------------------------------------------------------------------
  // Product 1: Ginseng Five Treasures Tea
  // ---------------------------------------------------------------------
  const tea = await prisma.product.upsert({
    where: { slug: "ginseng-five-treasures-tea" },
    update: {},
    create: {
      name: "Ginseng Five Treasures Tea",
      slug: "ginseng-five-treasures-tea",
      sku: "GFT-TEA-001",
      category: "Wellness Tea",
      brand: "Wellness247",
      shortDescription: "Five roots. One quiet ritual of repair.",
      longDescription:
        "A daily tea blend built around five traditional roots — ginseng, red date, goji berry, mulberry and maca — brewed to support steady energy, resilience and calm through the day.",
      benefits: [
        "Supports steady, all-day energy without the crash",
        "Helps the body build resilience to daily stress",
        "Supports healthy digestion",
        "Supports the body's natural immune defences",
        "Caffeine-free evening ritual",
      ],
      ingredients: [
        { name: "Ginseng", description: "A traditional root used for centuries to support stamina and focus." },
        { name: "Red Date", description: "A gently sweet fruit traditionally used to support blood and energy." },
        { name: "Goji Berry", description: "A nutrient-dense berry associated with resilience and vitality." },
        { name: "Mulberry", description: "A mild, fruity leaf traditionally used to support digestion." },
        { name: "Maca Root", description: "An adaptogenic root traditionally used to support stamina and balance." },
      ],
      faq: [
        { question: "How do I prepare it?", answer: "Steep one sachet in hot water for 5–8 minutes. Enjoy once or twice daily." },
        { question: "Is it caffeine-free?", answer: "Yes — it's suitable for evening use." },
        { question: "How long until I notice a difference?", answer: "Most people build it into a daily ritual over 2–4 weeks." },
        { question: "Is delivery really free?", answer: "Delivery is free in major cities and low-cost everywhere else — shown at checkout before you pay." },
      ],
      guarantee: "Not satisfied within 14 days of delivery? Contact us and we'll make it right.",
      deliveryInfo: "Delivered in 2–4 business days. Pay only when it arrives at your door.",
      disclaimer:
        "This product is a wellness product and is not intended to diagnose, treat, cure, or prevent any disease.",
      seoTitle: "Ginseng Five Treasures Tea — Wellness247",
      seoDescription: "Five traditional roots in one daily tea ritual. Cash on delivery, free nationwide shipping.",
      status: "ACTIVE",
    },
  });

  await upsertProductOffice(tea.id, nigeria.id, { cost: 900, sell: 2699, compareAt: undefined });
  await upsertProductOffice(tea.id, kenya.id, { cost: 900, sell: 2699, compareAt: undefined });
  await upsertProductOffice(tea.id, ghana.id, { cost: 30, sell: 90, compareAt: undefined });

  await seedOffers(tea.id, {
    [nigeria.id]: { unit: 2699 },
    [kenya.id]: { unit: 2699 },
    [ghana.id]: { unit: 90 },
  });

  await seedLandingPage(tea.id, "ginseng-five-treasures-tea", "Ginseng Five Treasures Tea — Main");

  // ---------------------------------------------------------------------
  // Product 2: Revival Blend — proves the platform supports multiple
  // products/pages without any code changes (brief §65).
  // ---------------------------------------------------------------------
  const revival = await prisma.product.upsert({
    where: { slug: "revival-blend" },
    update: {},
    create: {
      name: "Revival Blend",
      slug: "revival-blend",
      sku: "RVB-001",
      category: "Wellness Tea",
      brand: "Wellness247",
      shortDescription: "Nourish. Support. Restore.",
      longDescription: "A daily botanical blend formulated to nourish the body, support natural balance, and help you feel restored.",
      benefits: ["Nourishes the body daily", "Supports natural balance", "Helps you feel restored", "100% natural ingredients"],
      ingredients: [
        { name: "Moringa", description: "A nutrient-dense leaf traditionally used for daily nourishment." },
        { name: "Hibiscus", description: "A tart botanical traditionally used to support circulation." },
        { name: "Ginger", description: "A warming root traditionally used to support digestion." },
      ],
      faq: [{ question: "Is it natural?", answer: "Yes — 100% natural botanical ingredients." }],
      guarantee: "14-day satisfaction guarantee.",
      deliveryInfo: "Delivered in 2–4 business days. Pay on delivery.",
      disclaimer: "This product is a wellness product and is not intended to diagnose, treat, cure, or prevent any disease.",
      status: "ACTIVE",
    },
  });

  await upsertProductOffice(revival.id, nigeria.id, { cost: 800, sell: 2499, compareAt: undefined });
  await seedOffers(revival.id, { [nigeria.id]: { unit: 2499 } });
  await seedLandingPage(revival.id, "revival-blend", "Revival Blend — Main", nigeria.id);

  // ---------------------------------------------------------------------
  // Email templates
  // ---------------------------------------------------------------------
  await seedEmailTemplates();

  console.log("Seed complete.");
}

async function upsertOffice(input: {
  name: string;
  countryCode: string;
  currencyCode: string;
  currencySymbol: string;
  divisionLabel: string;
  phoneCountryCode: string;
  phoneRegex: string;
  orderPrefix: string;
  timezone: string;
  whatsappNumber: string;
  officeEmail: string;
  officePhone: string;
  defaultDeliveryFee: number;
  freeDeliveryThreshold: number;
  divisions: Record<string, string[]>;
  freeZones: string[];
  decimalDigits?: number;
}) {
  const office = await prisma.office.upsert({
    where: { countryCode: input.countryCode },
    update: { decimalDigits: input.decimalDigits ?? 2 },
    create: {
      name: input.name,
      countryCode: input.countryCode,
      currencyCode: input.currencyCode,
      currencySymbol: input.currencySymbol,
      divisionLabel: input.divisionLabel,
      phoneCountryCode: input.phoneCountryCode,
      phoneRegex: input.phoneRegex,
      orderPrefix: input.orderPrefix,
      timezone: input.timezone,
      whatsappNumber: input.whatsappNumber,
      officeEmail: input.officeEmail,
      officePhone: input.officePhone,
      officeAddress: `${input.name} Fulfilment Centre`,
      defaultDeliveryFee: input.defaultDeliveryFee,
      freeDeliveryThreshold: input.freeDeliveryThreshold,
      decimalDigits: input.decimalDigits ?? 2,
      inventoryStrategy: "RESERVATION",
    },
  });

  let sortOrder = 0;
  for (const [divisionName, cities] of Object.entries(input.divisions)) {
    const division = await prisma.locationDivision.upsert({
      where: { officeId_name: { officeId: office.id, name: divisionName } },
      update: {},
      create: { officeId: office.id, name: divisionName, sortOrder: sortOrder++ },
    });
    let citySort = 0;
    for (const cityName of cities) {
      await prisma.city.upsert({
        where: { divisionId_name: { divisionId: division.id, name: cityName } },
        update: {},
        create: { divisionId: division.id, name: cityName, sortOrder: citySort++ },
      });
    }
    if (input.freeZones.includes(divisionName)) {
      const existingZone = await prisma.deliveryZone.findFirst({ where: { officeId: office.id, divisionId: division.id, cityId: null } });
      if (!existingZone) {
        await prisma.deliveryZone.create({
          data: { officeId: office.id, divisionId: division.id, name: `${divisionName} (free)`, fee: 0, isFree: true, estimatedDays: "1-2 days" },
        });
      }
    }
  }

  return office;
}

async function upsertProductOffice(productId: string, officeId: string, price: { cost: number; sell: number; compareAt?: number }) {
  const po = await prisma.productOffice.upsert({
    where: { productId_officeId: { productId, officeId } },
    update: { costPrice: price.cost, sellingPrice: price.sell, compareAtPrice: price.compareAt },
    create: { productId, officeId, costPrice: price.cost, sellingPrice: price.sell, compareAtPrice: price.compareAt, lowStockThreshold: 20 },
  });

  const existingInventory = await prisma.inventory.findUnique({ where: { productOfficeId: po.id } });
  if (!existingInventory) {
    await prisma.inventory.create({
      data: {
        productOfficeId: po.id,
        quantityOnHand: 500,
        movements: { create: { type: "STOCK_ADDITION", quantity: 500, reason: "Initial seed stock" } },
      },
    });
  }
  return po;
}

async function seedOffers(productId: string, unitPriceByOffice: Record<string, { unit: number }>) {
  const officeIds = Object.keys(unitPriceByOffice);

  const definitions = [
    { title: "Buy 1 Pack", subtitle: "Your first pack", paid: 1, free: 0, badge: null, isDefault: false, sortOrder: 0 },
    { title: "Buy 2 Packs", subtitle: "1 Month Detox", paid: 2, free: 0, badge: "1 MONTH DETOX", isDefault: true, sortOrder: 1 },
    { title: "Buy 3 Get 1 Free", subtitle: null, paid: 3, free: 1, badge: "MOST POPULAR", isDefault: false, sortOrder: 2 },
    { title: "Buy 4 Get 2 Free", subtitle: null, paid: 4, free: 2, badge: "BEST VALUE", isDefault: false, sortOrder: 3 },
  ];

  for (const def of definitions) {
    const existing = await prisma.offer.findFirst({ where: { productId, title: def.title } });
    const offer =
      existing ??
      (await prisma.offer.create({
        data: {
          productId,
          type: def.free > 0 ? "BUY_X_GET_Y_FREE" : "FIXED_QUANTITY",
          title: def.title,
          subtitle: def.subtitle,
          badge: def.badge,
          badgeColor: "gold",
          paidQuantity: def.paid,
          freeQuantity: def.free,
          isDefault: def.isDefault,
          sortOrder: def.sortOrder,
        },
      }));

    for (const officeId of officeIds) {
      const unit = unitPriceByOffice[officeId].unit;
      const price = Math.round(unit * def.paid * 100) / 100;
      const compareAt = Math.round(unit * (def.paid + def.free) * 100) / 100;
      await prisma.offerOffice.upsert({
        where: { offerId_officeId: { offerId: offer.id, officeId } },
        update: { price, compareAtPrice: compareAt },
        create: { offerId: offer.id, officeId, price, compareAtPrice: compareAt },
      });
    }
  }
}

async function seedLandingPage(productId: string, slug: string, title: string, officeId?: string) {
  const existing = await prisma.landingPage.findUnique({ where: { slug } });
  if (existing) return existing;

  const page = await prisma.landingPage.create({
    data: {
      productId,
      officeId: officeId ?? null,
      slug,
      title,
      status: "PUBLISHED",
      publishedAt: new Date(),
      seoTitle: title,
      stickyCtaText: "ORDER FROM {price} • PAY ON DELIVERY",
      sections: {
        create: [
          { type: "ANNOUNCEMENT_BAR", sortOrder: 0, content: { text: "Free delivery in major cities · Pay on delivery" } },
          {
            type: "HERO",
            sortOrder: 1,
            content: {
              badge: "Trusted by wellness seekers",
              headline: "Five roots. One quiet ritual of repair.",
              subheadline: "A daily tea blend built to support steady energy, resilience and calm.",
              ctaText: "Order now",
            },
          },
          {
            type: "TRUST_BADGES",
            sortOrder: 2,
            content: {
              items: [
                { title: "Free Delivery", subtitle: "In major cities" },
                { title: "Cash On Delivery", subtitle: "Pay when it arrives" },
                { title: "Quality Guarantee", subtitle: "14-day promise" },
              ],
            },
          },
          {
            type: "PROBLEM",
            sortOrder: 3,
            content: {
              title: "Does this sound familiar?",
              intro: "Many people quietly deal with the same daily signs.",
              points: [
                { title: "Constant fatigue", description: "Running on empty by mid-afternoon." },
                { title: "Low energy", description: "Struggling to keep up with the day." },
                { title: "Digestive trouble", description: "Feeling off after meals." },
                { title: "Weak immunity", description: "Catching every seasonal bug." },
              ],
            },
          },
          {
            type: "FORMULA",
            sortOrder: 4,
            content: {
              title: "Five treasures, one blend",
              intro: "Traditional roots, brought together in a daily ritual.",
              ingredients: [
                { name: "Ginseng", description: "Supports stamina and focus." },
                { name: "Red Date", description: "Supports blood and energy." },
                { name: "Goji Berry", description: "Supports resilience and vitality." },
                { name: "Mulberry", description: "Supports digestion." },
                { name: "Maca Root", description: "Supports stamina and balance." },
              ],
            },
          },
          {
            type: "HOW_IT_WORKS",
            sortOrder: 5,
            content: {
              title: "How to use it",
              steps: [
                { title: "Steep", description: "One sachet in hot water for 5–8 minutes." },
                { title: "Sip", description: "Enjoy once or twice daily." },
                { title: "Repeat", description: "Build it into your daily ritual." },
              ],
            },
          },
          {
            type: "BENEFITS",
            sortOrder: 6,
            content: {
              title: "Why people stick with it",
              items: [
                "Supports steady, all-day energy",
                "Helps the body build resilience to stress",
                "Supports healthy digestion",
                "Supports natural immune defences",
                "Caffeine-free evening ritual",
              ],
            },
          },
          {
            type: "COMPARISON",
            sortOrder: 7,
            content: {
              title: "Why it's different",
              beforeTitle: "Other blends",
              afterTitle: "Five Treasures Tea",
              beforeItems: ["Single ingredient", "Caffeinated", "Generic sourcing"],
              afterItems: ["Five traditional roots", "Caffeine-free", "Consistent quality sourcing"],
            },
          },
          {
            type: "GUARANTEE",
            sortOrder: 8,
            content: { title: "Our promise to you", description: "Not satisfied within 14 days of delivery? Contact us and we'll make it right." },
          },
          {
            type: "TESTIMONIALS",
            sortOrder: 9,
            content: {
              title: "What customers say",
              items: [
                { name: "Amaka J.", location: "Lagos", rating: 5, quote: "Part of my morning ritual now — I actually notice the difference by afternoon." },
                { name: "Wanjiru K.", location: "Nairobi", rating: 5, quote: "Delivery was fast and I paid on arrival, no stress." },
                { name: "Kwabena O.", location: "Accra", rating: 4, quote: "Good taste, easy to prepare, will reorder." },
              ],
            },
          },
          {
            type: "FAQ",
            sortOrder: 10,
            content: {
              title: "Frequently asked questions",
              items: [
                { question: "How do I prepare it?", answer: "Steep one sachet in hot water for 5–8 minutes." },
                { question: "Is it caffeine-free?", answer: "Yes — suitable for evening use." },
                { question: "How does delivery work?", answer: "We deliver to your door and you pay cash on arrival." },
              ],
            },
          },
          { type: "ORDER", sortOrder: 11, content: { title: "Select your package" } },
          {
            type: "FOOTER",
            sortOrder: 12,
            content: { text: "Wellness247 — wellness products, not intended to diagnose, treat, cure or prevent any disease." },
          },
        ],
      },
    },
  });

  return page;
}

async function seedEmailTemplates() {
  const templates: {
    key: "NEW_ORDER_ADMIN" | "ORDER_CONFIRMATION_CUSTOMER" | "ORDER_CONFIRMED" | "ORDER_DISPATCHED" | "ORDER_OUT_FOR_DELIVERY" | "ORDER_DELIVERED" | "ORDER_CANCELLED" | "ORDER_FAILED_DELIVERY";
    name: string;
    subject: string;
    bodyHtml: string;
  }[] = [
    {
      key: "NEW_ORDER_ADMIN",
      name: "New order (to your team)",
      subject: "New order received — {{order_number}}",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">New order received</h2><p style="color:#666;margin:0 0 12px;">A customer just placed an order.</p>{{order_info_rows}}<hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />{{order_summary_rows}}`,
    },
    {
      key: "ORDER_CONFIRMATION_CUSTOMER",
      name: "Order confirmation (to customer)",
      subject: "We received your order — {{order_number}}",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">Thank you, {{customer_name}}!</h2><p style="color:#666;margin:0 0 12px;">We've received your order and will be in touch shortly to confirm delivery.</p>{{order_summary_rows}}<p style="margin-top:16px;color:#666;">You'll pay by cash when your order arrives.</p>`,
    },
    {
      key: "ORDER_CONFIRMED",
      name: "Order confirmed",
      subject: "Your order {{order_number}} is confirmed",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">Order confirmed</h2><p style="color:#666;">Hi {{customer_name}}, your order is confirmed and being prepared.</p>{{order_summary_rows}}`,
    },
    {
      key: "ORDER_DISPATCHED",
      name: "Order dispatched",
      subject: "Your order {{order_number}} is on its way",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">On its way!</h2><p style="color:#666;">Hi {{customer_name}}, your order has been dispatched to {{delivery_address}}, {{city}}.</p>`,
    },
    {
      key: "ORDER_OUT_FOR_DELIVERY",
      name: "Out for delivery",
      subject: "Your order {{order_number}} is out for delivery",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">Out for delivery</h2><p style="color:#666;">Hi {{customer_name}}, your order will arrive today. Please have {{total}} ready in cash.</p>`,
    },
    {
      key: "ORDER_DELIVERED",
      name: "Delivered",
      subject: "Your order {{order_number}} was delivered",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">Delivered — enjoy!</h2><p style="color:#666;">Hi {{customer_name}}, thanks for your order. We hope you enjoy it.</p>`,
    },
    {
      key: "ORDER_CANCELLED",
      name: "Cancelled",
      subject: "Your order {{order_number}} was cancelled",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">Order cancelled</h2><p style="color:#666;">Hi {{customer_name}}, your order {{order_number}} has been cancelled. Contact us if this wasn't expected.</p>`,
    },
    {
      key: "ORDER_FAILED_DELIVERY",
      name: "Failed delivery",
      subject: "We couldn't deliver order {{order_number}}",
      bodyHtml: `<h2 style="margin:0 0 4px;font-size:18px;">Delivery attempt unsuccessful</h2><p style="color:#666;">Hi {{customer_name}}, we tried to deliver your order but were unable to reach you. We'll be in touch to reschedule.</p>`,
    },
  ];

  for (const t of templates) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      update: {},
      create: {
        key: t.key,
        name: t.name,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        brandName: "Wellness247",
        headerColor: "#0f3d2e",
        accentColor: "#c9a24b",
        footerText: "Wellness247 · Cash on delivery, always.",
        isActive: true,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
