import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AffiliateOfferType } from '@/types/database'

import {
  archiveMyOrderForm,
  createManualOrder,
  createMyBankAccount,
  createMyOffer,
  createMyOrderForm,
  deleteMyBankAccount,
  fetchCampaign,
  fetchCampaignAssets,
  fetchCampaignProducts,
  fetchMyAdCosts,
  fetchMyAffiliateOrders,
  fetchMyAvailableCampaigns,
  fetchMyBankAccounts,
  fetchMyDashboard,
  fetchMyOffers,
  fetchMyOrderFormSubmissions,
  fetchMyOrderFormsWithStats,
  fetchMyWalletSummary,
  fetchMyWalletTransactions,
  fetchMyWithdrawals,
  fetchOfferLinkedFormIds,
  fetchOrderFormAddons,
  fetchOrderFormPackages,
  fetchPublicOrderForm,
  getMyAffiliateProfile,
  recordPublicOrderFormView,
  requestMyWithdrawal,
  setMyDefaultBankAccount,
  submitMyAdCost,
  submitPublicAffiliateOrder,
  updateMyOffer,
  updateMyOrderForm,
  type ManualOrderInput,
  type OfferInput,
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
  bankAccounts: ['affiliate-portal', 'bank-accounts'] as const,
  walletSummary: ['affiliate-portal', 'wallet-summary'] as const,
  withdrawals: ['affiliate-portal', 'withdrawals'] as const,
  walletTransactions: ['affiliate-portal', 'wallet-transactions'] as const,
  adCosts: (status?: string | null) => ['affiliate-portal', 'ad-costs', status ?? null] as const,
  offers: (offerType?: AffiliateOfferType | null) => ['affiliate-portal', 'offers', offerType ?? null] as const,
  offerLinkedForms: (offerId: string) => ['affiliate-portal', 'offer-linked-forms', offerId] as const,
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

// ---- Bank accounts ----

export function useMyBankAccounts() {
  return useQuery({ queryKey: affiliatePortalKeys.bankAccounts, queryFn: fetchMyBankAccounts })
}

export function useCreateMyBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { bankName: string; accountNumber: string; accountName: string }) => createMyBankAccount(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.bankAccounts }),
  })
}

export function useDeleteMyBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => deleteMyBankAccount(accountId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.bankAccounts }),
  })
}

export function useSetMyDefaultBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => setMyDefaultBankAccount(accountId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.bankAccounts }),
  })
}

// ---- Withdrawals / wallet transactions ----

export function useMyWalletSummary() {
  return useQuery({ queryKey: affiliatePortalKeys.walletSummary, queryFn: fetchMyWalletSummary })
}

export function useMyWithdrawals() {
  return useQuery({ queryKey: affiliatePortalKeys.withdrawals, queryFn: () => fetchMyWithdrawals() })
}

export function useMyWalletTransactions() {
  return useQuery({ queryKey: affiliatePortalKeys.walletTransactions, queryFn: () => fetchMyWalletTransactions() })
}

export function useRequestMyWithdrawal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { amount: number; bankAccountId: string; note?: string }) =>
      requestMyWithdrawal(input.amount, input.bankAccountId, input.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.withdrawals })
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.walletTransactions })
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.walletSummary })
      void queryClient.invalidateQueries({ queryKey: affiliatePortalKeys.dashboard() })
    },
  })
}

// ---- Ad costs ----

export function useMyAdCosts(status?: string | null) {
  return useQuery({ queryKey: affiliatePortalKeys.adCosts(status), queryFn: () => fetchMyAdCosts(status ?? null) })
}

export function useSubmitMyAdCost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { campaignId: string; periodStart: string; periodEnd: string; costAmount: number; ordersCount: number; notes?: string }) =>
      submitMyAdCost(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['affiliate-portal', 'ad-costs'] }),
  })
}

// ---- Manual order entry ----

export function useCreateManualOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ManualOrderInput) => createManualOrder(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['affiliate-portal', 'my-orders'] }),
  })
}

// ---- Offers ----

export function useMyOffers(offerType?: AffiliateOfferType | null) {
  return useQuery({ queryKey: affiliatePortalKeys.offers(offerType), queryFn: () => fetchMyOffers(offerType ?? null) })
}

export function useOfferLinkedFormIds(offerId: string | null) {
  return useQuery({
    queryKey: affiliatePortalKeys.offerLinkedForms(offerId ?? ''),
    queryFn: () => fetchOfferLinkedFormIds(offerId as string),
    enabled: Boolean(offerId),
  })
}

export function useCreateMyOffer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OfferInput) => createMyOffer(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['affiliate-portal', 'offers'] }),
  })
}

export function useUpdateMyOffer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { offerId: string } & Omit<OfferInput, 'offerType' | 'productId'> & { status?: 'ACTIVE' | 'PAUSED' }) =>
      updateMyOffer(input.offerId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['affiliate-portal', 'offers'] }),
  })
}
