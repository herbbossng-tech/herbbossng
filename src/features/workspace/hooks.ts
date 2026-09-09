import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { createWorkspace, fetchCountries, fetchCurrencies, updateWorkspace, type CreateWorkspaceInput, type WorkspaceUpdateFields } from './api'

export function useCountries() {
  return useQuery({ queryKey: ['countries'], queryFn: fetchCountries, staleTime: Infinity })
}

export function useCurrencies() {
  return useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies, staleTime: Infinity })
}

export function useUpdateWorkspace() {
  const { activeWorkspace, refetchWorkspaces } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fields: WorkspaceUpdateFields) => {
      if (!user) throw new Error('You must be signed in')
      return updateWorkspace(activeWorkspace.id, fields, user.id)
    },
    onSuccess: () => {
      refetchWorkspaces()
      queryClient.invalidateQueries({ queryKey: ['my-workspaces-and-brands'] })
    },
  })
}

/**
 * Creates a new, independent workspace and switches into it. Never
 * mutates or replaces any workspace the user already belongs to —
 * this is the fix for the "creating a second workspace overwrites the
 * first" bug, which was actually the absence of any creation path.
 */
export function useCreateWorkspace() {
  const { refetchWorkspaces, setActiveWorkspaceId } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => createWorkspace(input),
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: ['my-workspaces-and-brands'] })
      refetchWorkspaces()
      setActiveWorkspaceId(workspace.id)
    },
  })
}
