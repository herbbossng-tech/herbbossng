import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  archiveMyOrderForm,
  createMyOrderForm,
  fetchCampaignProducts,
  fetchMyAvailableCampaigns,
  fetchMyDashboard,
  fetchMyOrderForms,
  fetchOrderFormPackages,
  fetchPublicOrderForm,
  getMyAffiliateProfile,
  submitPublicAffiliateOrder,
  updateMyOrderForm,
  type OrderFormPackageInput,
  type PublicAffiliateOrderInput,
} from './api'

export const affiliatePortalKeys = {
  profile: ['affiliate-portal', 'profile'] as const,
  dashboard: ['affiliate-portal', 'dashboard'] as const,
  campaigns: ['affiliate-portal', 'campaigns'] as const,
  campaignProducts: (campaignId: string) => ['affiliate-portal', 'campaign-products', campaignId] as const,
  orderForms: ['affiliate-portal', 'order-forms'] as const,
  orderFormPackages: (formId: string) => ['affiliate-portal', 'order-form-packages', formId] as const,
  publicForm: (formId: string) => ['public-affiliate-order-form', formId] as const,
}

export function useMyAffiliateProfile() {
  return useQuery({ queryKey: affiliatePortalKeys.profile, queryFn: getMyAffiliateProfile })
}

export function useMyAffiliateDashboard() {
  return useQuery({ queryKey: affiliatePortalKeys.dashboard, queryFn: fetchMyDashboard })
}

export function useMyAvailableCampaigns() {
  return useQuery({ queryKey: affiliatePortalKeys.campaigns, queryFn: fetchMyAvailableCampaigns })
}

export function useCampaignProducts(campaignId: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.campaignProducts(campaignId ?? ''),
    queryFn: () => fetchCampaignProducts(campaignId as string),
    enabled: Boolean(campaignId),
  })
}

export function useMyOrderForms() {
  return useQuery({ queryKey: affiliatePortalKeys.orderForms, queryFn: fetchMyOrderForms })
}

export function useOrderFormPackages(formId: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.orderFormPackages(formId ?? ''),
    queryFn: () => fetchOrderFormPackages(formId as string),
    enabled: Boolean(formId),
  })
}

export function useCreateMyOrderForm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { campaignId: string; productId: string; internalTitle: string; packages: OrderFormPackageInput[] }) =>
      createMyOrderForm(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderForms })
    },
  })
}

export function useUpdateMyOrderForm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { formId: string; internalTitle: string; packages?: OrderFormPackageInput[] | null; status?: 'ACTIVE' | 'ARCHIVED' }) =>
      updateMyOrderForm(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderForms })
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderFormPackages(variables.formId) })
    },
  })
}

export function useArchiveMyOrderForm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { formId: string; internalTitle: string }) => archiveMyOrderForm(input.formId, input.internalTitle),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderForms })
    },
  })
}

export function usePublicAffiliateOrderForm(formId: string | undefined) {
  return useQuery({
    queryKey: affiliatePortalKeys.publicForm(formId ?? ''),
    queryFn: () => fetchPublicOrderForm(formId as string),
    enabled: Boolean(formId),
  })
}

export function useSubmitPublicAffiliateOrder() {
  return useMutation({
    mutationFn: (input: PublicAffiliateOrderInput) => submitPublicAffiliateOrder(input),
  })
}
