import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import { createOrderSettlement, fetchOrderSettlements, fetchSettlements, markSettlementDisputed, type SettlementFilters } from './api'

export function useSettlements(filters: SettlementFilters = {}) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['settlements', activeWorkspace.id, filters],
    queryFn: () => fetchSettlements(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useOrderSettlements(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-settlements', orderId ?? ''],
    queryFn: () => fetchOrderSettlements(orderId as string),
    enabled: Boolean(orderId),
  })
}

function useInvalidateSettlements() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['settlements', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['order-settlements'] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['order'] })
    queryClient.invalidateQueries({ queryKey: ['order-timeline'] })
  }
}

export function useCreateOrderSettlement() {
  const invalidate = useInvalidateSettlements()
  return useMutation({
    mutationFn: (input: { orderId: string; remittedAmount: number; deliveryFee: number; note?: string | null }) =>
      createOrderSettlement(input.orderId, input.remittedAmount, input.deliveryFee, input.note),
    onSuccess: invalidate,
  })
}

export function useMarkSettlementDisputed() {
  const invalidate = useInvalidateSettlements()
  return useMutation({
    mutationFn: ({ settlementId, reason }: { settlementId: string; reason: string }) => markSettlementDisputed(settlementId, reason),
    onSuccess: invalidate,
  })
}
