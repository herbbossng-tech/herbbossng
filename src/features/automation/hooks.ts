import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { AutomationRuleStatus } from '@/types/database'

import {
  archiveAutomationRule,
  createAutomationRule,
  duplicateAutomationRule,
  fetchAutomationEvent,
  fetchAutomationEvents,
  fetchAutomationExecutionActions,
  fetchAutomationExecutions,
  fetchAutomationRules,
  fetchFailedAutomationExecutions,
  retryAutomationExecution,
  setAutomationRuleStatus,
  updateAutomationRule,
  type AutomationEventFilters,
  type AutomationExecutionFilters,
  type AutomationRuleFields,
  type AutomationRuleRow,
} from './api'

export function useAutomationRules() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['automation-rules', activeWorkspace.id],
    queryFn: () => fetchAutomationRules(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

function useInvalidateAutomationRules() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => queryClient.invalidateQueries({ queryKey: ['automation-rules', activeWorkspace.id] })
}

export function useCreateAutomationRule() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateAutomationRules()
  return useMutation({
    mutationFn: (fields: AutomationRuleFields) => {
      if (!user) throw new Error('You must be signed in')
      return createAutomationRule(activeWorkspace.id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateAutomationRule() {
  const { user } = useAuth()
  const invalidate = useInvalidateAutomationRules()
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<AutomationRuleFields> }) => {
      if (!user) throw new Error('You must be signed in')
      return updateAutomationRule(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useSetAutomationRuleStatus() {
  const { user } = useAuth()
  const invalidate = useInvalidateAutomationRules()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AutomationRuleStatus }) => {
      if (!user) throw new Error('You must be signed in')
      return setAutomationRuleStatus(id, status, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useArchiveAutomationRule() {
  const { user } = useAuth()
  const invalidate = useInvalidateAutomationRules()
  return useMutation({
    mutationFn: (id: string) => {
      if (!user) throw new Error('You must be signed in')
      return archiveAutomationRule(id, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useDuplicateAutomationRule() {
  const { user } = useAuth()
  const invalidate = useInvalidateAutomationRules()
  return useMutation({
    mutationFn: (rule: AutomationRuleRow) => {
      if (!user) throw new Error('You must be signed in')
      return duplicateAutomationRule(rule, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useAutomationEvents(filters: AutomationEventFilters) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['automation-events', activeWorkspace.id, filters],
    queryFn: () => fetchAutomationEvents(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
    placeholderData: (prev) => prev,
  })
}

export function useAutomationExecutions(filters: AutomationExecutionFilters) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['automation-executions', activeWorkspace.id, filters],
    queryFn: () => fetchAutomationExecutions(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
    placeholderData: (prev) => prev,
  })
}

export function useFailedAutomationExecutions(filters: Omit<AutomationExecutionFilters, 'status'>) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['automation-failed-executions', activeWorkspace.id, filters],
    queryFn: () => fetchFailedAutomationExecutions(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
    placeholderData: (prev) => prev,
  })
}

export function useAutomationExecutionActions(executionId: string | null) {
  return useQuery({
    queryKey: ['automation-execution-actions', executionId],
    queryFn: () => fetchAutomationExecutionActions(executionId as string),
    enabled: Boolean(executionId),
  })
}

export function useAutomationEvent(eventId: string | null) {
  return useQuery({
    queryKey: ['automation-event', eventId],
    queryFn: () => fetchAutomationEvent(eventId as string),
    enabled: Boolean(eventId),
  })
}

export function useRetryAutomationExecution() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return useMutation({
    mutationFn: (executionId: string) => retryAutomationExecution(executionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-executions', activeWorkspace.id] })
      queryClient.invalidateQueries({ queryKey: ['automation-failed-executions', activeWorkspace.id] })
      queryClient.invalidateQueries({ queryKey: ['automation-execution-actions'] })
    },
  })
}
