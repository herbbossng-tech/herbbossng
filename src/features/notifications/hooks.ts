import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { supabase } from '@/lib/supabase'

import {
  archiveNotification,
  fetchNotifications,
  fetchRecentNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  unarchiveNotification,
  type NotificationFilters,
} from './api'

export const notificationKeys = {
  list: (workspaceId: string, userId: string, filters: NotificationFilters) => ['notifications', workspaceId, userId, filters] as const,
  unreadCount: (workspaceId: string, userId: string) => ['notifications-unread-count', workspaceId, userId] as const,
  recent: (workspaceId: string, userId: string) => ['notifications-recent', workspaceId, userId] as const,
}

function useScoped() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  return { workspaceId: activeWorkspace.id, userId: user?.id ?? '' }
}

export function useNotifications(filters: NotificationFilters) {
  const { workspaceId, userId } = useScoped()
  return useQuery({
    queryKey: notificationKeys.list(workspaceId, userId, filters),
    queryFn: () => fetchNotifications(workspaceId, userId, filters),
    enabled: Boolean(workspaceId) && Boolean(userId),
    placeholderData: (prev) => prev,
  })
}

export function useUnreadNotificationCount() {
  const { workspaceId, userId } = useScoped()
  return useQuery({
    queryKey: notificationKeys.unreadCount(workspaceId, userId),
    queryFn: () => fetchUnreadCount(workspaceId, userId),
    enabled: Boolean(workspaceId) && Boolean(userId),
    refetchInterval: 60_000,
  })
}

export function useRecentNotifications() {
  const { workspaceId, userId } = useScoped()
  return useQuery({
    queryKey: notificationKeys.recent(workspaceId, userId),
    queryFn: () => fetchRecentNotifications(workspaceId, userId),
    enabled: Boolean(workspaceId) && Boolean(userId),
  })
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient()
  const { workspaceId, userId } = useScoped()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', workspaceId, userId] })
    queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(workspaceId, userId) })
    queryClient.invalidateQueries({ queryKey: notificationKeys.recent(workspaceId, userId) })
  }
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate })
}

export function useMarkAllNotificationsRead() {
  const { workspaceId, userId } = useScoped()
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: () => markAllNotificationsRead(workspaceId, userId),
    onSuccess: invalidate,
  })
}

export function useArchiveNotification() {
  const invalidate = useInvalidateNotifications()
  return useMutation({ mutationFn: archiveNotification, onSuccess: invalidate })
}

export function useUnarchiveNotification() {
  const invalidate = useInvalidateNotifications()
  return useMutation({ mutationFn: unarchiveNotification, onSuccess: invalidate })
}

/**
 * Best-effort Realtime: subscribes to INSERTs on `notifications` for
 * the active workspace and invalidates the relevant queries so the
 * bell/list update without a manual refresh. Depends on the
 * `notifications` table actually being in the Supabase project's
 * `supabase_realtime` publication (added by migration 0023, guarded
 * to no-op on a plain Postgres instance) — this sandbox cannot reach
 * a live Supabase project, so whether events actually arrive has not
 * been live-verified. If they don't (e.g. Realtime disabled on the
 * project), the 60s poll in useUnreadNotificationCount and normal
 * query invalidation on mutations still keep things correct, just
 * not instant.
 */
export function useNotificationsRealtime() {
  const { workspaceId, userId } = useScoped()
  const invalidate = useInvalidateNotifications()

  React.useEffect(() => {
    if (!workspaceId) return

    const channel = supabase
      .channel(`notifications-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `workspace_id=eq.${workspaceId}` },
        () => invalidate(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, userId])
}
