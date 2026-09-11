import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { RescueCaseStatus, SupportInteractionOutcome, SupportInteractionType, TaskPriority } from '@/types/database'

import {
  createRescueCase,
  createSupportInteraction,
  escalateRescueCase,
  fetchActiveRescueCases,
  fetchCustomerInteractions,
  fetchOrderInteractions,
  fetchOrderRescueCase,
  fetchOrderRescueCases,
  fetchRescueAttempts,
  fetchRescueFunnel,
  fetchSupportAnalytics,
  fetchSupportQueue,
  fetchSupportSummary,
  updateRescueCaseStatus,
} from './api'

export function useSupportQueue(limit = 200) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['support-queue', activeWorkspace.id, activeBrand?.id ?? null, limit],
    queryFn: () => fetchSupportQueue(activeWorkspace.id, activeBrand?.id ?? null, limit),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useSupportSummary() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['support-summary', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchSupportSummary(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useRescueFunnel(days = 30) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['rescue-funnel', activeWorkspace.id, activeBrand?.id ?? null, days],
    queryFn: () => fetchRescueFunnel(activeWorkspace.id, activeBrand?.id ?? null, days),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useSupportAnalytics(days = 30) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['support-analytics', activeWorkspace.id, activeBrand?.id ?? null, days],
    queryFn: () => fetchSupportAnalytics(activeWorkspace.id, activeBrand?.id ?? null, days),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useOrderInteractions(orderId: string | undefined) {
  return useQuery({
    queryKey: ['support-interactions-order', orderId ?? ''],
    queryFn: () => fetchOrderInteractions(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useCustomerInteractions(customerId: string | undefined) {
  return useQuery({
    queryKey: ['support-interactions-customer', customerId ?? ''],
    queryFn: () => fetchCustomerInteractions(customerId as string),
    enabled: Boolean(customerId),
  })
}

export function useActiveRescueCases() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['rescue-cases-active', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchActiveRescueCases(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useOrderRescueCase(orderId: string | undefined) {
  return useQuery({
    queryKey: ['rescue-case-active-for-order', orderId ?? ''],
    queryFn: () => fetchOrderRescueCase(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useOrderRescueCases(orderId: string | undefined) {
  return useQuery({
    queryKey: ['rescue-cases-for-order', orderId ?? ''],
    queryFn: () => fetchOrderRescueCases(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useRescueAttempts(rescueCaseId: string | undefined) {
  return useQuery({
    queryKey: ['rescue-attempts', rescueCaseId ?? ''],
    queryFn: () => fetchRescueAttempts(rescueCaseId as string),
    enabled: Boolean(rescueCaseId),
  })
}

function useInvalidateSupport() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['support-queue', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['support-summary', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['rescue-funnel', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['support-analytics', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['support-interactions-order'] })
    queryClient.invalidateQueries({ queryKey: ['support-interactions-customer'] })
    queryClient.invalidateQueries({ queryKey: ['rescue-case-active-for-order'] })
    queryClient.invalidateQueries({ queryKey: ['rescue-cases-for-order'] })
    queryClient.invalidateQueries({ queryKey: ['rescue-cases-active', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['rescue-attempts'] })
    queryClient.invalidateQueries({ queryKey: ['rescue-board'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }
}

export function useCreateSupportInteraction() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: (input: {
      interactionType: SupportInteractionType
      summary: string
      orderId?: string | null
      customerId?: string | null
      outcome?: SupportInteractionOutcome | null
      relatedTaskId?: string | null
    }) => createSupportInteraction(input),
    onSuccess: invalidate,
  })
}

export function useCreateRescueCase() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: (input: { orderId: string; reason: string; priority?: TaskPriority; assignedTo?: string | null }) =>
      createRescueCase(input.orderId, input.reason, input.priority, input.assignedTo),
    onSuccess: invalidate,
  })
}

export function useUpdateRescueCaseStatus() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: (input: { rescueCaseId: string; status: RescueCaseStatus; note?: string | null; outcome?: SupportInteractionOutcome | null }) =>
      updateRescueCaseStatus(input.rescueCaseId, input.status, input.note, input.outcome),
    onSuccess: invalidate,
  })
}

export function useEscalateRescueCase() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: (input: { rescueCaseId: string; reason: string; reassignTo?: string | null }) =>
      escalateRescueCase(input.rescueCaseId, input.reason, input.reassignTo),
    onSuccess: invalidate,
  })
}
