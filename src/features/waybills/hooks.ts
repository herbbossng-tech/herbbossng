import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import { createWaybill, fetchOrderWaybills, fetchWaybills, updateWaybillStatus, type WaybillFilters } from './api'

export function useWaybills(filters: WaybillFilters = {}) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['waybills', activeWorkspace.id, filters],
    queryFn: () => fetchWaybills(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useOrderWaybills(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-waybills', orderId ?? ''],
    queryFn: () => fetchOrderWaybills(orderId as string),
    enabled: Boolean(orderId),
  })
}

function useInvalidateWaybills() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['waybills', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['order-waybills'] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['order'] })
    queryClient.invalidateQueries({ queryKey: ['order-timeline'] })
  }
}

export function useCreateWaybill() {
  const invalidate = useInvalidateWaybills()
  return useMutation({
    mutationFn: (input: { orderId: string; deliveryPartnerId?: string | null; destinationAddress?: string | null; destinationState?: string | null; codAmount?: number | null; notes?: string | null }) =>
      createWaybill(input.orderId, input.deliveryPartnerId, input.destinationAddress, input.destinationState, input.codAmount, input.notes),
    onSuccess: invalidate,
  })
}

export function useUpdateWaybillStatus() {
  const invalidate = useInvalidateWaybills()
  return useMutation({
    mutationFn: ({ waybillId, status, note }: { waybillId: string; status: string; note?: string | null }) => updateWaybillStatus(waybillId, status, note),
    onSuccess: invalidate,
  })
}
