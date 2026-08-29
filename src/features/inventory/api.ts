import { supabase } from '@/lib/supabase'
import type { InventoryTransaction, InventoryTransactionType, Product } from '@/types/database'

export interface InventoryTransactionWithProduct extends InventoryTransaction {
  product_name: string
}

export interface InventorySummary {
  totalProducts: number
  totalStockValue: number
  lowStockCount: number
  outOfStockCount: number
}

export async function fetchInventoryTransactions(
  workspaceId: string,
  brandId: string,
  limit = 50,
): Promise<InventoryTransactionWithProduct[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*, product:products(name)')
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((row) => {
    const { product, ...txn } = row as unknown as InventoryTransaction & { product: { name: string } | null }
    return { ...txn, product_name: product?.name ?? 'Unknown product' }
  })
}

export async function fetchLowStockProducts(workspaceId: string, brandId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .eq('is_low_stock', true)
    .is('deleted_at', null)
    .order('stock_quantity', { ascending: true })

  if (error) throw error
  return (data ?? []) as Product[]
}

export async function fetchInventorySummary(workspaceId: string, brandId: string): Promise<InventorySummary> {
  const { data, error } = await supabase
    .from('products')
    .select('selling_price, stock_quantity, is_low_stock, track_inventory')
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)

  if (error) throw error

  const rows = (data ?? []) as Pick<Product, 'selling_price' | 'stock_quantity' | 'is_low_stock' | 'track_inventory'>[]

  return rows.reduce<InventorySummary>(
    (summary, row) => ({
      totalProducts: summary.totalProducts + 1,
      totalStockValue: summary.totalStockValue + row.selling_price * row.stock_quantity,
      lowStockCount: summary.lowStockCount + (row.is_low_stock ? 1 : 0),
      outOfStockCount: summary.outOfStockCount + (row.track_inventory && row.stock_quantity === 0 ? 1 : 0),
    }),
    { totalProducts: 0, totalStockValue: 0, lowStockCount: 0, outOfStockCount: 0 },
  )
}

export interface AdjustInventoryInput {
  productId: string
  transactionType: InventoryTransactionType
  quantity: number
  reason?: string
}

export async function adjustInventory(input: AdjustInventoryInput): Promise<InventoryTransaction> {
  const { data, error } = await supabase.rpc('adjust_inventory', {
    p_product_id: input.productId,
    p_transaction_type: input.transactionType,
    p_quantity: input.quantity,
    p_reason: input.reason ?? null,
    p_reference_type: null,
    p_reference_id: null,
  })

  if (error) throw error
  return data as InventoryTransaction
}
