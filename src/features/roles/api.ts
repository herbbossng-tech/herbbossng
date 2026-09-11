import { supabase } from '@/lib/supabase'
import type { Permission, Role, RolePermission } from '@/types/database'

export interface RoleWithStaffCount extends Role {
  staff_count: number
}

/** System role templates (workspace_id null) + this workspace's own custom roles. */
export async function fetchRoles(workspaceId: string): Promise<RoleWithStaffCount[]> {
  const [rolesRes, staffCountsRes] = await Promise.all([
    supabase
      .from('roles')
      .select('*')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .is('deleted_at', null)
      .order('is_system_role', { ascending: false })
      .order('name'),
    supabase.from('user_roles').select('role_id').eq('workspace_id', workspaceId),
  ])
  if (rolesRes.error) throw rolesRes.error
  if (staffCountsRes.error) throw staffCountsRes.error

  const counts = new Map<string, number>()
  for (const row of staffCountsRes.data ?? []) {
    counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + 1)
  }

  return (rolesRes.data ?? []).map((role) => ({ ...(role as Role), staff_count: counts.get(role.id) ?? 0 }))
}

export async function fetchRole(roleId: string): Promise<RoleWithStaffCount> {
  const [roleRes, countRes] = await Promise.all([
    supabase.from('roles').select('*').eq('id', roleId).single(),
    supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role_id', roleId),
  ])
  if (roleRes.error) throw roleRes.error
  if (countRes.error) throw countRes.error
  return { ...(roleRes.data as Role), staff_count: countRes.count ?? 0 }
}

export async function fetchAllPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase.from('permissions').select('*').order('module').order('action')
  if (error) throw error
  return (data ?? []) as Permission[]
}

export async function fetchRolePermissionSlugs(roleId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permission:permissions(slug)')
    .eq('role_id', roleId)
  if (error) throw error
  const slugs = ((data ?? []) as unknown as { permission: { slug: string } | null }[])
    .map((row) => row.permission?.slug)
    .filter((slug): slug is string => Boolean(slug))
  return new Set(slugs)
}

export async function createRole(workspaceId: string, name: string, description: string, userId: string): Promise<Role> {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const { data, error } = await supabase
    .from('roles')
    .insert({ workspace_id: workspaceId, name: name.trim(), slug, description: description || null, created_by: userId, updated_by: userId })
    .select('*')
    .single()
  if (error) throw error
  return data as Role
}

export async function updateRole(roleId: string, fields: { name?: string; description?: string | null }, userId: string): Promise<Role> {
  const { data, error } = await supabase
    .from('roles')
    .update({ ...fields, updated_by: userId })
    .eq('id', roleId)
    .select('*')
    .single()
  if (error) throw error
  return data as Role
}

export async function archiveRole(roleId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('roles').update({ deleted_at: new Date().toISOString(), updated_by: userId }).eq('id', roleId)
  if (error) throw error
}

export async function duplicateRole(workspaceId: string, sourceRoleId: string, newName: string, userId: string): Promise<Role> {
  const [role, permissionSlugs] = await Promise.all([fetchRole(sourceRoleId), fetchRolePermissionSlugs(sourceRoleId)])
  const created = await createRole(workspaceId, newName, role.description ?? '', userId)

  if (permissionSlugs.size > 0) {
    const { data: perms, error: permError } = await supabase.from('permissions').select('id, slug').in('slug', Array.from(permissionSlugs))
    if (permError) throw permError
    const rows = (perms ?? []).map((p) => ({ role_id: created.id, permission_id: p.id, created_by: userId }))
    if (rows.length > 0) {
      const { error } = await supabase.from('role_permissions').insert(rows)
      if (error) throw error
    }
  }
  return created
}

export async function setRolePermission(roleId: string, permissionId: string, granted: boolean, userId: string): Promise<void> {
  if (granted) {
    const { error } = await supabase.from('role_permissions').insert({ role_id: roleId, permission_id: permissionId, created_by: userId })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', permissionId)
    if (error) throw error
  }
}

export type { RolePermission }
