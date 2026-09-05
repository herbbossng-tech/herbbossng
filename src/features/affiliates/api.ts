import { supabase } from '@/lib/supabase'
import type {
  Affiliate,
  AffiliateCommission,
  AffiliatePerformanceRow,
  AffiliateWallet,
  AffiliateWalletTransaction,
  Order,
  ProductAffiliatePerformanceRow,
} from '@/types/database'

export interface AffiliateFilters {
  search?: string
  approvalStatus?: string | 'all'
  status?: string | 'all'
}

export async function fetchAffiliates(workspaceId: string, filters: AffiliateFilters = {}): Promise<Affiliate[]> {
  let query = supabase.from('affiliates').select('*').eq('workspace_id', workspaceId).is('deleted_at', null)
  if (filters.approvalStatus && filters.approvalStatus !== 'all') query = query.eq('approval_status', filters.approvalStatus)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.search) query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,referral_code.ilike.%${filters.search}%`)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Affiliate[]
}

export async function fetchAffiliate(id: string): Promise<Affiliate> {
  const { data, error } = await supabase.from('affiliates').select('*').eq('id', id).single()
  if (error) throw error
  return data as Affiliate
}

export async function fetchAffiliateWallet(workspaceId: string, affiliateId: string): Promise<AffiliateWallet | null> {
  const { data, error } = await supabase
    .from('affiliate_wallets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('affiliate_id', affiliateId)
    .maybeSingle()
  if (error) throw error
  return data as AffiliateWallet | null
}

export async function fetchAffiliateWalletTransactions(affiliateId: string): Promise<AffiliateWalletTransaction[]> {
  const { data, error } = await supabase
    .from('affiliate_wallet_transactions')
    .select('*')
    .eq('affiliate_id', affiliateId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as AffiliateWalletTransaction[]
}

export async function fetchAffiliateCommissions(affiliateId: string): Promise<AffiliateCommission[]> {
  const { data, error } = await supabase
    .from('affiliate_commissions')
    .select('*')
    .eq('affiliate_id', affiliateId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as AffiliateCommission[]
}

export async function fetchAffiliateOrders(affiliateId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('affiliate_id', affiliateId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as Order[]
}

export interface CreateAffiliateFields {
  full_name: string
  email?: string | null
  phone?: string | null
  business_name?: string | null
  notes?: string | null
}

export async function createAffiliate(workspaceId: string, fields: CreateAffiliateFields): Promise<Affiliate> {
  const { data, error } = await supabase
    .rpc('create_affiliate', {
      p_workspace_id: workspaceId,
      p_full_name: fields.full_name,
      p_email: fields.email ?? null,
      p_phone: fields.phone ?? null,
      p_business_name: fields.business_name ?? null,
      p_notes: fields.notes ?? null,
    })
    .single()
  if (error) throw error
  return data as Affiliate
}

export async function approveAffiliate(id: string): Promise<Affiliate> {
  const { data, error } = await supabase.rpc('approve_affiliate', { p_affiliate_id: id }).single()
  if (error) throw error
  return data as Affiliate
}

export async function rejectAffiliate(id: string, reason: string): Promise<Affiliate> {
  const { data, error } = await supabase.rpc('reject_affiliate', { p_affiliate_id: id, p_reason: reason }).single()
  if (error) throw error
  return data as Affiliate
}

export async function suspendAffiliate(id: string, reason?: string): Promise<Affiliate> {
  const { data, error } = await supabase.rpc('suspend_affiliate', { p_affiliate_id: id, p_reason: reason ?? null }).single()
  if (error) throw error
  return data as Affiliate
}

export async function reactivateAffiliate(id: string): Promise<Affiliate> {
  const { data, error } = await supabase.rpc('reactivate_affiliate', { p_affiliate_id: id }).single()
  if (error) throw error
  return data as Affiliate
}

export async function fetchAffiliatePerformance(
  workspaceId: string,
  brandId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
): Promise<AffiliatePerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_affiliate_performance', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
  })
  if (error) throw error
  return (data ?? []) as AffiliatePerformanceRow[]
}

export async function fetchProductAffiliatePerformance(workspaceId: string, brandId: string | null): Promise<ProductAffiliatePerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_product_affiliate_performance', { p_workspace_id: workspaceId, p_brand_id: brandId })
  if (error) throw error
  return (data ?? []) as ProductAffiliatePerformanceRow[]
}
