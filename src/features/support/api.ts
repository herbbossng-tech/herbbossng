import { supabase } from '@/lib/supabase'
import type {
  RescueAttempt,
  RescueCase,
  RescueCaseStatus,
  RescueFunnel,
  SupportAnalytics,
  SupportInteraction,
  SupportInteractionOutcome,
  SupportInteractionType,
  SupportQueueRow,
  SupportSummary,
  TaskPriority,
} from '@/types/database'

export async function fetchSupportQueue(workspaceId: string, brandId: string | null, limit = 200): Promise<SupportQueueRow[]> {
  const { data, error } = await supabase.rpc('get_support_queue', { p_workspace_id: workspaceId, p_brand_id: brandId, p_limit: limit })
  if (error) throw error
  return (data ?? []) as SupportQueueRow[]
}

export async function fetchSupportSummary(workspaceId: string, brandId: string | null): Promise<SupportSummary> {
  const { data, error } = await supabase.rpc('get_support_summary', { p_workspace_id: workspaceId, p_brand_id: brandId }).single()
  if (error) throw error
  return data as SupportSummary
}

export async function fetchRescueFunnel(workspaceId: string, brandId: string | null, days = 30): Promise<RescueFunnel> {
  const { data, error } = await supabase.rpc('get_rescue_funnel', { p_workspace_id: workspaceId, p_brand_id: brandId, p_days: days }).single()
  if (error) throw error
  return data as RescueFunnel
}

export async function fetchSupportAnalytics(workspaceId: string, brandId: string | null, days = 30): Promise<SupportAnalytics> {
  const { data, error } = await supabase.rpc('get_support_analytics', { p_workspace_id: workspaceId, p_brand_id: brandId, p_days: days }).single()
  if (error) throw error
  return data as SupportAnalytics
}

export async function fetchOrderInteractions(orderId: string): Promise<SupportInteraction[]> {
  const { data, error } = await supabase.from('support_interactions').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SupportInteraction[]
}

export async function fetchCustomerInteractions(customerId: string): Promise<SupportInteraction[]> {
  const { data, error } = await supabase.from('support_interactions').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SupportInteraction[]
}

export async function createSupportInteraction(input: {
  interactionType: SupportInteractionType
  summary: string
  orderId?: string | null
  customerId?: string | null
  outcome?: SupportInteractionOutcome | null
  relatedTaskId?: string | null
}): Promise<SupportInteraction> {
  const { data, error } = await supabase
    .rpc('create_support_interaction', {
      p_interaction_type: input.interactionType,
      p_summary: input.summary,
      p_order_id: input.orderId ?? null,
      p_customer_id: input.customerId ?? null,
      p_outcome: input.outcome ?? null,
      p_related_task_id: input.relatedTaskId ?? null,
    })
    .single()
  if (error) throw error
  return data as SupportInteraction
}

export async function fetchOrderRescueCase(orderId: string): Promise<RescueCase | null> {
  const { data, error } = await supabase
    .from('rescue_cases')
    .select('*')
    .eq('order_id', orderId)
    .not('status', 'in', '(CONVERTED,LOST,CANCELLED)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as RescueCase | null
}

export async function fetchOrderRescueCases(orderId: string): Promise<RescueCase[]> {
  const { data, error } = await supabase.from('rescue_cases').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RescueCase[]
}

export async function fetchActiveRescueCases(workspaceId: string, brandId: string | null): Promise<RescueCase[]> {
  let query = supabase.from('rescue_cases').select('*').eq('workspace_id', workspaceId).not('status', 'in', '(CONVERTED,LOST,CANCELLED)')
  if (brandId) query = query.eq('brand_id', brandId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RescueCase[]
}

export async function fetchRescueAttempts(rescueCaseId: string): Promise<RescueAttempt[]> {
  const { data, error } = await supabase.from('rescue_attempts').select('*').eq('rescue_case_id', rescueCaseId).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as RescueAttempt[]
}

export async function createRescueCase(orderId: string, reason: string, priority: TaskPriority = 'normal', assignedTo?: string | null): Promise<RescueCase> {
  const { data, error } = await supabase
    .rpc('create_rescue_case', { p_order_id: orderId, p_reason: reason, p_priority: priority, p_assigned_to: assignedTo ?? null })
    .single()
  if (error) throw error
  return data as RescueCase
}

export async function updateRescueCaseStatus(
  rescueCaseId: string,
  status: RescueCaseStatus,
  note?: string | null,
  outcome?: SupportInteractionOutcome | null,
): Promise<RescueCase> {
  const { data, error } = await supabase
    .rpc('update_rescue_case_status', { p_rescue_case_id: rescueCaseId, p_status: status, p_note: note ?? null, p_outcome: outcome ?? null })
    .single()
  if (error) throw error
  return data as RescueCase
}

export async function escalateRescueCase(rescueCaseId: string, reason: string, reassignTo?: string | null): Promise<RescueCase> {
  const { data, error } = await supabase
    .rpc('escalate_rescue_case', { p_rescue_case_id: rescueCaseId, p_reason: reason, p_reassign_to: reassignTo ?? null })
    .single()
  if (error) throw error
  return data as RescueCase
}
