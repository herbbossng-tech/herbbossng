import { supabase } from '@/lib/supabase'
import type { OperationsSummary, RescueBoardRow } from '@/types/database'

export async function fetchOperationsSummary(workspaceId: string, brandId: string | null): Promise<OperationsSummary> {
  const { data, error } = await supabase.rpc('get_operations_summary', { p_workspace_id: workspaceId, p_brand_id: brandId }).single()
  if (error) throw error
  return data as OperationsSummary
}

export async function fetchRescueBoard(workspaceId: string, brandId: string | null): Promise<RescueBoardRow[]> {
  const { data, error } = await supabase.rpc('get_rescue_board', { p_workspace_id: workspaceId, p_brand_id: brandId })
  if (error) throw error
  return (data ?? []) as RescueBoardRow[]
}
