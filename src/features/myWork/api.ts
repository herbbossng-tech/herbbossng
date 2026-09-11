import { supabase } from '@/lib/supabase'
import type { MyRecentOrder, MyWorkQueueItem, MyWorkSummary } from '@/types/database'

/**
 * Every function here calls a SECURITY DEFINER RPC that hard-scopes
 * its query to assigned_to = auth.uid() inside the database — there
 * is no staff-id parameter to pass or spoof. See migration 0037.
 */
export async function fetchMyWorkSummary(workspaceId: string, brandId: string | null): Promise<MyWorkSummary> {
  const { data, error } = await supabase.rpc('get_my_work_summary', { p_workspace_id: workspaceId, p_brand_id: brandId }).single()
  if (error) throw error
  return data as MyWorkSummary
}

export async function fetchMyPriorityQueue(workspaceId: string, brandId: string | null, limit = 30): Promise<MyWorkQueueItem[]> {
  const { data, error } = await supabase.rpc('get_my_priority_queue', { p_workspace_id: workspaceId, p_brand_id: brandId, p_limit: limit })
  if (error) throw error
  return (data ?? []) as MyWorkQueueItem[]
}

export async function fetchMyRecentOrders(workspaceId: string, brandId: string | null, limit = 50): Promise<MyRecentOrder[]> {
  const { data, error } = await supabase.rpc('get_my_recent_orders', { p_workspace_id: workspaceId, p_brand_id: brandId, p_limit: limit })
  if (error) throw error
  return (data ?? []) as MyRecentOrder[]
}
