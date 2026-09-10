import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  disconnectExternalConnection,
  fetchCommunicationConfigStatus,
  fetchCommunicationLog,
  fetchCommunicationLogByActionIds,
  fetchExternalConnections,
  fetchExternalIngestionHealth,
  fetchExternalIngestionLog,
  fetchQueueHealth,
  fetchTrackingDispatchEvents,
  retryCommunicationLogEntry,
  retryExternalOrderIngestion,
  retryTrackingDispatchEvent,
  setBrandCommunicationConfig,
  upsertExternalConnection,
  upsertExternalProductMapping,
  type SetBrandCommunicationConfigInput,
  type UpsertExternalConnectionInput,
} from './api'

/** See fetchCommunicationLogByActionIds — only render this for a caller who holds communications.view or integrations.view, otherwise RLS returns an empty (not honest-looking) list. */
export function useCommunicationLogForActions(actionIds: string[]) {
  const key = actionIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['communication-log-for-actions', key],
    queryFn: () => fetchCommunicationLogByActionIds(actionIds),
    enabled: actionIds.length > 0,
  })
}

export function useQueueHealth() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['queue-health', activeWorkspace.id],
    queryFn: () => fetchQueueHealth(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

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

export function useExternalConnections(brandId: string | undefined) {
  return useQuery({
    queryKey: ['external-connections', brandId ?? ''],
    queryFn: () => fetchExternalConnections(brandId as string),
    enabled: Boolean(brandId),
  })
}

export function useUpsertExternalConnection(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertExternalConnectionInput) => upsertExternalConnection(brandId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['external-connections', brandId] }),
  })
}

export function useDisconnectExternalConnection(brandId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: disconnectExternalConnection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['external-connections', brandId] }),
  })
}

export function useExternalIngestionHealth() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['external-ingestion-health', activeWorkspace.id],
    queryFn: () => fetchExternalIngestionHealth(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
    refetchInterval: 30_000,
  })
}

export function useExternalIngestionLog(status?: string | null) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['external-ingestion-log', activeWorkspace.id, status ?? 'all'],
    queryFn: () => fetchExternalIngestionLog(activeWorkspace.id, status, 100),
    enabled: Boolean(activeWorkspace.id),
    refetchInterval: 30_000,
  })
}

export function useRetryExternalOrderIngestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: retryExternalOrderIngestion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['external-ingestion-log'] }),
  })
}

export function useUpsertExternalProductMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: upsertExternalProductMapping,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['external-ingestion-log'] }),
  })
}
