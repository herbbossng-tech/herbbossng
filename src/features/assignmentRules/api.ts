import { supabase } from '@/lib/supabase'
import type { AssignmentRule, AssignmentRuleModule, AssignmentStrategy } from '@/types/database'

export interface AssignmentRuleRow extends AssignmentRule {
  brand: { id: string; name: string } | null
}

export async function fetchAssignmentRules(workspaceId: string): Promise<AssignmentRuleRow[]> {
  const { data, error } = await supabase
    .from('assignment_rules')
    .select('*, brand:brands(id, name)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as AssignmentRuleRow[]
}

export interface AssignmentRuleFields {
  brandId?: string | null
  module: AssignmentRuleModule
  strategy: AssignmentStrategy
  fixedStaffIds?: string[]
  notes?: string | null
  isActive?: boolean
}

export async function createAssignmentRule(workspaceId: string, fields: AssignmentRuleFields, userId: string): Promise<AssignmentRule> {
  const { data, error } = await supabase
    .from('assignment_rules')
    .insert({
      workspace_id: workspaceId,
      brand_id: fields.brandId ?? null,
      module: fields.module,
      strategy: fields.strategy,
      fixed_staff_ids: fields.fixedStaffIds ?? [],
      notes: fields.notes ?? null,
      is_active: fields.isActive ?? true,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as AssignmentRule
}

export async function updateAssignmentRule(
  id: string,
  fields: Partial<AssignmentRuleFields>,
  userId: string,
): Promise<AssignmentRule> {
  const payload: Record<string, unknown> = { updated_by: userId }
  if (fields.brandId !== undefined) payload.brand_id = fields.brandId
  if (fields.module !== undefined) payload.module = fields.module
  if (fields.strategy !== undefined) payload.strategy = fields.strategy
  if (fields.fixedStaffIds !== undefined) payload.fixed_staff_ids = fields.fixedStaffIds
  if (fields.notes !== undefined) payload.notes = fields.notes
  if (fields.isActive !== undefined) payload.is_active = fields.isActive

  const { data, error } = await supabase.from('assignment_rules').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return data as AssignmentRule
}

export async function archiveAssignmentRule(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_rules')
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userId })
    .eq('id', id)
  if (error) throw error
}
