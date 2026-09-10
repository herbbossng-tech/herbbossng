import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  archiveMyOrderForm,
  createMyOrderForm,
  fetchCampaign,
  fetchCampaignAssets,
  fetchCampaignProducts,
  fetchMyAffiliateOrders,
  fetchMyAvailableCampaigns,
  fetchMyDashboard,
  fetchMyOrderFormSubmissions,
  fetchMyOrderFormsWithStats,
  fetchOrderFormAddons,
  fetchOrderFormPackages,
  fetchPublicOrderForm,
  getMyAffiliateProfile,
  recordPublicOrderFormView,
  submitPublicAffiliateOrder,
  updateMyOrderForm,
  type OrderFormAddonInput,
  type OrderFormPackageInput,
  type PublicAffiliateOrderInput,
} from './api'

export const affiliatePortalKeys = {
  profile: ['affiliate-portal', 'profile'] as const,
  dashboard: (dateFrom?: string | null, dateTo?: string | null) => ['affiliate-portal', 'dashboard', dateFrom ?? null, dateTo ?? null] as const,
  campaigns: ['affiliate-portal', 'campaigns'] as const,
  campaign: (campaignId: string) => ['affiliate-portal', 'campaign', campaignId] as const,
  campaignAssets: (campaignId: string) => ['affiliate-portal', 'campaign-assets', campaignId] as const,
  campaignProducts: (campaignId: string) => ['affiliate-portal', 'campaign-products', campaignId] as const,
  orderForms: ['affiliate-portal', 'order-forms'] as const,
  orderFormPackages: (formId: string) => ['affiliate-portal', 'order-form-packages', formId] as const,
  orderFormAddons: (formId: string) => ['affiliate-portal', 'order-form-addons', formId] as const,
  orderFormSubmissions: (formId: string) => ['affiliate-portal', 'order-form-submissions', formId] as const,
  myOrders: (status?: string | null) => ['affiliate-portal', 'my-orders', status ?? null] as const,
  publicForm: (formId: string) => ['public-affiliate-order-form', formId] as const,
}

export function useMyAffiliateProfile() {
  return useQuery({ queryKey: affiliatePortalKeys.profile, queryFn: getMyAffiliateProfile })
}

export function useMyAffiliateDashboard(dateFrom?: string | null, dateTo?: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.dashboard(dateFrom, dateTo),
    queryFn: () => fetchMyDashboard(dateFrom, dateTo),
  })
}

export function useMyAvailableCampaigns() {
  return useQuery({ queryKey: affiliatePortalKeys.campaigns, queryFn: fetchMyAvailableCampaigns })
}

export function useCampaign(campaignId: string | undefined) {
  return useQuery({
    queryKey: affiliatePortalKeys.campaign(campaignId ?? ''),
    queryFn: () => fetchCampaign(campaignId as string),
    enabled: Boolean(campaignId),
  })
}

export function useCampaignAssets(campaignId: string | undefined) {
  return useQuery({
    queryKey: affiliatePortalKeys.campaignAssets(campaignId ?? ''),
    queryFn: () => fetchCampaignAssets(campaignId as string),
    enabled: Boolean(campaignId),
  })
}

export function useCampaignProducts(campaignId: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.campaignProducts(campaignId ?? ''),
    queryFn: () => fetchCampaignProducts(campaignId as string),
    enabled: Boolean(campaignId),
  })
}

export function useMyOrderForms() {
  return useQuery({ queryKey: affiliatePortalKeys.orderForms, queryFn: fetchMyOrderFormsWithStats })
}

export function useOrderFormPackages(formId: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.orderFormPackages(formId ?? ''),
    queryFn: () => fetchOrderFormPackages(formId as string),
    enabled: Boolean(formId),
  })
}

export function useOrderFormAddons(formId: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.orderFormAddons(formId ?? ''),
    queryFn: () => fetchOrderFormAddons(formId as string),
    enabled: Boolean(formId),
  })
}

export function useOrderFormSubmissions(formId: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.orderFormSubmissions(formId ?? ''),
    queryFn: () => fetchMyOrderFormSubmissions(formId as string),
    enabled: Boolean(formId),
  })
}

export function useMyAffiliateOrders(status?: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.myOrders(status),
    queryFn: () => fetchMyAffiliateOrders(status ?? null),
  })
}

export function useCreateMyOrderForm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      campaignId: string
      productId: string
      internalTitle: string
      packages: OrderFormPackageInput[]
      addons?: OrderFormAddonInput[]
    }) => createMyOrderForm(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderForms })
    },
  })
}

export function useUpdateMyOrderForm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      formId: string
      internalTitle: string
      packages?: OrderFormPackageInput[] | null
      addons?: OrderFormAddonInput[] | null
      status?: 'ACTIVE' | 'ARCHIVED'
    }) => updateMyOrderForm(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderForms })
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderFormPackages(variables.formId) })
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.orderFormAddons(variables.formId) })
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

export function useRecordPublicOrderFormView() {
  return useMutation({ mutationFn: (formId: string) => recordPublicOrderFormView(formId) })
}

export function useSubmitPublicAffiliateOrder() {
  return useMutation({
    mutationFn: (input: PublicAffiliateOrderInput) => submitPublicAffiliateOrder(input),
  })
}
