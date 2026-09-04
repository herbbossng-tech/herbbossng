import type { LandingPage, LandingPagePackage, LandingPageSection, LandingPageStatus, LandingPageType } from '@/types/database'

export interface LandingPageFilters {
  search?: string
  status?: LandingPageStatus | 'all'
  page?: number
  pageSize?: number
}

export interface LandingPageListItem extends LandingPage {
  order_count: number
  product_name: string | null
}

export interface PaginatedLandingPages {
  rows: LandingPageListItem[]
  totalCount: number
}

export interface LandingPageFormValues {
  name: string
  productId: string
  slug: string
  pageType: LandingPageType
  templateId: string
  marketCountryCode: string
}

/** A reusable starter configuration — system templates (workspace_id null) are read-only; a workspace clones one to customize it. See migration 0031. */
export interface LandingPageTemplate {
  id: string
  workspace_id: string | null
  name: string
  slug: string
  description: string | null
  template_key: string | null
  preview_image_url: string | null
  is_system: boolean
  status: 'active' | 'archived'
  starter_sections: { type: LandingPageSection['type']; config: unknown }[]
  default_theme: Record<string, unknown>
  source_template_id: string | null
  created_at: string
  updated_at: string
}

export interface PackageFormValues {
  name: string
  quantity: number
  price: number
  compareAtPrice: number | null
  badge: string
  savingsText: string
  offerText: string
  shippingType: 'free' | 'fixed' | 'by_state'
  shippingAmount: number
  shippingDefault: number
  shippingRates: { state: string; amount: number }[]
  enabled: boolean
  isDefault: boolean
}

export type { LandingPage, LandingPagePackage, LandingPageSection }
