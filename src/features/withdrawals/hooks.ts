import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  approveWithdrawal,
  fetchWithdrawals,
  markWithdrawalPaid,
  rejectWithdrawal,
  requestWithdrawal,
  type WithdrawalFilters,
} from './api'

export function useWithdrawals(filters: WithdrawalFilters = {}) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['withdrawals', activeWorkspace.id, filters],
    queryFn: () => fetchWithdrawals(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
  })
}

function useInvalidateWithdrawals() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['withdrawals', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['affiliate-wallets', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['affiliate-wallet-transactions-all', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['affiliate-wallet'] })
    queryClient.invalidateQueries({ queryKey: ['affiliate-wallet-transactions'] })
  }
}

export function useRequestWithdrawal() {
  const invalidate = useInvalidateWithdrawals()
  return useMutation({
    mutationFn: ({ affiliateId, amount, note }: { affiliateId: string; amount: number; note?: string }) =>
      requestWithdrawal(affiliateId, amount, note),
    onSuccess: invalidate,
  })
}

export function useApproveWithdrawal() {
  const invalidate = useInvalidateWithdrawals()
  return useMutation({
    mutationFn: (id: string) => approveWithdrawal(id),
    onSuccess: invalidate,
  })
}

export function useRejectWithdrawal() {
  const invalidate = useInvalidateWithdrawals()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectWithdrawal(id, reason),
    onSuccess: invalidate,
  })
}

export function useMarkWithdrawalPaid() {
  const invalidate = useInvalidateWithdrawals()
  return useMutation({
    mutationFn: ({ id, paymentReference }: { id: string; paymentReference?: string }) => markWithdrawalPaid(id, paymentReference),
    onSuccess: invalidate,
  })
}
