import { supabase } from '@/lib/supabase'
import type { Affiliate, AffiliateWithdrawal } from '@/types/database'

export interface WithdrawalRow extends AffiliateWithdrawal {
  affiliate: Pick<Affiliate, 'id' | 'full_name' | 'referral_code'>
}

export interface WithdrawalFilters {
  status?: string | 'all'
}

export async function fetchWithdrawals(workspaceId: string, filters: WithdrawalFilters = {}): Promise<WithdrawalRow[]> {
  let query = supabase
    .from('affiliate_withdrawals')
    .select('*, affiliate:affiliates(id, full_name, referral_code)')
    .eq('workspace_id', workspaceId)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  const { data, error } = await query.order('requested_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as WithdrawalRow[]
}

export async function requestWithdrawal(affiliateId: string, amount: number, note?: string): Promise<AffiliateWithdrawal> {
  const { data, error } = await supabase
    .rpc('request_affiliate_withdrawal', { p_affiliate_id: affiliateId, p_amount: amount, p_note: note ?? null })
    .single()
  if (error) throw error
  return data as AffiliateWithdrawal
}

export async function approveWithdrawal(id: string): Promise<AffiliateWithdrawal> {
  const { data, error } = await supabase.rpc('approve_affiliate_withdrawal', { p_withdrawal_id: id }).single()
  if (error) throw error
  return data as AffiliateWithdrawal
}

export async function rejectWithdrawal(id: string, reason: string): Promise<AffiliateWithdrawal> {
  const { data, error } = await supabase.rpc('reject_affiliate_withdrawal', { p_withdrawal_id: id, p_reason: reason }).single()
  if (error) throw error
  return data as AffiliateWithdrawal
}

export async function markWithdrawalPaid(id: string, paymentReference?: string): Promise<AffiliateWithdrawal> {
  const { data, error } = await supabase
    .rpc('mark_affiliate_withdrawal_paid', { p_withdrawal_id: id, p_payment_reference: paymentReference ?? null })
    .single()
  if (error) throw error
  return data as AffiliateWithdrawal
}
