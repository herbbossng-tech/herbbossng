import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  approveAdCost,
  createAdCost,
  fetchAdCostSummary,
  fetchAdCosts,
  rejectAdCost,
  type AdCostFilters,
  type AdCostFormFields,
} from './api'

export function useAdCosts(filters: AdCostFilters = {}) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: ['ad-costs', activeWorkspace.id, brandId, filters],
    queryFn: () => fetchAdCosts(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
  })
}

export function useAdCostSummary() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: ['ad-cost-summary', activeWorkspace.id, brandId],
    queryFn: () => fetchAdCostSummary(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
}

function useInvalidateAdCosts() {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['ad-costs', activeWorkspace.id, activeBrand?.id ?? ''] })
    queryClient.invalidateQueries({ queryKey: ['ad-cost-summary', activeWorkspace.id, activeBrand?.id ?? ''] })
  }
}

export function useCreateAdCost() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateAdCosts()
  return useMutation({
    mutationFn: (fields: AdCostFormFields) => {
      if (!user) throw new Error('You must be signed in')
      if (!activeBrand) throw new Error('Select a brand first')
      return createAdCost(activeWorkspace.id, activeBrand.id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useApproveAdCost() {
  const invalidate = useInvalidateAdCosts()
  return useMutation({
    mutationFn: (id: string) => approveAdCost(id),
    onSuccess: invalidate,
  })
}

export function useRejectAdCost() {
  const invalidate = useInvalidateAdCosts()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectAdCost(id, reason),
    onSuccess: invalidate,
  })
}
