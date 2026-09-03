import { supabase } from '@/lib/supabase'
import type { AdCost, AdCostSummaryRow } from '@/types/database'

export interface AdCostFilters {
  status?: string | 'all'
}

export async function fetchAdCosts(workspaceId: string, brandId: string, filters: AdCostFilters = {}): Promise<AdCost[]> {
  let query = supabase.from('ad_costs').select('*').eq('workspace_id', workspaceId).eq('brand_id', brandId)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  const { data, error } = await query.order('period_start', { ascending: false })
  if (error) throw error
  return (data ?? []) as AdCost[]
}

export async function fetchAdCostSummary(workspaceId: string, brandId: string): Promise<AdCostSummaryRow[]> {
  const { data, error } = await supabase.rpc('get_ad_cost_summary', { p_workspace_id: workspaceId, p_brand_id: brandId })
  if (error) throw error
  return (data ?? []) as AdCostSummaryRow[]
}

export interface AdCostFormFields {
  campaign_id?: string | null
  affiliate_id?: string | null
  product_id?: string | null
  period_start: string
  period_end: string
  initial_cost_amount: number
  initial_orders_count: number
  delivered_orders_count?: number | null
  currency_code: string
  notes?: string | null
}

export async function createAdCost(workspaceId: string, brandId: string, fields: AdCostFormFields, userId: string): Promise<AdCost> {
  const { data, error } = await supabase
    .from('ad_costs')
    .insert({ workspace_id: workspaceId, brand_id: brandId, submitted_by: userId, ...fields })
    .select('*')
    .single()
  if (error) throw error
  return data as AdCost
}

export async function approveAdCost(id: string): Promise<AdCost> {
  const { data, error } = await supabase.rpc('approve_ad_cost', { p_ad_cost_id: id }).single()
  if (error) throw error
  return data as AdCost
}

export async function rejectAdCost(id: string, reason: string): Promise<AdCost> {
  const { data, error } = await supabase.rpc('reject_ad_cost', { p_ad_cost_id: id, p_reason: reason }).single()
  if (error) throw error
  return data as AdCost
}
