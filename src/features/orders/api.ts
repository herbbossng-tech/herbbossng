import { supabase } from '@/lib/supabase'
import type {
  Order,
  OrderDailyStat,
  OrderEvent,
  OrderItem,
  OrderNote,
  OrderStats,
  OrderStatusTransition,
} from '@/types/database'

import type { CreateOrderOutput, StatusChangeFormOutput } from './validation'
import type { OrderFilters, OrderListItem, PaginatedOrders } from './types'

const DEFAULT_PAGE_SIZE = 25

export async function fetchOrders(
  workspaceId: string,
  brandId: string,
  filters: OrderFilters = {},
): Promise<PaginatedOrders> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let searchIds: string[] | null = null

  if (filters.search) {
    const term = filters.search.trim()
    const digits = term.replace(/[^0-9]/g, '')

    const [byFields, byItems] = await Promise.all([
      supabase
        .from('orders')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('brand_id', brandId)
        .is('deleted_at', null)
        .or(
          [
            `order_number.ilike.%${term}%`,
            `customer_name.ilike.%${term}%`,
            `customer_phone.ilike.%${term}%`,
            `customer_city.ilike.%${term}%`,
            digits ? `customer_phone.ilike.%${digits}%` : null,
          ]
            .filter(Boolean)
            .join(','),
        ),
      supabase
        .from('order_items')
        .select('order_id')
        .eq('workspace_id', workspaceId)
        .eq('brand_id', brandId)
        .or(`product_name.ilike.%${term}%,sku.ilike.%${term}%`),
    ])

    if (byFields.error) throw byFields.error
    if (byItems.error) throw byItems.error

    searchIds = Array.from(
      new Set([...(byFields.data ?? []).map((r) => r.id), ...(byItems.data ?? []).map((r) => r.order_id)]),
    )

    if (searchIds.length === 0) {
      return { rows: [], totalCount: 0 }
    }
  }

  let productIds: string[] | null = null

  if (filters.productId && filters.productId !== 'all') {
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('workspace_id', workspaceId)
      .eq('brand_id', brandId)
      .eq('product_id', filters.productId)

    if (error) throw error
    productIds = Array.from(new Set((data ?? []).map((r) => r.order_id)))

    if (productIds.length === 0) {
      return { rows: [], totalCount: 0 }
    }
  }

  // Search and the product filter narrow the same order-id space from two
  // independent queries — intersect them (AND) rather than letting the
  // product filter widen a search the user already typed.
  let matchingIds: string[] | null = null
  if (searchIds && productIds) {
    matchingIds = searchIds.filter((id) => productIds!.includes(id))
    if (matchingIds.length === 0) return { rows: [], totalCount: 0 }
  } else {
    matchingIds = searchIds ?? productIds
  }

  let query = supabase
    .from('orders')
    .select('*, assigned_profile:profiles!orders_assigned_to_fkey(email)', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)

  if (matchingIds) {
    query = query.in('id', matchingIds)
  }
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.source && filters.source !== 'all') {
    query = query.eq('source', filters.source)
  }
  if (filters.assignedTo === 'unassigned') {
    query = query.is('assigned_to', null)
  } else if (filters.assignedTo && filters.assignedTo !== 'all') {
    query = query.eq('assigned_to', filters.assignedTo)
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }
  if (filters.dateTo) {
    // A bare "YYYY-MM-DD" date is midnight — treat it as end-of-day so
    // the day the user picked is actually included in the range.
    const dateTo = filters.dateTo.length === 10 ? `${filters.dateTo}T23:59:59.999` : filters.dateTo
    query = query.lte('created_at', dateTo)
  }

  query = query
    .order(filters.sortBy ?? 'created_at', { ascending: filters.sortDirection === 'asc' })
    .range(from, to)

  const { data, error, count } = await query
  if (error) throw error

  const rows: OrderListItem[] = (data ?? []).map((row) => {
    const { assigned_profile, ...order } = row as unknown as Order & {
      assigned_profile: { email: string } | null
    }
    return { ...order, assigned_to_email: assigned_profile?.email ?? null, item_summary: null }
  })

  return { rows, totalCount: count ?? rows.length }
}

