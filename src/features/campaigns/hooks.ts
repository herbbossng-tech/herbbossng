import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { CampaignStatus } from '@/types/database'

import {
  createCampaign,
  deleteCampaignAsset,
  fetchApprovedAffiliates,
  fetchCampaign,
  fetchCampaignAffiliates,
  fetchCampaignAssets,
  fetchCampaignPerformance,
  fetchCampaignProducts,
  fetchCampaigns,
  setCampaignAffiliateRelationships,
  setCampaignProducts,
  setCampaignStatus,
  updateCampaign,
  uploadCampaignAsset,
  type CampaignFilters,
  type CampaignFormFields,
} from './api'

export const campaignKeys = {
  list: (workspaceId: string, brandId: string, filters: CampaignFilters) => ['campaigns', workspaceId, brandId, filters] as const,
  detail: (id: string) => ['campaign', id] as const,
  products: (id: string) => ['campaign-products', id] as const,
  affiliates: (id: string) => ['campaign-affiliates', id] as const,
  assets: (id: string) => ['campaign-assets', id] as const,
}

export function useCampaigns(filters: CampaignFilters = {}) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: campaignKeys.list(activeWorkspace.id, brandId, filters),
    queryFn: () => fetchCampaigns(activeWorkspace.id, brandId, filters),
    enabled: Boolean(activeWorkspace.id && brandId),
  })
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ''),
    queryFn: () => fetchCampaign(id as string),
    enabled: Boolean(id),
  })
}

export function useCampaignProducts(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.products(id ?? ''),
    queryFn: () => fetchCampaignProducts(id as string),
    enabled: Boolean(id),
  })
}

export function useCampaignAffiliates(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.affiliates(id ?? ''),
    queryFn: () => fetchCampaignAffiliates(id as string),
    enabled: Boolean(id),
  })
}

export function useCampaignAssets(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.assets(id ?? ''),
    queryFn: () => fetchCampaignAssets(id as string),
    enabled: Boolean(id),
  })
}

export function useApprovedAffiliates() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['approved-affiliates', activeWorkspace.id],
    queryFn: () => fetchApprovedAffiliates(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

function useInvalidateCampaigns(id?: string) {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['campaigns', activeWorkspace.id, activeBrand?.id ?? ''] })
    if (id) {
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: campaignKeys.products(id) })
      queryClient.invalidateQueries({ queryKey: campaignKeys.affiliates(id) })
    }
  }
}

export function useCreateCampaign() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: (fields: CampaignFormFields) => {
      if (!user) throw new Error('You must be signed in')
      if (!activeBrand) throw new Error('Select a brand first')
      return createCampaign(activeWorkspace.id, activeBrand.id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateCampaign(id: string) {
  const { user } = useAuth()
  const invalidate = useInvalidateCampaigns(id)
  return useMutation({
    mutationFn: (fields: Partial<CampaignFormFields>) => {
      if (!user) throw new Error('You must be signed in')
      return updateCampaign(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useSetCampaignStatus(id: string) {
  const { user } = useAuth()
  const invalidate = useInvalidateCampaigns(id)
  return useMutation({
    mutationFn: (status: CampaignStatus) => {
      if (!user) throw new Error('You must be signed in')
      return setCampaignStatus(id, status, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useSetCampaignProducts(id: string) {
  const { user } = useAuth()
  const invalidate = useInvalidateCampaigns(id)
  return useMutation({
    mutationFn: (productIds: string[]) => {
      if (!user) throw new Error('You must be signed in')
      return setCampaignProducts(id, productIds, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useSetCampaignAffiliateRelationships(id: string) {
  const { user } = useAuth()
  const invalidate = useInvalidateCampaigns(id)
  return useMutation({
    mutationFn: ({ relationship, affiliateIds }: { relationship: 'ACCESS' | 'COMMISSION_EXCEPTION'; affiliateIds: string[] }) => {
      if (!user) throw new Error('You must be signed in')
      return setCampaignAffiliateRelationships(id, relationship, affiliateIds, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUploadCampaignAsset(id: string) {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      if (!user) throw new Error('You must be signed in')
      return uploadCampaignAsset(activeWorkspace.id, id, file, user.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignKeys.assets(id) }),
  })
}

export function useDeleteCampaignAsset(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assetId: string) => deleteCampaignAsset(assetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignKeys.assets(id) }),
  })
}

export function useCampaignPerformance() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return useQuery({
    queryKey: ['campaign-performance', activeWorkspace.id, activeBrand?.id ?? null],
    queryFn: () => fetchCampaignPerformance(activeWorkspace.id, activeBrand?.id ?? null),
    enabled: Boolean(activeWorkspace.id),
  })
}
