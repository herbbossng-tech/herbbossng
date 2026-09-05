import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  approveAffiliate,
  createAffiliate,
  fetchAffiliate,
  fetchAffiliateCommissions,
  fetchAffiliateOrders,
  fetchAffiliatePerformance,
  fetchAffiliates,
  fetchAffiliateWallet,
  fetchAffiliateWalletTransactions,
  fetchProductAffiliatePerformance,
  reactivateAffiliate,
  rejectAffiliate,
  suspendAffiliate,
  type AffiliateFilters,
  type CreateAffiliateFields,
} from './api'

export const affiliateKeys = {
  list: (workspaceId: string, filters: AffiliateFilters) => ['affiliates', workspaceId, filters] as const,
  detail: (id: string) => ['affiliate', id] as const,
  wallet: (affiliateId: string) => ['affiliate-wallet', affiliateId] as const,
  walletTransactions: (affiliateId: string) => ['affiliate-wallet-transactions', affiliateId] as const,
  commissions: (affiliateId: string) => ['affiliate-commissions', affiliateId] as const,
  orders: (affiliateId: string) => ['affiliate-orders', affiliateId] as const,
}

export function useAffiliates(filters: AffiliateFilters = {}) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: affiliateKeys.list(activeWorkspace.id, filters),
    queryFn: () => fetchAffiliates(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useAffiliate(id: string | undefined) {
  return useQuery({
    queryKey: affiliateKeys.detail(id ?? ''),
    queryFn: () => fetchAffiliate(id as string),
    enabled: Boolean(id),
  })
}

export function useAffiliateWallet(affiliateId: string | undefined) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: affiliateKeys.wallet(affiliateId ?? ''),
    queryFn: () => fetchAffiliateWallet(activeWorkspace.id, affiliateId as string),
    enabled: Boolean(affiliateId),
  })
}

export function useAffiliateWalletTransactions(affiliateId: string | undefined) {
  return useQuery({
    queryKey: affiliateKeys.walletTransactions(affiliateId ?? ''),
    queryFn: () => fetchAffiliateWalletTransactions(affiliateId as string),
    enabled: Boolean(affiliateId),
  })
}

export function useAffiliateCommissions(affiliateId: string | undefined) {
  return useQuery({
    queryKey: affiliateKeys.commissions(affiliateId ?? ''),
    queryFn: () => fetchAffiliateCommissions(affiliateId as string),
    enabled: Boolean(affiliateId),
  })
}

export function useAffiliateOrders(affiliateId: string | undefined) {
  return useQuery({
    queryKey: affiliateKeys.orders(affiliateId ?? ''),
    queryFn: () => fetchAffiliateOrders(affiliateId as string),
    enabled: Boolean(affiliateId),
  })
}

function useInvalidateAffiliates(id?: string) {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['affiliates', activeWorkspace.id] })
    if (id) queryClient.invalidateQueries({ queryKey: affiliateKeys.detail(id) })
  }
}

export function useCreateAffiliate() {
  const { activeWorkspace } = useWorkspace()
  const invalidate = useInvalidateAffiliates()
  return useMutation({
    mutationFn: (fields: CreateAffiliateFields) => createAffiliate(activeWorkspace.id, fields),
    onSuccess: invalidate,
  })
}

export function useApproveAffiliate(id: string) {
  const invalidate = useInvalidateAffiliates(id)
  return useMutation({
    mutationFn: () => approveAffiliate(id),
    onSuccess: invalidate,
  })
}

export function useRejectAffiliate(id: string) {
  const invalidate = useInvalidateAffiliates(id)
  return useMutation({
    mutationFn: (reason: string) => rejectAffiliate(id, reason),
    onSuccess: invalidate,
  })
}

export function useSuspendAffiliate(id: string) {
  const invalidate = useInvalidateAffiliates(id)
  return useMutation({
    mutationFn: (reason?: string) => suspendAffiliate(id, reason),
    onSuccess: invalidate,
  })
}

export function useReactivateAffiliate(id: string) {
  const invalidate = useInvalidateAffiliates(id)
  return useMutation({
    mutationFn: () => reactivateAffiliate(id),
    onSuccess: invalidate,
  })
}

export function useAffiliatePerformance(dateFrom: string | null, dateTo: string | null) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['affiliate-performance', activeWorkspace.id, activeBrand?.id ?? null, dateFrom, dateTo],
    queryFn: () => fetchAffiliatePerformance(activeWorkspace.id, activeBrand?.id ?? null, dateFrom, dateTo),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useProductAffiliatePerformance() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['product-affiliate-performance', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchProductAffiliatePerformance(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}
