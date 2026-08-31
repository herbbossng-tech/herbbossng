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
