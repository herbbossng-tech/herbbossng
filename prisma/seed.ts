import { PrismaClient, type LandingPageSectionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  console.log('Seeding COD Commerce...');

  // -------------------------------------------------------------------------
  // Super admin user
  // -------------------------------------------------------------------------
  const adminEmail = 'admin@codcommerce.test';
  const adminPassword = 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: 'Super Admin', email: adminEmail, passwordHash, role: 'SUPER_ADMIN' },
  });

  // -------------------------------------------------------------------------
  // Offices: Nigeria, Kenya, Ghana
  // -------------------------------------------------------------------------
  const nigeria = await upsertOffice({
    name: 'Nigeria',
    countryCode: 'NG',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    currencySymbolPosition: 'BEFORE',
    phoneCountryCode: '+234',
    phoneRegex: '^0[0-9]{10}$',
    divisionLabel: 'State',
    timezone: 'Africa/Lagos',
    locale: 'en-NG',
    orderNumberPrefix: 'NG',
    defaultDeliveryFee: 0,
    officeEmail: 'orders-ng@codcommerce.test',
    officePhone: '+2348012345678',
    whatsappNumber: '+2348012345678',
  });
  const kenya = await upsertOffice({
    name: 'Kenya',
    countryCode: 'KE',
    currencyCode: 'KES',
    currencySymbol: 'KSh',
    currencySymbolPosition: 'BEFORE',
    phoneCountryCode: '+254',
    phoneRegex: '^0[0-9]{9}$',
    divisionLabel: 'County',
    timezone: 'Africa/Nairobi',
    locale: 'en-KE',
    orderNumberPrefix: 'KE',
    defaultDeliveryFee: 300,
    officeEmail: 'orders-ke@codcommerce.test',
    officePhone: '+254712345678',
    whatsappNumber: '+254712345678',
  });
  const ghana = await upsertOffice({
    name: 'Ghana',
    countryCode: 'GH',
    currencyCode: 'GHS',
    currencySymbol: 'GH₵',
    currencySymbolPosition: 'BEFORE',
    phoneCountryCode: '+233',
    phoneRegex: '^0[0-9]{9}$',
    divisionLabel: 'Region',
    timezone: 'Africa/Accra',
    locale: 'en-GH',
    orderNumberPrefix: 'GH',
    defaultDeliveryFee: 20,
    officeEmail: 'orders-gh@codcommerce.test',
    officePhone: '+233241234567',
    whatsappNumber: '+233241234567',
  });

  await seedLocations(nigeria.id, {
    Lagos: { Ikeja: ['Ikeja GRA', 'Allen Avenue'], 'Lekki': ['Lekki Phase 1', 'Ajah'] },
    Abuja: { 'Central Area': [], Wuse: [] },
    Rivers: { 'Port Harcourt': [] },
  });
  await seedLocations(kenya.id, {
    Nairobi: { Nairobi: ['Westlands', 'CBD'] },
    Mombasa: { Mombasa: [] },
    Kisumu: { Kisumu: [] },
  });
  await seedLocations(ghana.id, {
    Greater_Accra: { Accra: ['Osu', 'East Legon'] },
    Ashanti: { Kumasi: [] },
  });

  // -------------------------------------------------------------------------
  // Brand + Product
  // -------------------------------------------------------------------------
  const brand = await db.brand.upsert({
    where: { name: 'Wellness247' },
    update: {},
    create: { name: 'Wellness247', primaryColor: '#0f3d2e', secondaryColor: '#b6862c' },
  });

  const product = await db.product.upsert({
    where: { slug: 'ginseng-five-treasures-tea' },
    update: {},
    create: {
      brandId: brand.id,
      sku: 'GFT-TEA-001',
      slug: 'ginseng-five-treasures-tea',
      name: 'Ginseng Five Treasures Tea',
      status: 'ACTIVE',
      shortDescription: 'A daily wellness tea ritual blending ginseng, red date, goji berry, mulberry and maca root.',
      longDescription:
        'Ginseng Five Treasures Tea combines five traditional roots and fruits into one steepable daily ritual, designed to support steady energy, healthy digestion and a sense of balance through a modern, busy life.',
      benefits: [
        'Supports steady, all-day energy',
        'Supports healthy digestion',
        'Supports immune resilience',
        'Supports fluid balance',
        'A calming daily ritual',
      ],
      ingredients: [
        { name: 'Ginseng', description: 'Traditionally used to support energy, stamina and vitality.' },
        { name: 'Red Date', description: 'Used in traditional wellness practices to support blood and digestion.' },
        { name: 'Goji Berry', description: 'Rich in antioxidants, traditionally used to support immunity.' },
        { name: 'Mulberry', description: 'Traditionally used to support healthy digestion and balance.' },
        { name: 'Maca Root', description: 'Traditionally used to support stamina and resilience.' },
      ],
      faq: [
        { question: 'How do I prepare the tea?', answer: 'Steep one sachet in hot water for 5 minutes, once or twice daily.' },
        { question: 'How is it delivered?', answer: 'We deliver nationwide with Cash on Delivery — you only pay when it arrives.' },
        { question: 'Is there a guarantee?', answer: 'Yes — reach out to our support team within 7 days of delivery if you are not satisfied.' },
      ],
      disclaimer: 'This product is a wellness product and is not intended to diagnose, treat, cure, or prevent any disease.',
      guaranteeText: 'Not satisfied? Reach out to our support team within 7 days of delivery.',
      deliveryInfo: 'Nationwide cash-on-delivery. You pay only when your order arrives at your door.',
      seoTitle: 'Ginseng Five Treasures Tea — A Daily Wellness Ritual',
      seoDescription: 'Ginseng, red date, goji, mulberry and maca — blended into a daily tea ritual. Cash on delivery, nationwide.',
    },
  });

  await db.productOffice.upsert({
    where: { productId_officeId: { productId: product.id, officeId: nigeria.id } },
    update: {},
    create: { productId: product.id, officeId: nigeria.id, price: 2699, compareAtPrice: 3499, stockQuantity: 500 },
  });
  await db.productOffice.upsert({
    where: { productId_officeId: { productId: product.id, officeId: kenya.id } },
    update: {},
    create: { productId: product.id, officeId: kenya.id, price: 2699, compareAtPrice: 3499, stockQuantity: 500 },
  });
  await db.productOffice.upsert({
    where: { productId_officeId: { productId: product.id, officeId: ghana.id } },
    update: {},
    create: { productId: product.id, officeId: ghana.id, price: 120, compareAtPrice: 160, stockQuantity: 500 },
  });

  // -------------------------------------------------------------------------
  // Offers (package engine)
  // -------------------------------------------------------------------------
  const offerDefs = [
    { name: 'Buy 1 Pack', subtitle: 'Your first pack', type: 'FIXED_QTY' as const, payQty: 1, freeQty: 0, sortOrder: 0, isDefault: false, prices: { NG: 2699, KE: 2699, GH: 120 } },
    {
      name: 'Buy 2 Pack — 40 Tea Bags',
      subtitle: '1 Month Detox',
      type: 'FIXED_QTY' as const,
      payQty: 2,
      freeQty: 0,
      sortOrder: 1,
      isDefault: false,
      badgeText: '1 Month Detox',
      prices: { NG: 4102, KE: 4102, GH: 183 },
      compareAt: { NG: 5398, KE: 5398, GH: 240 },
    },
    {
      name: 'Buy 3 Get 1 Free',
      subtitle: 'Most popular pick',
      type: 'BUY_X_GET_Y' as const,
      payQty: 3,
      freeQty: 1,
      sortOrder: 2,
      isDefault: true,
      badgeText: 'Most Popular',
      prices: { NG: 8097, KE: 8097, GH: 360 },
      compareAt: { NG: 10796, KE: 10796, GH: 480 },
    },
    {
      name: 'Buy 4 Get 2 Free',
      subtitle: 'Best value ritual',
      type: 'BUY_X_GET_Y' as const,
      payQty: 4,
      freeQty: 2,
      sortOrder: 3,
      isDefault: false,
      badgeText: 'Best Value',
      prices: { NG: 10796, KE: 10796, GH: 480 },
      compareAt: { NG: 16194, KE: 16194, GH: 720 },
    },
  ];

  for (const def of offerDefs) {
    const offer = await db.offer.findFirst({ where: { productId: product.id, name: def.name } });
    const offerRow = offer
      ? await db.offer.update({
          where: { id: offer.id },
          data: { subtitle: def.subtitle, type: def.type, payQty: def.payQty, freeQty: def.freeQty, sortOrder: def.sortOrder, isDefault: def.isDefault, badgeText: def.badgeText },
        })
      : await db.offer.create({
          data: {
            productId: product.id,
            name: def.name,
            subtitle: def.subtitle,
            type: def.type,
            payQty: def.payQty,
            freeQty: def.freeQty,
            sortOrder: def.sortOrder,
            isDefault: def.isDefault,
            badgeText: def.badgeText,
          },
        });

    for (const [cc, officeId] of [['NG', nigeria.id], ['KE', kenya.id], ['GH', ghana.id]] as const) {
      await db.offerOffice.upsert({
        where: { offerId_officeId: { offerId: offerRow.id, officeId } },
        update: { price: def.prices[cc], compareAtPrice: def.compareAt?.[cc] },
        create: { offerId: offerRow.id, officeId, price: def.prices[cc], compareAtPrice: def.compareAt?.[cc] },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Landing page (seeded per office, same content structure)
  // -------------------------------------------------------------------------
  for (const office of [nigeria, kenya, ghana]) {
    await seedLandingPage(product.id, office.id, office.name);
  }

  console.log('\nSeed complete.');
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  console.log('Visit /ginseng-five-treasures-tea?office=ng (or ke / gh)');
}

async function upsertOffice(input: {
  name: string;
  countryCode: string;
  currencyCode: string;
  currencySymbol: string;
  currencySymbolPosition: 'BEFORE' | 'AFTER';
  phoneCountryCode: string;
  phoneRegex: string;
  divisionLabel: string;
  timezone: string;
  locale: string;
  orderNumberPrefix: string;
  defaultDeliveryFee: number;
  officeEmail: string;
  officePhone: string;
  whatsappNumber: string;
}) {
  return db.office.upsert({
    where: { countryCode: input.countryCode },
    update: {},
    create: {
      ...input,
      sortOrder: input.countryCode === 'NG' ? 0 : input.countryCode === 'KE' ? 1 : 2,
      taxLabel: null,
      taxRate: 0,
      inventoryStrategy: 'RESERVE_ON_ORDER',
      officeAddress: `${input.name} HQ`,
      whatsappCtaText: 'Chat with us on WhatsApp',
    },
  });
}

async function seedLocations(officeId: string, tree: Record<string, Record<string, string[]>>) {
  for (const [divisionName, cities] of Object.entries(tree)) {
    const division = await db.division.upsert({
      where: { officeId_name: { officeId, name: divisionName.replaceAll('_', ' ') } },
      update: {},
      create: { officeId, name: divisionName.replaceAll('_', ' ') },
    });
    for (const [cityName, areas] of Object.entries(cities)) {
      const city = await db.city.upsert({
        where: { divisionId_name: { divisionId: division.id, name: cityName } },
        update: {},
        create: { divisionId: division.id, name: cityName },
      });
      for (const areaName of areas) {
        await db.deliveryArea.upsert({
          where: { cityId_name: { cityId: city.id, name: areaName } },
          update: {},
          create: { cityId: city.id, name: areaName },
        });
      }
    }
  }
}

async function seedLandingPage(productId: string, officeId: string, officeName: string) {
  const existing = await db.landingPage.findFirst({ where: { slug: 'ginseng-five-treasures-tea', officeId } });
  const page = existing
    ? existing
    : await db.landingPage.create({
        data: {
          productId,
          officeId,
          slug: 'ginseng-five-treasures-tea',
          title: 'Ginseng Five Treasures Tea',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          seoTitle: 'Ginseng Five Treasures Tea — A Daily Wellness Ritual',
          seoDescription: 'Five roots. One quiet ritual of repair. Cash on delivery, nationwide.',
        },
      });

  if (existing && existing.status !== 'PUBLISHED') {
    await db.landingPage.update({ where: { id: page.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  }

  const sections: { type: LandingPageSectionType; data: unknown }[] = [
    { type: 'ANNOUNCEMENT_BAR', data: { text: `Free Nationwide Delivery in ${officeName} • Cash On Delivery`, icon: '🚚' } },
    {
      type: 'HERO',
      data: {
        badge: 'Wellness Ritual',
        headline: 'Five roots. One quiet ritual of repair.',
        subheadline: 'Ginseng, red date, goji, mulberry and maca — blended into a daily tea ritual for steady energy and balance.',
        image: '',
        ctaText: 'Order Now — Pay on Delivery',
        trustPoints: ['Free Nationwide Delivery', 'Cash On Delivery', 'Quality Guarantee'],
      },
    },
    {
      type: 'TRUST_BADGES',
      data: {
        items: [
          { icon: '🚚', label: 'Free Nationwide Delivery' },
          { icon: '💵', label: 'Cash On Delivery' },
          { icon: '✅', label: 'Quality Guarantee' },
        ],
      },
    },
    {
      type: 'PROBLEM',
      data: {
        title: 'Do you recognize these signs?',
        intro: `Trusted by wellness seekers across ${officeName} — modern life quietly drains the body in ways that build up over time.`,
        signs: [
          { title: 'Constant fatigue', description: 'Waking up tired no matter how much you slept.' },
          { title: 'Kidney discomfort', description: 'A dull, nagging ache in the lower back.' },
          { title: 'Digestive trouble', description: 'Bloating and discomfort after meals.' },
          { title: 'Weak immunity', description: 'Catching every cold that goes around.' },
          { title: 'Water retention', description: 'Puffiness that will not go down.' },
          { title: 'Low energy', description: 'Reaching for another cup of coffee just to function.' },
        ],
      },
    },
    {
      type: 'FORMULA',
      data: {
        title: 'Five roots. One formula.',
        intro: 'Each ingredient plays a distinct role in the ritual.',
        ingredients: [
          { name: 'Ginseng', description: 'Traditionally used to support energy and vitality.' },
          { name: 'Red Date', description: 'Traditionally used to support blood and digestion.' },
          { name: 'Goji Berry', description: 'Rich in antioxidants, traditionally used to support immunity.' },
          { name: 'Mulberry', description: 'Traditionally used to support healthy digestion.' },
          { name: 'Maca Root', description: 'Traditionally used to support stamina and resilience.' },
        ],
      },
    },
    {
      type: 'HOW_IT_WORKS',
      data: {
        title: 'How to use it',
        steps: [
          { title: 'Steep', description: 'Steep one sachet in hot water for 5 minutes.' },
          { title: 'Sip', description: 'Drink once or twice daily, ideally morning and evening.' },
          { title: 'Repeat', description: 'Make it part of your daily ritual for at least 30 days.' },
        ],
      },
    },
    {
      type: 'BENEFITS',
      data: {
        title: 'Benefits',
        items: [
          'Supports steady, all-day energy',
          'Supports healthy digestion',
          'Supports immune resilience',
          'Supports fluid balance',
          'A calming daily ritual',
        ],
      },
    },
    {
      type: 'COMPARISON',
      data: {
        title: 'Why it is different',
        columns: ['Five Treasures Tea', 'Typical Tea'],
        rows: [
          { label: 'Five traditional roots', values: [true, false] },
          { label: 'Cash on delivery', values: [true, false] },
          { label: 'Daily ritual designed for balance', values: [true, false] },
        ],
      },
    },
    {
      type: 'TESTIMONIALS',
      data: {
        title: `Trusted by wellness seekers across ${officeName}`,
        items: [
          { name: 'Amaka J.', location: officeName, quote: 'I feel the difference every morning. This is now part of my daily routine.', rating: 5, verified: true },
          { name: 'Chidi O.', location: officeName, quote: 'Delivery was fast and I paid on arrival — no stress at all.', rating: 5, verified: true },
        ],
      },
    },
    { type: 'GUARANTEE', data: { title: 'Quality Guarantee', description: 'Not satisfied? Reach out within 7 days of delivery.', icon: '🛡️' } },
    {
      type: 'FAQ',
      data: {
        title: 'Frequently Asked Questions',
        items: [
          { question: 'How do I prepare the tea?', answer: 'Steep one sachet in hot water for 5 minutes, once or twice daily.' },
          { question: 'How is it delivered?', answer: `We deliver nationwide across ${officeName} with Cash on Delivery.` },
          { question: 'Is there a guarantee?', answer: 'Yes — contact support within 7 days of delivery if unsatisfied.' },
        ],
      },
    },
    { type: 'ORDER', data: { title: 'Select your package', showStickyCta: true, stickyCtaLabel: 'ORDER FROM {price} • PAY ON DELIVERY' } },
    { type: 'FOOTER', data: { brandName: 'Wellness247', tagline: 'A quiet ritual of repair.', links: [] } },
  ];

  const existingSections = await db.landingPageSection.findMany({ where: { landingPageId: page.id } });
  if (existingSections.length === 0) {
    for (let i = 0; i < sections.length; i++) {
      await db.landingPageSection.create({ data: { landingPageId: page.id, type: sections[i].type, sortOrder: i, data: sections[i].data as never } });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
