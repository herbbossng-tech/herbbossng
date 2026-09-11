import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { archiveAssignmentRule, createAssignmentRule, fetchAssignmentRules, updateAssignmentRule, type AssignmentRuleFields } from './api'

export function useAssignmentRules() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['assignment-rules', activeWorkspace.id],
    queryFn: () => fetchAssignmentRules(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

function useInvalidateAssignmentRules() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => queryClient.invalidateQueries({ queryKey: ['assignment-rules', activeWorkspace.id] })
}

export function useCreateAssignmentRule() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateAssignmentRules()
  return useMutation({
    mutationFn: (fields: AssignmentRuleFields) => {
      if (!user) throw new Error('You must be signed in')
      return createAssignmentRule(activeWorkspace.id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateAssignmentRule() {
  const { user } = useAuth()
  const invalidate = useInvalidateAssignmentRules()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<AssignmentRuleFields> }) => {
      if (!user) throw new Error('You must be signed in')
      return updateAssignmentRule(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useArchiveAssignmentRule() {
  const { user } = useAuth()
  const invalidate = useInvalidateAssignmentRules()
  return useMutation({
    mutationFn: (id: string) => {
      if (!user) throw new Error('You must be signed in')
      return archiveAssignmentRule(id, user.id)
    },
    onSuccess: invalidate,
  })
}
