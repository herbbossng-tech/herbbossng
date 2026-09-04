import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { archiveApprovalRule, createApprovalRule, fetchApprovalRules, updateApprovalRule, type ApprovalRuleFields } from './api'

export function useApprovalRules() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['approval-rules', activeWorkspace.id],
    queryFn: () => fetchApprovalRules(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

function useInvalidateApprovalRules() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => queryClient.invalidateQueries({ queryKey: ['approval-rules', activeWorkspace.id] })
}

export function useCreateApprovalRule() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateApprovalRules()
  return useMutation({
    mutationFn: (fields: ApprovalRuleFields) => {
      if (!user) throw new Error('You must be signed in')
      return createApprovalRule(activeWorkspace.id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateApprovalRule() {
  const { user } = useAuth()
  const invalidate = useInvalidateApprovalRules()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<ApprovalRuleFields> }) => {
      if (!user) throw new Error('You must be signed in')
      return updateApprovalRule(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useArchiveApprovalRule() {
  const { user } = useAuth()
  const invalidate = useInvalidateApprovalRules()
  return useMutation({
    mutationFn: (id: string) => {
      if (!user) throw new Error('You must be signed in')
      return archiveApprovalRule(id, user.id)
    },
    onSuccess: invalidate,
  })
}
