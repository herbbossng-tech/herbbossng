import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'

import { fetchMyPriorityQueue, fetchMyRecentOrders, fetchMyWorkSummary } from './api'

export function useMyWorkSummary() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-work-summary', activeWorkspace.id, activeBrand?.id ?? null, user?.id],
    queryFn: () => fetchMyWorkSummary(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id && user?.id),
  })
}

export function useMyPriorityQueue(limit = 30) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-priority-queue', activeWorkspace.id, activeBrand?.id ?? null, user?.id, limit],
    queryFn: () => fetchMyPriorityQueue(activeWorkspace.id, activeBrand?.id ?? null, limit),
    enabled: Boolean(activeWorkspace.id && user?.id),
  })
}

export function useMyRecentOrders(limit = 50) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-recent-orders', activeWorkspace.id, activeBrand?.id ?? null, user?.id, limit],
    queryFn: () => fetchMyRecentOrders(activeWorkspace.id, activeBrand?.id ?? null, limit),
    enabled: Boolean(activeWorkspace.id && user?.id),
  })
}

/**
 * Wires the My Work console to Realtime — wraps the existing generic
 * useRealtimeInvalidate() (no second subscription mechanism) against
 * orders/order_tasks/support_interactions/notifications, all already
 * in the supabase_realtime publication. RLS still decides which rows
 * a subscriber's own postgres_changes stream can ever contain; this
 * only decides which cached queries to refetch when something in the
 * workspace changes. A refetch just re-runs the assigned_to =
 * auth.uid() RPCs above, so a change to another staff member's order
 * can trigger a refetch but never returns their data.
 */
export function useMyWorkRealtime() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id

  const myWorkKeys = [
    ['my-work-summary', workspaceId],
    ['my-priority-queue', workspaceId],
    ['my-recent-orders', workspaceId],
  ] as const

  useRealtimeInvalidate('orders', workspaceId, myWorkKeys)
  useRealtimeInvalidate('order_tasks', workspaceId, myWorkKeys)
  useRealtimeInvalidate('support_interactions', workspaceId, myWorkKeys)
}
