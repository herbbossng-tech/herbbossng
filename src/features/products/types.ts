import type { Product, ProductStatus } from '@/types/database'

import type { ProductFormSchema } from './validation'

export interface ProductFilters {
  search?: string
  status?: ProductStatus | 'all'
  categoryId?: string | 'all'
  lowStockOnly?: boolean
  sortBy?: 'name' | 'created_at' | 'selling_price' | 'stock_quantity'
  sortDirection?: 'asc' | 'desc'
}

/** Always derived from the zod schema's inferred output — see validation.ts. */
export type ProductFormValues = ProductFormSchema

export type ProductWithCategory = Product & { category_name: string | null }
