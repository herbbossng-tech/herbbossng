import { supabase } from '@/lib/supabase'
import type { Order } from '@/types/database'

export interface ReportFilters {
  dateFrom?: string | null
  dateTo?: string | null
  status?: string | 'all'
  search?: string
  page?: number
  pageSize?: number
}

export interface SalesReportRow {
  id: string
  order_number: string
  created_at: string
  customer_name: string
  product_summary: string
  status: string
  currency_code: string
  total_amount: number
  delivered_value: number
}

const DEFAULT_PAGE_SIZE = 50

/**
 * Sales Report row source. Reuses the `orders` table (Phase 1) — never a
 * duplicate copy of order data — and joins order_items only to build a
 * human-readable product/package summary per order, which the existing
 * Orders list intentionally leaves unset (item_summary: null there).
 */
export async function fetchSalesReportRows(
  workspaceId: string,
  brandId: string,
  filters: ReportFilters,
): Promise<{ rows: SalesReportRow[]; totalCount: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('orders')
    .select('id, order_number, created_at, customer_name, status, currency_code, total_amount, cash_collection_status, order_items(product_name, package_name)', {
      count: 'exact',
    })
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)

  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.search) {
    const term = filters.search.trim()
    query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%`)
  }

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error

  const rows: SalesReportRow[] = (data ?? []).map((row) => {
    const items = (row.order_items ?? []) as { product_name: string; package_name: string | null }[]
    const productSummary = items.map((i) => i.package_name ?? i.product_name).join(', ') || '—'
    const isDelivered = row.status === 'DELIVERED' && row.cash_collection_status === 'collected'
    return {
      id: row.id,
      order_number: row.order_number,
      created_at: row.created_at,
      customer_name: row.customer_name,
      product_summary: productSummary,
      status: row.status,
      currency_code: row.currency_code,
      total_amount: row.total_amount,
      delivered_value: isDelivered ? row.total_amount : 0,
    }
  })

  return { rows, totalCount: count ?? rows.length }
}

export interface DeliveryReportRow extends Order {
  assigned_to_email: string | null
}

/** Delivery Report row source. Reuses the same `orders` table — every date/status/assignment column it needs already exists on Order. */
export async function fetchDeliveryReportRows(
  workspaceId: string,
  brandId: string,
  filters: ReportFilters,
): Promise<{ rows: DeliveryReportRow[]; totalCount: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('orders')
    .select('*, assigned_profile:profiles!orders_assigned_to_fkey(email)', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)

  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.search) {
    const term = filters.search.trim()
    query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`)
  }

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error

  const rows: DeliveryReportRow[] = (data ?? []).map((row) => {
    const { assigned_profile, ...order } = row as unknown as Order & { assigned_profile: { email: string } | null }
    return { ...order, assigned_to_email: assigned_profile?.email ?? null }
  })

  return { rows, totalCount: count ?? rows.length }
}
