import { supabase } from '@/lib/supabase'
import { slugify } from '@/lib/slug'
import type { Product } from '@/types/database'

import type { ProductFilters, ProductFormValues, ProductWithCategory } from './types'

function toProductRow(values: ProductFormValues) {
  return {
    category_id: values.categoryId,
    name: values.name,
    sku: values.sku || null,
    short_description: values.shortDescription || null,
    description: values.description || null,
    status: values.status,
    selling_price: values.sellingPrice,
    cost_price: values.costPrice,
    compare_price: values.comparePrice,
    affiliate_commission_type: values.affiliateCommissionType,
    affiliate_commission_value: values.affiliateCommissionValue,
    track_inventory: values.trackInventory,
    low_stock_threshold: values.lowStockThreshold,
    weight: values.weight,
    delivery_information: values.deliveryInformation || null,
    return_policy: values.returnPolicy || null,
    tags: values.tags,
    seo_title: values.seoTitle || null,
    seo_description: values.seoDescription || null,
  }
}

export async function fetchProducts(
  workspaceId: string,
  brandId: string,
  filters: ProductFilters = {},
): Promise<ProductWithCategory[]> {
  let query = supabase
    .from('products')
    .select('*, category:categories(name)')
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.categoryId && filters.categoryId !== 'all') {
    query = query.eq('category_id', filters.categoryId)
  }
  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`)
  }
  if (filters.lowStockOnly) {
    query = query.eq('is_low_stock', true)
  }

  query = query.order(filters.sortBy ?? 'created_at', { ascending: filters.sortDirection === 'asc' })

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row) => {
    const { category, ...product } = row as unknown as Product & { category: { name: string } | null }
    return { ...product, category_name: category?.name ?? null }
  })
}

export async function fetchProduct(id: string): Promise<Product> {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).single()
  if (error) throw error
  return data as Product
}

export async function createProduct(
  workspaceId: string,
  brandId: string,
  values: ProductFormValues,
  userId: string,
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      workspace_id: workspaceId,
      brand_id: brandId,
      slug: slugify(values.name),
      stock_quantity: values.trackInventory ? values.stockQuantity : 0,
      created_by: userId,
      updated_by: userId,
      ...toProductRow(values),
    })
    .select('*')
    .single()

  if (error) throw error
  return data as Product
}

export async function updateProduct(id: string, values: ProductFormValues, userId: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({
      slug: slugify(values.name),
      updated_by: userId,
      ...toProductRow(values),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as Product
}

export async function archiveProduct(id: string, userId: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({ status: 'archived', updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as Product
}

export async function duplicateProduct(product: Product, userId: string): Promise<Product> {
  const baseName = `${product.name} (Copy)`
  const { data, error } = await supabase
    .from('products')
    .insert({
      workspace_id: product.workspace_id,
      brand_id: product.brand_id,
      category_id: product.category_id,
      name: baseName,
      slug: `${slugify(baseName)}-${Date.now().toString(36)}`,
      sku: null,
      short_description: product.short_description,
      description: product.description,
      status: 'draft',
      selling_price: product.selling_price,
      cost_price: product.cost_price,
      compare_price: product.compare_price,
      affiliate_commission_type: product.affiliate_commission_type,
      affiliate_commission_value: product.affiliate_commission_value,
      track_inventory: product.track_inventory,
      stock_quantity: 0,
      low_stock_threshold: product.low_stock_threshold,
      weight: product.weight,
      delivery_information: product.delivery_information,
      return_policy: product.return_policy,
      tags: product.tags,
      seo_title: product.seo_title,
      seo_description: product.seo_description,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as Product
}
