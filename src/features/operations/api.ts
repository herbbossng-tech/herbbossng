import { supabase } from '@/lib/supabase'
import type { AutoAssignmentSweepResult, OperationsSummary, RescueBoardRow, WorkforceOpsSummary } from '@/types/database'

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

export async function fetchWorkforceOpsSummary(workspaceId: string, brandId: string | null): Promise<WorkforceOpsSummary> {
  const { data, error } = await supabase.rpc('get_workforce_ops_summary', { p_workspace_id: workspaceId, p_brand_id: brandId }).single()
  if (error) throw error
  return data as WorkforceOpsSummary
}

export async function runAutoAssignmentSweep(workspaceId: string, brandId: string | null, limit = 20): Promise<AutoAssignmentSweepResult[]> {
  const { data, error } = await supabase.rpc('run_auto_assignment_sweep', { p_workspace_id: workspaceId, p_brand_id: brandId, p_limit: limit })
  if (error) throw error
  return (data ?? []) as AutoAssignmentSweepResult[]
}
