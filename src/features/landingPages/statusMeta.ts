import type { LandingPageStatus } from '@/types/database'

export const landingPageStatuses: LandingPageStatus[] = ['draft', 'published', 'unpublished', 'archived']

export const landingPageStatusLabels: Record<LandingPageStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
}

export type StatusTone = 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'secondary'

export const landingPageStatusTone: Record<LandingPageStatus, StatusTone> = {
  draft: 'secondary',
  published: 'success',
  unpublished: 'warning',
  archived: 'destructive',
}

export const pageTypeLabels: Record<string, string> = {
  product_sales: 'Product Sales Page',
  direct_response: 'Direct Response Page',
}
