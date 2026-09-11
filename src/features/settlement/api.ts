import { supabase } from '@/lib/supabase'
import type { OrderSettlement } from '@/types/database'

export interface SettlementRow extends OrderSettlement {
  order: { order_number: string; customer_name: string; customer_phone: string } | null
}

export interface SettlementFilters {
  status?: string | 'all'
  search?: string
}

export async function fetchSettlements(workspaceId: string, filters: SettlementFilters = {}): Promise<SettlementRow[]> {
  let query = supabase
    .from('order_settlements')
    .select('*, order:orders(order_number, customer_name, customer_phone)')
    .eq('workspace_id', workspaceId)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  let rows = (data ?? []) as unknown as SettlementRow[]
  if (filters.search) {
    const term = filters.search.toLowerCase()
    rows = rows.filter(
      (s) =>
        s.order?.order_number.toLowerCase().includes(term) ||
        s.order?.customer_name.toLowerCase().includes(term) ||
        s.order?.customer_phone.includes(term),
    )
  }
  return rows
}

export async function fetchOrderSettlements(orderId: string): Promise<SettlementRow[]> {
  const { data, error } = await supabase
    .from('order_settlements')
    .select('*, order:orders(order_number, customer_name, customer_phone)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as SettlementRow[]
}

export async function createOrderSettlement(
  orderId: string,
  remittedAmount: number,
  deliveryFee: number,
  note?: string | null,
): Promise<OrderSettlement> {
  const { data, error } = await supabase
    .rpc('create_order_settlement', {
      p_order_id: orderId,
      p_remitted_amount: remittedAmount,
      p_delivery_fee: deliveryFee,
      p_note: note ?? null,
    })
    .single()
  if (error) throw error
  return data as OrderSettlement
}

export async function markSettlementDisputed(settlementId: string, reason: string): Promise<OrderSettlement> {
  const { data, error } = await supabase
    .rpc('mark_settlement_disputed', { p_settlement_id: settlementId, p_reason: reason })
    .single()
  if (error) throw error
  return data as OrderSettlement
}
