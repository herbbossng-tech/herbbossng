import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  fetchCommunicationTemplates,
  sendManualCommunication,
  setCommunicationTemplateActive,
  testCommunicationProvider,
  upsertCommunicationTemplate,
  type UpsertCommunicationTemplateInput,
} from './api'

export function useCommunicationTemplates(brandId?: string | null) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['communication-templates', activeWorkspace.id, brandId ?? 'all'],
    queryFn: () => fetchCommunicationTemplates(activeWorkspace.id, brandId),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useUpsertCommunicationTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertCommunicationTemplateInput) => upsertCommunicationTemplate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication-templates'] }),
  })
}

export function useSetCommunicationTemplateActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setCommunicationTemplateActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication-templates'] }),
  })
}

export function useSendManualCommunication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: sendManualCommunication,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication-log'] }),
  })
}

export function useTestCommunicationProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ brandId, channel, testRecipient }: { brandId: string; channel: Parameters<typeof testCommunicationProvider>[1]; testRecipient: string }) =>
      testCommunicationProvider(brandId, channel, testRecipient),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication-log'] }),
  })
}
