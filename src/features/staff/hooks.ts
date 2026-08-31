import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  assignRoleToStaff,
  createStaffInvitation,
  fetchAssignableStaff,
  fetchStaffInvitations,
  fetchStaffRoles,
  fetchWorkspaceStaff,
  removeRoleFromStaff,
  revokeStaffInvitation,
  updateStaffProfile,
  updateStaffStatus,
} from './api'

export const staffKeys = {
  list: (workspaceId: string) => ['staff', workspaceId] as const,
  assignable: (workspaceId: string) => ['staff-assignable', workspaceId] as const,
  roles: (workspaceId: string, userId: string) => ['staff-roles', workspaceId, userId] as const,
  invitations: (workspaceId: string) => ['staff-invitations', workspaceId] as const,
}

export function useStaff() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: staffKeys.list(activeWorkspace.id),
    queryFn: () => fetchWorkspaceStaff(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useAssignableStaff() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: staffKeys.assignable(activeWorkspace.id),
    queryFn: () => fetchAssignableStaff(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useStaffRoles(userId: string | undefined) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: staffKeys.roles(activeWorkspace.id, userId ?? ''),
    queryFn: () => fetchStaffRoles(activeWorkspace.id, userId as string),
    enabled: Boolean(activeWorkspace.id) && Boolean(userId),
  })
}

export function useStaffInvitations() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: staffKeys.invitations(activeWorkspace.id),
    queryFn: () => fetchStaffInvitations(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

function useInvalidateStaff() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: staffKeys.list(activeWorkspace.id) })
    queryClient.invalidateQueries({ queryKey: staffKeys.assignable(activeWorkspace.id) })
    queryClient.invalidateQueries({ queryKey: ['effective-permissions'] })
  }
}

export function useCreateInvitation() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, roleId, brandId }: { email: string; roleId: string; brandId?: string | null }) =>
      createStaffInvitation(activeWorkspace.id, email, roleId, brandId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: staffKeys.invitations(activeWorkspace.id) }),
  })
}

export function useRevokeInvitation() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeStaffInvitation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: staffKeys.invitations(activeWorkspace.id) }),
  })
}

export function useUpdateStaffStatus() {
  const invalidate = useInvalidateStaff()
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) => updateStaffStatus(userId, status),
    onSuccess: invalidate,
  })
}

export function useUpdateStaffProfile() {
  const invalidate = useInvalidateStaff()
  return useMutation({
    mutationFn: ({ userId, fields }: { userId: string; fields: { first_name?: string | null; last_name?: string | null; department?: string | null } }) =>
      updateStaffProfile(userId, fields),
    onSuccess: invalidate,
  })
}

export function useAssignRole() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateStaff()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => {
      if (!user) throw new Error('You must be signed in')
      return assignRoleToStaff(activeWorkspace.id, userId, roleId, user.id)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: staffKeys.roles(activeWorkspace.id, variables.userId) })
      invalidate()
    },
  })
}

export function useRemoveRole() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateStaff()
  return useMutation({
    mutationFn: (userRoleId: string) => removeRoleFromStaff(userRoleId),
    onSuccess: (_data, _vars) => {
      queryClient.invalidateQueries({ queryKey: ['staff-roles', activeWorkspace.id] })
      invalidate()
    },
  })
}
