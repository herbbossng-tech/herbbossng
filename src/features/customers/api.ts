import { supabase } from '@/lib/supabase'
import type { AuditLog, Customer, CustomerNote, CustomerStats, Order, OrderEvent } from '@/types/database'

import type { CustomerFormOutput } from './validation'
import type { CustomerFilters, PaginatedCustomers } from './types'

const DEFAULT_PAGE_SIZE = 25

export async function fetchCustomers(
  workspaceId: string,
  brandId: string,
  filters: CustomerFilters = {},
): Promise<PaginatedCustomers> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let matchingIds: string[] | null = null

  if (filters.search) {
    const term = filters.search.trim()
    const digits = term.replace(/[^0-9]/g, '')

    const [byFields, byOrderNumber] = await Promise.all([
      supabase
        .from('customers')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('brand_id', brandId)
        .is('deleted_at', null)
        .or(
          [
            `full_name.ilike.%${term}%`,
            `phone.ilike.%${term}%`,
            `alternate_phone.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            `city.ilike.%${term}%`,
            digits ? `phone.ilike.%${digits}%` : null,
          ]
            .filter(Boolean)
            .join(','),
        ),
      supabase
        .from('orders')
        .select('customer_id')
        .eq('workspace_id', workspaceId)
        .eq('brand_id', brandId)
        .not('customer_id', 'is', null)
        .ilike('order_number', `%${term}%`),
    ])

    if (byFields.error) throw byFields.error
    if (byOrderNumber.error) throw byOrderNumber.error

    matchingIds = Array.from(
      new Set([
        ...(byFields.data ?? []).map((r) => r.id),
        ...(byOrderNumber.data ?? []).map((r) => r.customer_id as string),
      ]),
    )

    if (matchingIds.length === 0) {
      return { rows: [], totalCount: 0 }
    }
  }

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)

  if (matchingIds) {
    query = query.in('id', matchingIds)
  }
  if (filters.classification === 'new') {
    query = query.eq('is_repeat_customer', false)
  } else if (filters.classification === 'repeat') {
    query = query.eq('is_repeat_customer', true)
  }
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.hasDelivered) {
    query = query.gt('delivered_count', 0)
  }
  if (filters.hasReturned) {
    query = query.gt('returned_count', 0)
  }
  if (filters.hasPending) {
    query = query.gt('pending_count', 0)
  }
  if (filters.state && filters.state !== 'all') {
    query = query.eq('state', filters.state)
  }
  if (filters.city && filters.city !== 'all') {
    query = query.eq('city', filters.city)
  }

  query = query
    .order(filters.sortBy ?? 'created_at', { ascending: filters.sortDirection === 'asc' })
    .range(from, to)

  const { data, error, count } = await query
  if (error) throw error

  return { rows: (data ?? []) as Customer[], totalCount: count ?? (data ?? []).length }
}

export async function fetchCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
  if (error) throw error
  return data as Customer
}

export async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Order[]
}

export async function fetchCustomerNotes(customerId: string): Promise<CustomerNote[]> {
  const { data, error } = await supabase
    .from('customer_notes')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CustomerNote[]
}

export interface CustomerTimelineEntry {
  id: string
  kind: 'audit' | 'order_event'
  description: string
  created_at: string
  order_id?: string
}

/**
 * Composed from two already-authoritative sources rather than a third
 * duplicate events table: audit_logs for customer-level changes (created,
 * updated, note added) and order_events for every order this customer has
 * placed (status changes, assignment, cash collection, …).
 */
export async function fetchCustomerTimeline(customerId: string): Promise<CustomerTimelineEntry[]> {
  const { data: orderIdsData, error: orderIdsError } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_id', customerId)
  if (orderIdsError) throw orderIdsError
  const orderIds = (orderIdsData ?? []).map((r) => r.id as string)

  const [auditResult, eventsResult] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'customers')
      .eq('entity_id', customerId)
      .order('created_at', { ascending: false }),
    orderIds.length > 0
      ? supabase.from('order_events').select('*').in('order_id', orderIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as OrderEvent[], error: null }),
  ])

  if (auditResult.error) throw auditResult.error
  if (eventsResult.error) throw eventsResult.error

  const auditActionLabels: Record<string, string> = {
    create: 'Customer created',
    update: 'Customer updated',
    archive: 'Customer archived',
    delete: 'Customer deleted',
  }
  const auditEntries: CustomerTimelineEntry[] = ((auditResult.data ?? []) as AuditLog[]).map((log) => ({
    id: log.id,
    kind: 'audit',
    description: auditActionLabels[log.action] ?? `Customer ${log.action}`,
    created_at: log.created_at,
  }))

  const eventEntries: CustomerTimelineEntry[] = ((eventsResult.data ?? []) as OrderEvent[]).map((event) => ({
    id: event.id,
    kind: 'order_event',
    description: event.description,
    created_at: event.created_at,
    order_id: event.order_id,
  }))

  return [...auditEntries, ...eventEntries].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function fetchCustomerStats(workspaceId: string, brandId: string): Promise<CustomerStats> {
  const { data, error } = await supabase
    .rpc('get_customer_stats', { p_workspace_id: workspaceId, p_brand_id: brandId })
    .single()
  if (error) throw error
  return data as CustomerStats
}

export async function createCustomer(workspaceId: string, brandId: string, input: CustomerFormOutput): Promise<Customer> {
  const { data, error } = await supabase.rpc('create_customer', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_alternate_phone: input.alternatePhone || null,
    p_email: input.email || null,
    p_state: input.state || null,
    p_city: input.city || null,
    p_address: input.address || null,
    p_address_2: input.addressLine2 || null,
    p_landmark: input.landmark || null,
    p_postal_code: input.postalCode || null,
  })
  if (error) throw error
  return data as Customer
}

export interface UpdateCustomerFields {
  full_name?: string
  phone?: string
  alternate_phone?: string | null
  email?: string | null
  state?: string | null
  city?: string | null
  address?: string | null
  address_2?: string | null
  landmark?: string | null
  postal_code?: string | null
  status?: string
}

export async function updateCustomer(id: string, fields: UpdateCustomerFields, userId: string): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update({ ...fields, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Customer
}

export async function addCustomerNote(
  customerId: string,
  workspaceId: string,
  brandId: string,
  body: string,
  userId: string,
): Promise<CustomerNote> {
  const { data, error } = await supabase
    .from('customer_notes')
    .insert({ customer_id: customerId, workspace_id: workspaceId, brand_id: brandId, body, created_by: userId })
    .select('*')
    .single()
  if (error) throw error
  return data as CustomerNote
}
