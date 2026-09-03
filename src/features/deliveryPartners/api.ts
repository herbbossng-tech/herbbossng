import { supabase } from '@/lib/supabase'
import type { DeliveryPartner } from '@/types/database'

export async function fetchDeliveryPartners(workspaceId: string): Promise<DeliveryPartner[]> {
  const { data, error } = await supabase
    .from('delivery_partners')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name')
  if (error) throw error
  return (data ?? []) as DeliveryPartner[]
}

export interface DeliveryPartnerFields {
  name: string
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  coverage_areas?: string[]
  notes?: string | null
}

export async function createDeliveryPartner(workspaceId: string, fields: DeliveryPartnerFields, userId: string): Promise<DeliveryPartner> {
  const { data, error } = await supabase
    .from('delivery_partners')
    .insert({ workspace_id: workspaceId, created_by: userId, updated_by: userId, ...fields })
    .select('*')
    .single()
  if (error) throw error
  return data as DeliveryPartner
}

export async function setDeliveryPartnerStatus(id: string, status: 'active' | 'inactive', userId: string): Promise<DeliveryPartner> {
  const { data, error } = await supabase.from('delivery_partners').update({ status, updated_by: userId }).eq('id', id).select('*').single()
  if (error) throw error
  return data as DeliveryPartner
}
