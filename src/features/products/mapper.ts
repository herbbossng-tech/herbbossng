import type { Product } from '@/types/database'

import type { ProductFormValues } from './types'

export const emptyProductForm: ProductFormValues = {
  name: '',
  sku: '',
  categoryId: null,
  shortDescription: '',
  description: '',
  status: 'draft',
  sellingPrice: 0,
  costPrice: null,
  comparePrice: null,
  trackInventory: true,
  stockQuantity: 0,
  lowStockThreshold: 5,
  weight: null,
  deliveryInformation: '',
  returnPolicy: '',
  tags: [],
  seoTitle: '',
  seoDescription: '',
  affiliateCommissionType: null,
  affiliateCommissionValue: null,
}

export function productToFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku ?? '',
    categoryId: product.category_id,
    shortDescription: product.short_description ?? '',
    description: product.description ?? '',
    status: product.status,
    sellingPrice: product.selling_price,
    costPrice: product.cost_price,
    comparePrice: product.compare_price,
    trackInventory: product.track_inventory,
    stockQuantity: product.stock_quantity,
    lowStockThreshold: product.low_stock_threshold,
    weight: product.weight,
    deliveryInformation: product.delivery_information ?? '',
    returnPolicy: product.return_policy ?? '',
    tags: product.tags,
    seoTitle: product.seo_title ?? '',
    seoDescription: product.seo_description ?? '',
    affiliateCommissionType: product.affiliate_commission_type,
    affiliateCommissionValue: product.affiliate_commission_value,
  }
}
