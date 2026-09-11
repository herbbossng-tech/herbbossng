import { supabase } from '@/lib/supabase'
import type {
  CustomerAnalyticsSummary,
  DeliveryFunnelStat,
  FinanceSummary,
  LandingPageAnalyticsRow,
  OrderStatusValueRow,
  ProductPerformanceRow,
  RevenueTrendPoint,
  TrendGranularity,
} from '@/types/database'

export interface FinanceDateRange {
  dateFrom: string | null
  dateTo: string | null
}

export async function fetchFinanceSummary(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
): Promise<FinanceSummary> {
  const { data, error } = await supabase
    .rpc('get_finance_summary', {
      p_workspace_id: workspaceId,
      p_brand_id: brandId || null,
      p_date_from: range.dateFrom,
      p_date_to: range.dateTo,
    })
    .single()
  if (error) throw error
  return data as FinanceSummary
}

export async function fetchOrderStatusValueBreakdown(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
): Promise<OrderStatusValueRow[]> {
  const { data, error } = await supabase.rpc('get_order_status_value_breakdown', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId || null,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
  })
  if (error) throw error
  return (data ?? []) as OrderStatusValueRow[]
}

export async function fetchDeliveryFunnelStats(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
): Promise<DeliveryFunnelStat[]> {
  const { data, error } = await supabase.rpc('get_delivery_funnel_stats', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId || null,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
  })
  if (error) throw error
  return (data ?? []) as DeliveryFunnelStat[]
}

export async function fetchRevenueTrend(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
  granularity: TrendGranularity = 'day',
): Promise<RevenueTrendPoint[]> {
  const { data, error } = await supabase.rpc('get_revenue_trend', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId || null,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
    p_granularity: granularity,
  })
  if (error) throw error
  return (data ?? []) as RevenueTrendPoint[]
}

export async function fetchProductPerformance(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
  limit = 50,
): Promise<ProductPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_product_performance', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId || null,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as ProductPerformanceRow[]
}

export async function fetchCustomerAnalytics(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
): Promise<CustomerAnalyticsSummary> {
  const { data, error } = await supabase
    .rpc('get_customer_analytics', {
      p_workspace_id: workspaceId,
      p_brand_id: brandId || null,
      p_date_from: range.dateFrom,
      p_date_to: range.dateTo,
    })
    .single()
  if (error) throw error
  return data as CustomerAnalyticsSummary
}

export async function fetchLandingPageAnalytics(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
  limit = 50,
): Promise<LandingPageAnalyticsRow[]> {
  const { data, error } = await supabase.rpc('get_landing_page_analytics', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId || null,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as LandingPageAnalyticsRow[]
}

export interface FinanceTransaction {
  id: string
  order_id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  description: string
  metadata: Record<string, unknown>
  created_at: string
  order: {
    order_number: string
    customer_name: string
    total_amount: number
    currency_code: string
  } | null
}

const FINANCE_EVENT_TYPES = ['STATUS_CHANGED', 'CASH_COLLECTED', 'ORDER_CREATED']

/**
 * The Finance Transaction Ledger reuses order_events (Phase 1's existing
 * append-only order timeline) rather than a parallel table — every
 * financially-relevant event (order created, status changed, cash
 * collected) is already recorded there exactly once per occurrence, so
 * there is no separate ledger to keep in sync or risk double-counting in.
 */
export async function fetchFinanceTransactions(
  workspaceId: string,
  brandId: string,
  range: FinanceDateRange,
  page = 1,
  pageSize = 25,
): Promise<{ rows: FinanceTransaction[]; totalCount: number }> {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('order_events')
    .select('id, order_id, event_type, from_status, to_status, description, metadata, created_at, order:orders(order_number, customer_name, total_amount, currency_code)', {
      count: 'exact',
    })
    .eq('workspace_id', workspaceId)
    .in('event_type', FINANCE_EVENT_TYPES)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (brandId) query = query.eq('brand_id', brandId)
  if (range.dateFrom) query = query.gte('created_at', range.dateFrom)
  if (range.dateTo) query = query.lte('created_at', range.dateTo)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as unknown as FinanceTransaction[], totalCount: count ?? 0 }
}
