import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { createDeliveryPartner, fetchDeliveryPartners, setDeliveryPartnerStatus, type DeliveryPartnerFields } from './api'

export function useDeliveryPartners() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['delivery-partners', activeWorkspace.id],
    queryFn: () => fetchDeliveryPartners(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useCreateDeliveryPartner() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fields: DeliveryPartnerFields) => {
      if (!user) throw new Error('You must be signed in')
      return createDeliveryPartner(activeWorkspace.id, fields, user.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-partners', activeWorkspace.id] }),
  })
}

export function useSetDeliveryPartnerStatus() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) => {
      if (!user) throw new Error('You must be signed in')
      return setDeliveryPartnerStatus(id, status, user.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-partners', activeWorkspace.id] }),
  })
}
