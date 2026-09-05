import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  fetchCommunicationConfigStatus,
  fetchCommunicationLog,
  fetchTrackingDispatchEvents,
  retryCommunicationLogEntry,
  retryTrackingDispatchEvent,
  setBrandCommunicationConfig,
  type SetBrandCommunicationConfigInput,
} from './api'

export function useTrackingDispatchEvents(status?: string | null) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['tracking-dispatch-events', activeWorkspace.id, status ?? 'all'],
    queryFn: () => fetchTrackingDispatchEvents(activeWorkspace.id, status, 100),
    enabled: Boolean(activeWorkspace.id),
    refetchInterval: 30_000,
  })
}

export function useRetryTrackingDispatchEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: retryTrackingDispatchEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tracking-dispatch-events'] }),
  })
}

export function useCommunicationLog(status?: string | null) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['communication-log', activeWorkspace.id, status ?? 'all'],
    queryFn: () => fetchCommunicationLog(activeWorkspace.id, status, 100),
    enabled: Boolean(activeWorkspace.id),
    refetchInterval: 30_000,
  })
}

export function useRetryCommunicationLogEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: retryCommunicationLogEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication-log'] }),
  })
}

export function useCommunicationConfigStatus(brandId: string | undefined) {
  return useQuery({
    queryKey: ['communication-config-status', brandId ?? ''],
    queryFn: () => fetchCommunicationConfigStatus(brandId as string),
    enabled: Boolean(brandId),
  })
}

export function useSetBrandCommunicationConfig(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SetBrandCommunicationConfigInput) => setBrandCommunicationConfig(brandId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication-config-status', brandId] }),
  })
}
