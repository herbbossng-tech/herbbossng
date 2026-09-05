import { supabase } from '@/lib/supabase'
import type { AuditLog } from '@/types/database'

export interface AuditLogFilters {
  search?: string
  dateFrom?: string
  dateTo?: string
  userId?: string | 'all'
  module?: string | 'all'
  action?: string | 'all'
  entityType?: string
  brandId?: string | 'all'
  page?: number
  pageSize?: number
}

export interface AuditLogRow extends AuditLog {
  user_email: string | null
  user_name: string | null
}

const DEFAULT_PAGE_SIZE = 30

export async function fetchAuditLogs(workspaceId: string, filters: AuditLogFilters = {}): Promise<{ rows: AuditLogRow[]; totalCount: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('audit_logs').select('*', { count: 'exact' }).eq('workspace_id', workspaceId)

  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)
  if (filters.userId && filters.userId !== 'all') query = query.eq('user_id', filters.userId)
  if (filters.module && filters.module !== 'all') query = query.eq('module', filters.module)
  if (filters.action && filters.action !== 'all') query = query.eq('action', filters.action)
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.brandId && filters.brandId !== 'all') query = query.eq('brand_id', filters.brandId)
  if (filters.search) {
    const term = filters.search.trim()
    query = query.or(`module.ilike.%${term}%,action.ilike.%${term}%,entity_type.ilike.%${term}%`)
  }

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error

  const logs = (data ?? []) as AuditLog[]
  const userIds = Array.from(new Set(logs.map((l) => l.user_id).filter((id): id is string => Boolean(id))))

  let profileMap = new Map<string, { email: string; first_name: string | null; last_name: string | null }>()
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, email, first_name, last_name').in('id', userIds)
    if (profileError) throw profileError
    profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  }

  const rows: AuditLogRow[] = logs.map((log) => {
    const profile = log.user_id ? profileMap.get(log.user_id) : undefined
    return {
      ...log,
      user_email: profile?.email ?? null,
      user_name: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email : null,
    }
  })

  return { rows, totalCount: count ?? rows.length }
}
