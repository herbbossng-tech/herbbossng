import { supabase } from '@/lib/supabase'
import type { ApprovalRule, ApprovalRuleModule } from '@/types/database'

export interface ApprovalRuleRow extends ApprovalRule {
  brand: { id: string; name: string } | null
  required_approver_role: { id: string; name: string } | null
}

export async function fetchApprovalRules(workspaceId: string): Promise<ApprovalRuleRow[]> {
  const { data, error } = await supabase
    .from('approval_rules')
    .select('*, brand:brands(id, name), required_approver_role:roles(id, name)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ApprovalRuleRow[]
}

export interface ApprovalRuleFields {
  brandId?: string | null
  module: ApprovalRuleModule
  thresholdAmount?: number | null
  requiredApproverRoleId?: string | null
  notes?: string | null
  isActive?: boolean
}

export async function createApprovalRule(workspaceId: string, fields: ApprovalRuleFields, userId: string): Promise<ApprovalRule> {
  const { data, error } = await supabase
    .from('approval_rules')
    .insert({
      workspace_id: workspaceId,
      brand_id: fields.brandId ?? null,
      module: fields.module,
      threshold_amount: fields.thresholdAmount ?? null,
      required_approver_role_id: fields.requiredApproverRoleId ?? null,
      notes: fields.notes ?? null,
      is_active: fields.isActive ?? true,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ApprovalRule
}

export async function updateApprovalRule(id: string, fields: Partial<ApprovalRuleFields>, userId: string): Promise<ApprovalRule> {
  const payload: Record<string, unknown> = { updated_by: userId }
  if (fields.brandId !== undefined) payload.brand_id = fields.brandId
  if (fields.module !== undefined) payload.module = fields.module
  if (fields.thresholdAmount !== undefined) payload.threshold_amount = fields.thresholdAmount
  if (fields.requiredApproverRoleId !== undefined) payload.required_approver_role_id = fields.requiredApproverRoleId
  if (fields.notes !== undefined) payload.notes = fields.notes
  if (fields.isActive !== undefined) payload.is_active = fields.isActive

  const { data, error } = await supabase.from('approval_rules').update(payload).eq('id', id).select('*').single()
  if (error) throw error
  return data as ApprovalRule
}

export async function archiveApprovalRule(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('approval_rules')
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userId })
    .eq('id', id)
  if (error) throw error
}
