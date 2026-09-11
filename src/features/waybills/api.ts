import { supabase } from '@/lib/supabase'
import type { DeliveryPartner, Waybill } from '@/types/database'

export interface WaybillRow extends Waybill {
  order: { order_number: string; customer_name: string; customer_phone: string } | null
  delivery_partner: Pick<DeliveryPartner, 'id' | 'name'> | null
}

export interface WaybillFilters {
  status?: string | 'all'
  search?: string
}

export async function fetchWaybills(workspaceId: string, filters: WaybillFilters = {}): Promise<WaybillRow[]> {
  let query = supabase
    .from('waybills')
    .select('*, order:orders(order_number, customer_name, customer_phone), delivery_partner:delivery_partners(id, name)')
    .eq('workspace_id', workspaceId)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  let rows = (data ?? []) as unknown as WaybillRow[]
  if (filters.search) {
    const term = filters.search.toLowerCase()
    rows = rows.filter(
      (w) =>
        w.waybill_number.toLowerCase().includes(term) ||
        w.order?.order_number.toLowerCase().includes(term) ||
        w.order?.customer_name.toLowerCase().includes(term) ||
        w.order?.customer_phone.includes(term),
    )
  }
  return rows
}

export async function fetchOrderWaybills(orderId: string): Promise<WaybillRow[]> {
  const { data, error } = await supabase
    .from('waybills')
    .select('*, order:orders(order_number, customer_name, customer_phone), delivery_partner:delivery_partners(id, name)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as WaybillRow[]
}

export async function createWaybill(
  orderId: string,
  deliveryPartnerId?: string | null,
  destinationAddress?: string | null,
  destinationState?: string | null,
  codAmount?: number | null,
  notes?: string | null,
): Promise<Waybill> {
  const { data, error } = await supabase
    .rpc('create_waybill', {
      p_order_id: orderId,
      p_delivery_partner_id: deliveryPartnerId ?? null,
      p_destination_address: destinationAddress ?? null,
      p_destination_state: destinationState ?? null,
      p_cod_amount: codAmount ?? null,
      p_notes: notes ?? null,
    })
    .single()
  if (error) throw error
  return data as Waybill
}

export async function updateWaybillStatus(waybillId: string, status: string, note?: string | null): Promise<Waybill> {
  const { data, error } = await supabase.rpc('update_waybill_status', { p_waybill_id: waybillId, p_status: status, p_note: note ?? null }).single()
  if (error) throw error
  return data as Waybill
}