export async function fetchOrder(id: string): Promise<OrderListItem> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, assigned_profile:profiles!orders_assigned_to_fkey(email)')
    .eq('id', id)
    .single()
  if (error) throw error
  const { assigned_profile, ...order } = data as unknown as Order & { assigned_profile: { email: string } | null }
  return { ...order, assigned_to_email: assigned_profile?.email ?? null, item_summary: null }
}

export async function fetchOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at')
  if (error) throw error
  return (data ?? []) as OrderItem[]
}

export async function fetchOrderTimeline(orderId: string): Promise<OrderEvent[]> {
  const { data, error } = await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrderEvent[]
}

export async function fetchOrderNotes(orderId: string): Promise<OrderNote[]> {
  const { data, error } = await supabase
    .from('order_notes')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrderNote[]
}

export async function fetchOrderStatusTransitions(): Promise<OrderStatusTransition[]> {
  const { data, error } = await supabase.from('order_status_transitions').select('*')
  if (error) throw error
  return (data ?? []) as OrderStatusTransition[]
}

export async function fetchOrderStats(workspaceId: string, brandId: string): Promise<OrderStats> {
  const { data, error } = await supabase
    .rpc('get_order_stats', { p_workspace_id: workspaceId, p_brand_id: brandId })
    .single()
  if (error) throw error
  return data as OrderStats
}

export async function fetchOrderDailyStats(workspaceId: string, brandId: string, days = 7): Promise<OrderDailyStat[]> {
  const { data, error } = await supabase.rpc('get_order_daily_stats', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_days: days,
  })
  if (error) throw error
  return (data ?? []) as OrderDailyStat[]
}

export async function createOrder(workspaceId: string, brandId: string, input: CreateOrderOutput): Promise<Order> {
  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

  const { data, error } = await supabase.rpc('create_order', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_source: input.source,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_address: input.customerAddress,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    p_customer_email: input.customerEmail || null,
    p_customer_country_code: input.customerCountryCode || null,
    p_customer_state: input.customerState || null,
    p_customer_city: input.customerCity || null,
    p_customer_address_2: input.customerAddress2 || null,
    p_customer_postal_code: input.customerPostalCode || null,
    p_shipping_fee: input.shippingFee,
    p_discount_amount: input.discountAmount,
    p_source_detail: input.sourceDetail || null,
    p_internal_notes: input.internalNotes || null,
    p_priority: input.priority,
    p_idempotency_key: idempotencyKey,
  })

  if (error) throw error
  return data as Order
}

export interface UpdateOrderFields {
  customer_name?: string
  customer_phone?: string
  customer_email?: string | null
  customer_address?: string
  customer_address_2?: string | null
  customer_state?: string | null
  customer_city?: string | null
  internal_notes?: string | null
  priority?: string
}

export async function updateOrder(id: string, fields: UpdateOrderFields, userId: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...fields, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Order
}

export async function transitionOrderStatus(id: string, input: StatusChangeFormOutput & { status: string }, userId: string): Promise<Order> {
  const payload: Record<string, unknown> = { status: input.status, updated_by: userId }
  if (input.scheduledAt) payload.scheduled_at = input.scheduledAt
  if (input.cancellationReason) payload.cancellation_reason = input.cancellationReason
  if (input.returnReason) payload.return_reason = input.returnReason
  if (input.cashCollectedAmount !== undefined) payload.cash_collected_amount = input.cashCollectedAmount
  if (input.cashCollectionStatus) payload.cash_collection_status = input.cashCollectionStatus

  const { data, error } = await supabase.from('orders').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return data as Order
}

export async function addOrderNote(
  orderId: string,
  workspaceId: string,
  brandId: string,
  body: string,
  userId: string,
): Promise<OrderNote> {
  const { data, error } = await supabase
    .from('order_notes')
    .insert({ order_id: orderId, workspace_id: workspaceId, brand_id: brandId, body, created_by: userId })
    .select('*')
    .single()
  if (error) throw error
  return data as OrderNote
}

export async function setOrderTags(id: string, tags: string[], userId: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ tags, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Order
}

export async function assignOrder(id: string, assignedTo: string | null, userId: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ assigned_to: assignedTo, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Order
}
