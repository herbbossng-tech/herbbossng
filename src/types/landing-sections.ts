// Typed shapes for LandingPageSection.data, keyed by LandingPageSectionType.
// These are also used as the JSON editor placeholders in the admin CMS, so the
// shape doubles as inline documentation for whoever is editing content.

export interface AnnouncementBarData {
  text: string;
  icon?: string;
}

export interface HeroData {
  badge?: string;
  headline: string;
  subheadline?: string;
  image?: string;
  ctaText?: string;
  trustPoints?: string[];
}

export interface TrustBadgesData {
  items: { icon: string; label: string }[];
}

export interface ProblemData {
  title: string;
  intro?: string;
  signs: { title: string; description: string }[];
}

export interface FormulaData {
  title: string;
  intro?: string;
  ingredients: { name: string; description: string; image?: string }[];
}

export interface HowItWorksData {
  title: string;
  steps: { title: string; description: string }[];
}

export interface BenefitsData {
  title: string;
  items: string[];
}

export interface ComparisonData {
  title: string;
  columns: string[]; // e.g. ["Us", "Others"]
  rows: { label: string; values: (boolean | string)[] }[];
}

export interface TestimonialsData {
  title: string;
  items: { name: string; location?: string; quote: string; rating?: number; verified?: boolean }[];
}

export interface GuaranteeData {
  title: string;
  description: string;
  icon?: string;
}

export interface FaqData {
  title: string;
  items: { question: string; answer: string }[];
}

export interface OrderData {
  title?: string;
  subtitle?: string;
  showStickyCta?: boolean;
  stickyCtaLabel?: string; // e.g. "ORDER FROM {price} • PAY ON DELIVERY"
}

export interface FooterData {
  brandName?: string;
  tagline?: string;
  links?: { label: string; url: string }[];
}

export const SECTION_PLACEHOLDERS: Record<string, unknown> = {
  ANNOUNCEMENT_BAR: { text: 'Free Nationwide Delivery • Cash On Delivery', icon: '🚚' } satisfies AnnouncementBarData,
  HERO: {
    badge: 'Wellness Ritual',
    headline: 'Five roots. One quiet ritual of repair.',
    subheadline: 'Ginseng, red date, goji, mulberry and maca — blended into a daily tea ritual.',
    image: '',
    ctaText: 'Order Now',
    trustPoints: ['Free Nationwide Delivery', 'Cash On Delivery', 'Quality Guarantee'],
  } satisfies HeroData,
  TRUST_BADGES: {
    items: [
      { icon: '🚚', label: 'Free Nationwide Delivery' },
      { icon: '💵', label: 'Cash On Delivery' },
      { icon: '✅', label: 'Quality Guarantee' },
    ],
  } satisfies TrustBadgesData,
  PROBLEM: {
    title: 'Do you recognize these signs?',
    intro: 'Modern life quietly drains the body in ways that build up over time.',
    signs: [
      { title: 'Constant fatigue', description: 'Waking up tired no matter how much you slept.' },
      { title: 'Kidney discomfort', description: 'A dull, nagging ache in the lower back.' },
    ],
  } satisfies ProblemData,
  FORMULA: {
    title: 'Five roots. One formula.',
    intro: 'Each ingredient plays a distinct role in the ritual.',
    ingredients: [{ name: 'Ginseng', description: 'Traditionally used to support energy and vitality.' }],
  } satisfies FormulaData,
  HOW_IT_WORKS: {
    title: 'How to use it',
    steps: [{ title: 'Steep', description: 'Steep one sachet in hot water for 5 minutes.' }],
  } satisfies HowItWorksData,
  BENEFITS: { title: 'Benefits', items: ['Supports steady energy', 'Supports healthy digestion'] } satisfies BenefitsData,
  COMPARISON: {
    title: 'Why it is different',
    columns: ['Five Treasures Tea', 'Typical Tea'],
    rows: [{ label: 'Natural ingredients', values: [true, false] }],
  } satisfies ComparisonData,
  TESTIMONIALS: {
    title: 'Trusted by wellness seekers',
    items: [{ name: 'Amaka J.', location: 'Lagos', quote: 'I feel the difference every morning.', rating: 5, verified: true }],
  } satisfies TestimonialsData,
  GUARANTEE: { title: 'Quality Guarantee', description: 'Not satisfied? Reach out within 7 days of delivery.', icon: '🛡️' } satisfies GuaranteeData,
  FAQ: { title: 'Frequently Asked Questions', items: [{ question: 'How is it delivered?', answer: 'Nationwide cash-on-delivery.' }] } satisfies FaqData,
  ORDER: { title: 'Select your package', showStickyCta: true, stickyCtaLabel: 'ORDER FROM {price} • PAY ON DELIVERY' } satisfies OrderData,
  FOOTER: { brandName: 'Wellness247', tagline: 'A quiet ritual of repair.', links: [] } satisfies FooterData,
  CUSTOM: {},
};
