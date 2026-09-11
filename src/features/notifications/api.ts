import { supabase } from '@/lib/supabase'
import type { Notification } from '@/types/database'

export type NotificationTab = 'unread' | 'read' | 'archived'

export interface NotificationFilters {
  tab?: NotificationTab
  priority?: string | 'all'
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 20

/**
 * A notification belongs to the caller if user_id = them (personal)
 * or user_id IS NULL (workspace broadcast) — RLS (select_notifications)
 * already enforces both branches scoped to the caller's own
 * workspaces, so this query only needs to add the tab/priority filter.
 */
export async function fetchNotifications(
  workspaceId: string,
  userId: string,
  filters: NotificationFilters = {},
): Promise<{ rows: Notification[]; totalCount: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .is('deleted_at', null)

  const tab = filters.tab ?? 'unread'
  if (tab === 'archived') {
    query = query.eq('is_archived', true)
  } else {
    query = query.eq('is_archived', false)
    if (tab === 'unread') query = query.eq('is_read', false)
    if (tab === 'read') query = query.eq('is_read', true)
  }
  if (filters.priority && filters.priority !== 'all') query = query.eq('priority', filters.priority)

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  return { rows: (data ?? []) as Notification[], totalCount: count ?? 0 }
}

export async function fetchUnreadCount(workspaceId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('is_read', false)
    .eq('is_archived', false)
    .is('deleted_at', null)
  if (error) throw error
  return count ?? 0
}

export async function fetchRecentNotifications(workspaceId: string, userId: string, limit = 6): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Notification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(workspaceId: string, userId: string): Promise<void> {
  const nowIso = new Date().toISOString()
  const [own, broadcast] = await Promise.all([
    supabase.from('notifications').update({ is_read: true, read_at: nowIso }).eq('workspace_id', workspaceId).eq('user_id', userId).eq('is_read', false),
    supabase
      .from('notifications')
      .update({ is_read: true, read_at: nowIso })
      .eq('workspace_id', workspaceId)
      .is('user_id', null)
      .eq('is_read', false),
  ])
  if (own.error) throw own.error
  if (broadcast.error) throw broadcast.error
}

export async function archiveNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function unarchiveNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_archived: false, archived_at: null }).eq('id', id)
  if (error) throw error
}
