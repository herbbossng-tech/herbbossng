import { supabase } from '@/lib/supabase'
import type { Affiliate, AffiliateWallet, AffiliateWalletTransaction } from '@/types/database'

export interface WalletRow extends AffiliateWallet {
  affiliate: Pick<Affiliate, 'id' | 'full_name' | 'referral_code' | 'email'>
}

export async function fetchWorkspaceWallets(workspaceId: string): Promise<WalletRow[]> {
  const { data, error } = await supabase
    .from('affiliate_wallets')
    .select('*, affiliate:affiliates(id, full_name, referral_code, email)')
    .eq('workspace_id', workspaceId)
    .order('balance', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as WalletRow[]
}

export async function fetchAllWalletTransactions(workspaceId: string, limit = 200): Promise<(AffiliateWalletTransaction & { affiliate: Pick<Affiliate, 'full_name' | 'referral_code'> })[]> {
  const { data, error } = await supabase
    .from('affiliate_wallet_transactions')
    .select('*, affiliate:affiliates(full_name, referral_code)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as (AffiliateWalletTransaction & { affiliate: Pick<Affiliate, 'full_name' | 'referral_code'> })[]
}

export async function createManualWalletTransaction(affiliateId: string, amount: number, reason: string): Promise<AffiliateWalletTransaction> {
  const { data, error } = await supabase
    .rpc('create_manual_wallet_transaction', { p_affiliate_id: affiliateId, p_amount: amount, p_reason: reason })
    .single()
  if (error) throw error
  return data as AffiliateWalletTransaction
}
