import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { fetchCountries, fetchCurrencies, updateWorkspace, type WorkspaceUpdateFields } from './api'

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
