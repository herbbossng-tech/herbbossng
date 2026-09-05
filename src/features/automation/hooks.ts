import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'
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

/**
 * Wires the Automation Executions / Failed Automations views to
 * Realtime so a rule finishing, retrying, or getting reclaimed from a
 * stuck run shows up without a manual refresh. Wraps the existing
 * generic useRealtimeInvalidate() against automation_executions (already
 * in the supabase_realtime publication since migration 0032) rather than
 * a second subscription mechanism. Call once near the top of a page
 * that lists executions or failed automations.
 */
export function useAutomationRealtime() {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace.id
  useRealtimeInvalidate('automation_executions', workspaceId, [
    ['automation-executions', workspaceId],
    ['automation-failed-executions', workspaceId],
    ['automation-execution-actions'],
  ])
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
