import type { LandingPageSectionType } from '@/types/database'

export interface HeroConfig {
  headline: string
  subheadline?: string
  imageUrl?: string
  ctaLabel?: string
  ctaTarget?: string
}

export interface TrustBadge {
  icon?: string
  text: string
}
export interface TrustStripConfig {
  items: TrustBadge[]
}

export interface TextConfig {
  title?: string
  body: string
}

export interface ImageTextConfig {
  title?: string
  body: string
  imageUrl?: string
  imagePosition: 'left' | 'right'
}

export interface BenefitItem {
  icon?: string
  title: string
  description?: string
}
export interface BenefitsConfig {
  title?: string
  items: BenefitItem[]
}

export interface HowItWorksStep {
  title: string
  description?: string
  imageUrl?: string
}
export interface HowItWorksConfig {
  title?: string
  steps: HowItWorksStep[]
}

export interface Testimonial {
  name: string
  location?: string
  quote: string
  rating?: number
  imageUrl?: string
}
export interface TestimonialsConfig {
  title?: string
  items: Testimonial[]
}

export interface FaqItem {
  question: string
  answer: string
}
export interface FaqConfig {
  title?: string
  items: FaqItem[]
}

export interface CtaBannerConfig {
  headline: string
  buttonLabel: string
  ctaTarget?: string
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
}

export interface IngredientItem {
  name: string
  description?: string
}
export interface IngredientsConfig {
  headline?: string
  items: IngredientItem[]
}

export interface ComparisonRow {
  label: string
  us: string
  them: string
}
export interface ComparisonConfig {
  headline?: string
  rows: ComparisonRow[]
}

export interface GuaranteeConfig {
  headline: string
  body: string
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
