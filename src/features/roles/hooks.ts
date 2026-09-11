import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  archiveRole,
  createRole,
  duplicateRole,
  fetchAllPermissions,
  fetchRole,
  fetchRolePermissionSlugs,
  fetchRoles,
  setRolePermission,
  updateRole,
} from './api'

export const roleKeys = {
  list: (workspaceId: string) => ['roles', workspaceId] as const,
  detail: (id: string) => ['role', id] as const,
  permissions: () => ['permissions-catalogue'] as const,
  rolePermissions: (roleId: string) => ['role-permissions', roleId] as const,
}

export function useRoles() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: roleKeys.list(activeWorkspace.id),
    queryFn: () => fetchRoles(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useRole(id: string | undefined) {
  return useQuery({
    queryKey: roleKeys.detail(id ?? ''),
    queryFn: () => fetchRole(id as string),
    enabled: Boolean(id),
  })
}

export function usePermissionsCatalogue() {
  return useQuery({
    queryKey: roleKeys.permissions(),
    queryFn: fetchAllPermissions,
    staleTime: Infinity,
  })
}

export function useRolePermissionSlugs(roleId: string | undefined) {
  return useQuery({
    queryKey: roleKeys.rolePermissions(roleId ?? ''),
    queryFn: () => fetchRolePermissionSlugs(roleId as string),
    enabled: Boolean(roleId),
  })
}

function useInvalidateRoles() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: roleKeys.list(activeWorkspace.id) })
    queryClient.invalidateQueries({ queryKey: ['effective-permissions'] })
  }
}

export function useCreateRole() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) => {
      if (!user) throw new Error('You must be signed in')
      return createRole(activeWorkspace.id, name, description, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateRole(id: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: (fields: { name?: string; description?: string | null }) => {
      if (!user) throw new Error('You must be signed in')
      return updateRole(id, fields, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.detail(id) })
      invalidate()
    },
  })
}

export function useArchiveRole() {
  const { user } = useAuth()
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: (roleId: string) => {
      if (!user) throw new Error('You must be signed in')
      return archiveRole(roleId, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useDuplicateRole() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: ({ sourceRoleId, newName }: { sourceRoleId: string; newName: string }) => {
      if (!user) throw new Error('You must be signed in')
      return duplicateRole(activeWorkspace.id, sourceRoleId, newName, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useSetRolePermission(roleId: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: ({ permissionId, granted }: { permissionId: string; granted: boolean }) => {
      if (!user) throw new Error('You must be signed in')
      return setRolePermission(roleId, permissionId, granted, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.rolePermissions(roleId) })
      invalidate()
    },
  })
}
