import { supabase } from '@/lib/supabase'
import type {
  AutomationAction,
  AutomationCondition,
  AutomationConditionsLogic,
  AutomationEvent,
  AutomationEventType,
  AutomationExecution,
  AutomationExecutionAction,
  AutomationExecutionStatus,
  AutomationRule,
  AutomationRuleStatus,
} from '@/types/database'

export interface AutomationRuleRow extends AutomationRule {
  brand: { id: string; name: string } | null
}

export async function fetchAutomationRules(workspaceId: string): Promise<AutomationRuleRow[]> {
  const { data, error } = await supabase
    .from('automation_rules')
    .select('*, brand:brands(id, name)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as AutomationRuleRow[]
}

export interface AutomationRuleFields {
  brandId?: string | null
  name: string
  description?: string | null
  eventType: AutomationEventType | string
  status?: AutomationRuleStatus
  priority?: number
  conditions: AutomationCondition[]
  conditionsLogic: AutomationConditionsLogic
  actions: AutomationAction[]
}

export async function createAutomationRule(workspaceId: string, fields: AutomationRuleFields, userId: string): Promise<AutomationRule> {
  const { data, error } = await supabase
    .from('automation_rules')
    .insert({
      workspace_id: workspaceId,
      brand_id: fields.brandId ?? null,
      name: fields.name,
      description: fields.description ?? null,
      event_type: fields.eventType,
      status: fields.status ?? 'draft',
      priority: fields.priority ?? 100,
      conditions: fields.conditions,
      conditions_logic: fields.conditionsLogic,
      actions: fields.actions,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as AutomationRule
}

export async function updateAutomationRule(id: string, fields: Partial<AutomationRuleFields>, userId: string): Promise<AutomationRule> {
  const payload: Record<string, unknown> = { updated_by: userId }
  if (fields.brandId !== undefined) payload.brand_id = fields.brandId
  if (fields.name !== undefined) payload.name = fields.name
  if (fields.description !== undefined) payload.description = fields.description
  if (fields.eventType !== undefined) payload.event_type = fields.eventType
  if (fields.status !== undefined) payload.status = fields.status
  if (fields.priority !== undefined) payload.priority = fields.priority
  if (fields.conditions !== undefined) payload.conditions = fields.conditions
  if (fields.conditionsLogic !== undefined) payload.conditions_logic = fields.conditionsLogic
  if (fields.actions !== undefined) payload.actions = fields.actions

  const { data, error } = await supabase.from('automation_rules').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return data as AutomationRule
}

export async function setAutomationRuleStatus(id: string, status: AutomationRuleStatus, userId: string): Promise<void> {
  const { error } = await supabase.from('automation_rules').update({ status, updated_by: userId }).eq('id', id)
  if (error) throw error
}

export async function archiveAutomationRule(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('automation_rules')
    .update({ status: 'archived', deleted_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
  if (error) throw error
}

export async function duplicateAutomationRule(rule: AutomationRuleRow, userId: string): Promise<AutomationRule> {
  return createAutomationRule(
    rule.workspace_id,
    {
      brandId: rule.brand_id,
      name: `${rule.name} (copy)`,
      description: rule.description,
      eventType: rule.event_type,
      status: 'draft',
      priority: rule.priority,
      conditions: rule.conditions,
      conditionsLogic: rule.conditions_logic,
      actions: rule.actions,
    },
    userId,
  )
}

// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------
export interface AutomationEventFilters {
  search?: string
  eventType?: string | 'all'
  entityType?: string | 'all'
  processingStatus?: string | 'all'
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 30

export async function fetchAutomationEvents(workspaceId: string, filters: AutomationEventFilters = {}): Promise<{ rows: AutomationEvent[]; totalCount: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('automation_events').select('*', { count: 'exact' }).eq('workspace_id', workspaceId)
  if (filters.eventType && filters.eventType !== 'all') query = query.eq('event_type', filters.eventType)
  if (filters.entityType && filters.entityType !== 'all') query = query.eq('entity_type', filters.entityType)
  if (filters.processingStatus && filters.processingStatus !== 'all') query = query.eq('processing_status', filters.processingStatus)
  if (filters.dateFrom) query = query.gte('occurred_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('occurred_at', filters.dateTo)
  if (filters.search) {
    const term = filters.search.trim()
    query = query.or(`event_type.ilike.%${term}%,entity_type.ilike.%${term}%,idempotency_key.ilike.%${term}%`)
  }

  const { data, error, count } = await query.order('occurred_at', { ascending: false }).range(from, to)
  if (error) throw error
  return { rows: (data ?? []) as AutomationEvent[], totalCount: count ?? (data ?? []).length }
}

// ---------------------------------------------------------------------
// Executions
// ---------------------------------------------------------------------
export interface AutomationExecutionRow extends AutomationExecution {
  rule: { id: string; name: string } | null
  event: { id: string; event_type: string; entity_type: string; entity_id: string | null } | null
}

export interface AutomationExecutionFilters {
  search?: string
  status?: AutomationExecutionStatus | 'all'
  ruleId?: string | 'all'
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export async function fetchAutomationExecutions(
  workspaceId: string,
  filters: AutomationExecutionFilters = {},
): Promise<{ rows: AutomationExecutionRow[]; totalCount: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('automation_executions')
    .select('*, rule:automation_rules(id, name), event:automation_events(id, event_type, entity_type, entity_id)', { count: 'exact' })
    .eq('workspace_id', workspaceId)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.ruleId && filters.ruleId !== 'all') query = query.eq('rule_id', filters.ruleId)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error

  let rows = (data ?? []) as unknown as AutomationExecutionRow[]
  if (filters.search) {
    const term = filters.search.trim().toLowerCase()
    rows = rows.filter(
      (r) =>
        r.rule?.name.toLowerCase().includes(term) ||
        r.event?.event_type.toLowerCase().includes(term) ||
        r.event?.entity_id?.toLowerCase().includes(term),
    )
  }
  return { rows, totalCount: count ?? rows.length }
}

export async function fetchAutomationEvent(eventId: string): Promise<AutomationEvent | null> {
  const { data, error } = await supabase.from('automation_events').select('*').eq('id', eventId).maybeSingle()
  if (error) throw error
  return (data as AutomationEvent) ?? null
}

export async function fetchAutomationExecutionActions(executionId: string): Promise<AutomationExecutionAction[]> {
  const { data, error } = await supabase
    .from('automation_execution_actions')
    .select('*')
    .eq('execution_id', executionId)
    .order('action_seq', { ascending: true })
  if (error) throw error
  return (data ?? []) as AutomationExecutionAction[]
}

export async function fetchFailedAutomationExecutions(
  workspaceId: string,
  filters: Omit<AutomationExecutionFilters, 'status'> = {},
): Promise<{ rows: AutomationExecutionRow[]; totalCount: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('automation_executions')
    .select('*, rule:automation_rules(id, name), event:automation_events(id, event_type, entity_type, entity_id)', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .in('status', ['failed', 'retrying'])
  if (filters.ruleId && filters.ruleId !== 'all') query = query.eq('rule_id', filters.ruleId)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  return { rows: (data ?? []) as unknown as AutomationExecutionRow[], totalCount: count ?? (data ?? []).length }
}

export async function retryAutomationExecution(executionId: string): Promise<AutomationExecution> {
  const { data, error } = await supabase.rpc('retry_automation_execution', { p_execution_id: executionId }).single()
  if (error) throw error
  return data as AutomationExecution
}
