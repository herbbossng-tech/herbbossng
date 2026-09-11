import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import { createManualWalletTransaction, fetchAllWalletTransactions, fetchWorkspaceWallets } from './api'

export function useWorkspaceWallets() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['affiliate-wallets', activeWorkspace.id],
    queryFn: () => fetchWorkspaceWallets(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useAllWalletTransactions() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['affiliate-wallet-transactions-all', activeWorkspace.id],
    queryFn: () => fetchAllWalletTransactions(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useCreateManualWalletTransaction() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return useMutation({
    mutationFn: ({ affiliateId, amount, reason }: { affiliateId: string; amount: number; reason: string }) =>
      createManualWalletTransaction(affiliateId, amount, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-wallets', activeWorkspace.id] })
      queryClient.invalidateQueries({ queryKey: ['affiliate-wallet-transactions-all', activeWorkspace.id] })
      queryClient.invalidateQueries({ queryKey: ['affiliate-wallet-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['affiliate-wallet'] })
    },
  })
}
