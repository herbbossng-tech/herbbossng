import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'
import type { MarketingCampaign } from '@/types/database'

import {
  archiveMarketingCampaign,
  createMarketingCampaign,
  fetchMarketingCampaignDetail,
  fetchMarketingCampaignList,
  fetchMarketingChannelPerformance,
  fetchMarketingLandingPagePerformance,
  fetchMarketingMediaBuyerPerformance,
  fetchMarketingProductPerformance,
  fetchMarketingSummary,
  fetchMarketingTrend,
  setMarketingCampaignStatus,
  updateMarketingCampaign,
  type MarketingCampaignFilters,
  type MarketingCampaignFormFields,
  type MarketingDateRange,
} from './api'

const marketingKeys = {
  summary: (ws: string, brand: string, range: MarketingDateRange) => ['marketing-summary', ws, brand, range] as const,
  list: (ws: string, brand: string, filters: MarketingCampaignFilters) => ['marketing-campaigns', ws, brand, filters] as const,
  detail: (id: string) => ['marketing-campaign', id] as const,
  trend: (ws: string, brand: string, campaignId: string | null, range: MarketingDateRange) => ['marketing-trend', ws, brand, campaignId, range] as const,
  channels: (ws: string, brand: string, range: MarketingDateRange) => ['marketing-channels', ws, brand, range] as const,
  mediaBuyers: (ws: string, brand: string, range: MarketingDateRange) => ['marketing-media-buyers', ws, brand, range] as const,
  landingPages: (ws: string, brand: string, range: MarketingDateRange) => ['marketing-landing-pages', ws, brand, range] as const,
  products: (ws: string, brand: string, range: MarketingDateRange) => ['marketing-products', ws, brand, range] as const,
}

function useMarketingRealtime() {
  const { activeWorkspace } = useWorkspace()
  const queryClient = useQueryClient()
  useRealtimeInvalidate('marketing_campaigns', activeWorkspace.id, [
    ['marketing-campaigns'],
    ['marketing-summary'],
    ['marketing-channels'],
    ['marketing-media-buyers'],
  ])
  return () => {
    queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] })
    queryClient.invalidateQueries({ queryKey: ['marketing-summary'] })
    queryClient.invalidateQueries({ queryKey: ['marketing-campaign'] })
    queryClient.invalidateQueries({ queryKey: ['marketing-channels'] })
    queryClient.invalidateQueries({ queryKey: ['marketing-media-buyers'] })
  }
}

export function useMarketingSummary(range: MarketingDateRange) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  useMarketingRealtime()
  return useQuery({
    queryKey: marketingKeys.summary(activeWorkspace.id, brandId, range),
    queryFn: () => fetchMarketingSummary(activeWorkspace.id, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useMarketingCampaignList(filters: MarketingCampaignFilters) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: marketingKeys.list(activeWorkspace.id, brandId, filters),
    queryFn: () => fetchMarketingCampaignList(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
    placeholderData: (prev) => prev,
  })
}

export function useMarketingCampaignDetail(id: string | undefined) {
  useWorkspace() // ensures brand/workspace context is mounted before this fires
  return useQuery({
    queryKey: marketingKeys.detail(id ?? ''),
    queryFn: () => fetchMarketingCampaignDetail(id as string),
    enabled: Boolean(id),
  })
}

export function useMarketingTrend(campaignId: string | null, range: MarketingDateRange) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: marketingKeys.trend(activeWorkspace.id, brandId, campaignId, range),
    queryFn: () => fetchMarketingTrend(activeWorkspace.id, brandId, campaignId, range),
    enabled: Boolean(brandId),
  })
}

export function useMarketingChannelPerformance(range: MarketingDateRange) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: marketingKeys.channels(activeWorkspace.id, brandId, range),
    queryFn: () => fetchMarketingChannelPerformance(activeWorkspace.id, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useMarketingMediaBuyerPerformance(range: MarketingDateRange) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: marketingKeys.mediaBuyers(activeWorkspace.id, brandId, range),
    queryFn: () => fetchMarketingMediaBuyerPerformance(activeWorkspace.id, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useMarketingLandingPagePerformance(range: MarketingDateRange) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: marketingKeys.landingPages(activeWorkspace.id, brandId, range),
    queryFn: () => fetchMarketingLandingPagePerformance(activeWorkspace.id, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useMarketingProductPerformance(range: MarketingDateRange) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: marketingKeys.products(activeWorkspace.id, brandId, range),
    queryFn: () => fetchMarketingProductPerformance(activeWorkspace.id, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useCreateMarketingCampaign() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useMarketingRealtime()
  return useMutation({
    mutationFn: (fields: MarketingCampaignFormFields) => {
      if (!activeBrand) throw new Error('Select a brand first')
      if (!user) throw new Error('You must be signed in')
      return createMarketingCampaign(activeWorkspace.id, activeBrand.id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateMarketingCampaign(id: string) {
  const { user } = useAuth()
  const invalidate = useMarketingRealtime()
  return useMutation({
    mutationFn: (fields: Partial<MarketingCampaignFormFields>) => {
      if (!user) throw new Error('You must be signed in')
      return updateMarketingCampaign(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useSetMarketingCampaignStatus(id: string) {
  const { user } = useAuth()
  const invalidate = useMarketingRealtime()
  return useMutation({
    mutationFn: (status: MarketingCampaign['status']) => {
      if (!user) throw new Error('You must be signed in')
      return setMarketingCampaignStatus(id, status, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useArchiveMarketingCampaign() {
  const invalidate = useMarketingRealtime()
  return useMutation({
    mutationFn: (id: string) => archiveMarketingCampaign(id),
    onSuccess: invalidate,
  })
}
