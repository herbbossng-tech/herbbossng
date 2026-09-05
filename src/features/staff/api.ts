import { supabase } from '@/lib/supabase'
import type { Role, UserRole } from '@/types/database'

import type { StaffInvitation, StaffMember } from './types'

export async function fetchWorkspaceStaff(workspaceId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase.rpc('get_workspace_staff', { p_workspace_id: workspaceId })
  if (error) throw error
  return (data ?? []) as StaffMember[]
}

export async function fetchAssignableStaff(workspaceId: string): Promise<{ user_id: string; email: string; first_name: string | null; last_name: string | null }[]> {
  const { data, error } = await supabase.rpc('get_assignable_staff', { p_workspace_id: workspaceId })
  if (error) throw error
  return data ?? []
}

export async function fetchStaffMember(workspaceId: string, userId: string): Promise<StaffMember | null> {
  const all = await fetchWorkspaceStaff(workspaceId)
  return all.find((s) => s.user_id === userId) ?? null
}

export async function fetchStaffRoles(workspaceId: string, userId: string): Promise<(UserRole & { role: Role; brand: { id: string; name: string } | null })[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('*, role:roles(*), brand:brands(id, name)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as unknown as (UserRole & { role: Role; brand: { id: string; name: string } | null })[]
}

export async function assignRoleToStaff(workspaceId: string, userId: string, roleId: string, createdBy: string, brandId?: string | null): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .insert({ workspace_id: workspaceId, user_id: userId, role_id: roleId, brand_id: brandId ?? null, created_by: createdBy })
  if (error && error.code !== '23505') throw error
}

export async function removeRoleFromStaff(userRoleId: string): Promise<void> {
  const { error } = await supabase.from('user_roles').delete().eq('id', userRoleId)
  if (error) throw error
}

export async function updateStaffStatus(workspaceId: string, userId: string, status: 'active' | 'inactive' | 'suspended'): Promise<void> {
  const { error } = await supabase.rpc('set_staff_status', { p_workspace_id: workspaceId, p_user_id: userId, p_status: status })
  if (error) throw error
}

export async function updateStaffProfile(userId: string, fields: { first_name?: string | null; last_name?: string | null; department?: string | null }): Promise<void> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId)
  if (error) throw error
}

export async function fetchStaffInvitations(workspaceId: string): Promise<StaffInvitation[]> {
  const { data, error } = await supabase
    .from('staff_invitations')
    .select('*, role:roles(name)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as StaffInvitation[]
}

export interface CreatedInvitation {
  id: string
  token: string
  expires_at: string
}

export async function createStaffInvitation(workspaceId: string, email: string, roleId: string, brandId?: string | null): Promise<CreatedInvitation> {
  const { data, error } = await supabase
    .rpc('create_staff_invitation', { p_workspace_id: workspaceId, p_email: email, p_role_id: roleId, p_brand_id: brandId ?? null })
    .single()
  if (error) throw error
  return data as CreatedInvitation
}

export async function revokeStaffInvitation(id: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_staff_invitation', { p_id: id })
  if (error) throw error
}
