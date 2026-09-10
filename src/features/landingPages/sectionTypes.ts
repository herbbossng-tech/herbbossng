import type { LandingPageSectionType } from '@/types/database'

export interface HeroConfig {
  eyebrow?: string
  headline: string
  subheadline?: string
  imageUrl?: string
  ctaLabel?: string
  ctaTarget?: string
  /** Whether the CTA button shows at all, independent of ctaLabel — lets an editor hide the button without losing the label text. Defaults to true (shown) when omitted, so existing pages are unaffected. */
  ctaEnabled?: boolean
  /** A short static pill of text under the CTA (e.g. "From KSh 2,699 · Free delivery") — editable copy, not computed from package data, so it never contradicts a page's real pricing without being deliberately edited. */
  priceLabel?: string
}

export interface TrustBadge {
  icon?: string
  text: string
}
export interface TrustStripConfig {
  items: TrustBadge[]
  /** 'ticker' renders a continuously-scrolling announcement bar (the top-of-page strip in long-form COD funnels); 'default' is the plain centered row. */
  style?: 'default' | 'ticker'
}

export interface TextConfig {
  eyebrow?: string
  title?: string
  body: string
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface ImageTextConfig {
  eyebrow?: string
  title?: string
  body?: string
  imageUrl?: string
  imagePosition: 'left' | 'right'
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
  /** 'banner' renders a full-bleed marketing image with the text/CTA overlaid at the bottom rather than side-by-side — for the poster-style graphics common in long-form COD funnels. */
  layout?: 'side-by-side' | 'banner'
}

export interface BenefitItem {
  icon?: string
  title: string
  description?: string
  imageUrl?: string
}
export interface BenefitsConfig {
  eyebrow?: string
  title?: string
  items: BenefitItem[]
  /** 'warning' renders each item as a symptom/problem card (accent left border, muted icon well) instead of a positive checkmark benefit card — same data shape, different framing. */
  tone?: 'positive' | 'warning'
  /** 'photo' renders each item as an image tile with a caption (a clear "add photo" placeholder when imageUrl is empty) instead of the icon+title+description card — for photo-grid sections like "still struggling with these issues?" galleries. */
  layout?: 'card' | 'photo'
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface HowItWorksStep {
  title: string
  description?: string
  imageUrl?: string
  /** Optional short duration/eyebrow label shown above the title (e.g. "First Few Days") when rendered as a timeline. */
  eyebrow?: string
}
export interface HowItWorksConfig {
  eyebrow?: string
  title?: string
  steps: HowItWorksStep[]
  /**
   * 'numbered' (default when omitted and no step has its own eyebrow): a plain vertical list with numbered circles.
   * 'timeline': a connected vertical timeline with a per-step eyebrow/duration label (auto-selected when steps have one, even if unset).
   * 'cards': a side-by-side card grid with an italic Roman-numeral mark per card and a colored top border — for a "how to use it" style ritual/instructions block.
   */
  layout?: 'numbered' | 'timeline' | 'cards'
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface Testimonial {
  name: string
  location?: string
  quote: string
  rating?: number
  imageUrl?: string
  verified?: boolean
}
export interface TestimonialsConfig {
  title?: string
  items: Testimonial[]
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface FaqItem {
  question: string
  answer: string
}
export interface FaqConfig {
  title?: string
  items: FaqItem[]
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface CtaBannerConfig {
  headline?: string
  buttonLabel: string
  ctaTarget?: string
  /** 'urgency' renders a slim single-line dark ticker-style banner (top-of-page); 'final' renders a full block with headline (default). */
  style?: 'final' | 'urgency'
}

export interface PackageSelectorConfig {
  title?: string
  subtitle?: string
}

export interface OrderFormConfig {
  title?: string
}

export interface ProblemAwarenessConfig {
  headline: string
  body: string
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface IngredientItem {
  name: string
  description?: string
}
export interface IngredientsConfig {
  headline?: string
  items: IngredientItem[]
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface ComparisonRow {
  label: string
  us: string
  them: string
}
export interface ComparisonConfig {
  headline?: string
  rows: ComparisonRow[]
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export interface GuaranteeConfig {
  headline: string
  body: string
  ctaLabel?: string
  ctaTarget?: string
  ctaEnabled?: boolean
}

export const sectionTypeLabels: Record<LandingPageSectionType, string> = {
  HERO: 'Hero',
  TRUST_STRIP: 'Trust Strip',
  TEXT: 'Text Block',
  IMAGE_TEXT: 'Image + Text',
  BENEFITS: 'Benefits',
  HOW_IT_WORKS: 'How It Works',
  TESTIMONIALS: 'Testimonials',
  FAQ: 'FAQ',
  CTA_BANNER: 'CTA Banner',
  PACKAGE_SELECTOR: 'Package Selector',
  ORDER_FORM: 'COD Order Form',
  PROBLEM_AWARENESS: 'Problem Awareness',
  INGREDIENTS: 'Ingredients / Formula',
  COMPARISON: 'Comparison Table',
  GUARANTEE: 'Guarantee / Risk Reversal',
}

/** PACKAGE_SELECTOR and ORDER_FORM render live data — a page needs at most one of each. */
export const singletonSectionTypes: LandingPageSectionType[] = ['PACKAGE_SELECTOR', 'ORDER_FORM']

export function defaultConfigFor(type: LandingPageSectionType): Record<string, unknown> {
  switch (type) {
    case 'HERO':
      return { headline: '', subheadline: '', imageUrl: '', ctaLabel: 'Order Now', ctaTarget: 'order-form' } satisfies HeroConfig
    case 'TRUST_STRIP':
      return { items: [] } satisfies TrustStripConfig
    case 'TEXT':
      return { title: '', body: '' } satisfies TextConfig
    case 'IMAGE_TEXT':
      return { title: '', body: '', imageUrl: '', imagePosition: 'left' } satisfies ImageTextConfig
    case 'BENEFITS':
      return { title: '', items: [] } satisfies BenefitsConfig
    case 'HOW_IT_WORKS':
      return { title: '', steps: [] } satisfies HowItWorksConfig
    case 'TESTIMONIALS':
      return { title: '', items: [] } satisfies TestimonialsConfig
    case 'FAQ':
      return { title: '', items: [] } satisfies FaqConfig
    case 'CTA_BANNER':
      return { headline: '', buttonLabel: 'Order Now', ctaTarget: 'order-form' } satisfies CtaBannerConfig
    case 'PACKAGE_SELECTOR':
      return { title: 'Choose Your Package', subtitle: '' } satisfies PackageSelectorConfig
    case 'ORDER_FORM':
      return { title: 'Complete Your Order' } satisfies OrderFormConfig
    case 'PROBLEM_AWARENESS':
      return { headline: '', body: '' } satisfies ProblemAwarenessConfig
    case 'INGREDIENTS':
      return { headline: '', items: [] } satisfies IngredientsConfig
    case 'COMPARISON':
      return { headline: '', rows: [] } satisfies ComparisonConfig
    case 'GUARANTEE':
      return { headline: '', body: '' } satisfies GuaranteeConfig
    default:
      return {}
  }
}

const STARTER_PRODUCT_SALES: LandingPageSectionType[] = [
  'HERO',
  'TRUST_STRIP',
  'TEXT',
  'IMAGE_TEXT',
  'BENEFITS',
  'HOW_IT_WORKS',
  'IMAGE_TEXT',
  'TESTIMONIALS',
  'FAQ',
  'PACKAGE_SELECTOR',
  'ORDER_FORM',
  'CTA_BANNER',
]

const STARTER_DIRECT_RESPONSE: LandingPageSectionType[] = [
  'HERO',
  'TEXT',
  'TEXT',
  'IMAGE_TEXT',
  'BENEFITS',
  'TESTIMONIALS',
  'CTA_BANNER',
  'FAQ',
  'PACKAGE_SELECTOR',
  'ORDER_FORM',
]

/** Starter section list for a brand-new page — a convenience preset, never a rendering constraint afterward. */
export function starterSections(pageType: 'product_sales' | 'direct_response'): LandingPageSectionType[] {
  return pageType === 'direct_response' ? STARTER_DIRECT_RESPONSE : STARTER_PRODUCT_SALES
}
