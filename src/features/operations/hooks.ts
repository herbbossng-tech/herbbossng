import { useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'

import { fetchOperationsSummary, fetchRescueBoard } from './api'

export function useOperationsSummary() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['operations-summary', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchOperationsSummary(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useRescueBoard() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['rescue-board', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchRescueBoard(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}

/**
 * Wires the Operations dashboard / Rescue Board / Task Manager / Waybills
 * / Settlement screens to Realtime so a delivery attempt, task update,
 * waybill status change, or settlement recorded by any teammate shows up
 * without a manual refresh. Wraps the existing generic
 * useRealtimeInvalidate() once per already-published table (order_tasks,
 * delivery_attempts, waybills, order_settlements — all added to
 * supabase_realtime in migration 0032) rather than introducing a second
 * subscription mechanism. Call once near the top of a page that shows
 * any of these lists.
 */
export function useOperationsRealtime() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id

  const operationsKeys = [
    ['operations-summary', workspaceId],
    ['rescue-board', workspaceId],
  ] as const

  useRealtimeInvalidate('order_tasks', workspaceId, [
    ...operationsKeys,
    ['order-tasks', workspaceId],
    ['order-tasks-for-order'],
    ['task-stats', workspaceId],
  ])
  useRealtimeInvalidate('delivery_attempts', workspaceId, [...operationsKeys, ['order-delivery-attempts']])
  useRealtimeInvalidate('waybills', workspaceId, [...operationsKeys, ['waybills', workspaceId], ['order-waybills']])
  useRealtimeInvalidate('order_settlements', workspaceId, [...operationsKeys, ['settlements', workspaceId], ['order-settlements']])
}
