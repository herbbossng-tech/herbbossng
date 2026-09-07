import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  cancelTenantSubscription,
  fetchActiveCryptoConfigs,
  fetchActivePaymentMethods,
  fetchAllCryptoConfigs,
  fetchAllPaymentMethods,
  fetchAllPlans,
  fetchAllTenantSubscriptions,
  fetchPendingPayments,
  fetchPlatformSetting,
  fetchPublicPlans,
  fetchWorkspaceEntitlements,
  fetchWorkspacePayments,
  fetchWorkspaceSubscription,
  reviewTenantPayment,
  setCryptoPaymentConfig,
  setPaymentMethodConfig,
  setPlanActive,
  setPlatformSetting,
  submitTenantPayment,
  subscribeToPlan,
  upsertSubscriptionPlan,
  type PlanFormFields,
  type SubmitPaymentInput,
} from './api'

const billingKeys = {
  plans: ['billing-plans'] as const,
  allPlans: ['billing-plans-admin'] as const,
  paymentMethods: ['billing-payment-methods'] as const,
  allPaymentMethods: ['billing-payment-methods-admin'] as const,
  cryptoConfigs: ['billing-crypto-configs'] as const,
  allCryptoConfigs: ['billing-crypto-configs-admin'] as const,
  subscription: (workspaceId: string) => ['billing-subscription', workspaceId] as const,
  payments: (workspaceId: string) => ['billing-payments', workspaceId] as const,
  entitlements: (workspaceId: string) => ['billing-entitlements', workspaceId] as const,
  pendingPayments: ['billing-pending-payments'] as const,
  allSubscriptions: ['billing-all-subscriptions'] as const,
  platformSetting: (key: string) => ['platform-setting', key] as const,
}

export function useIsPlatformAdmin() {
  const { profile } = useAuth()
  return profile?.is_platform_admin ?? false
}

export function usePublicPlans() {
  return useQuery({ queryKey: billingKeys.plans, queryFn: fetchPublicPlans })
}

export function useActivePaymentMethods() {
  return useQuery({ queryKey: billingKeys.paymentMethods, queryFn: fetchActivePaymentMethods })
}

export function useActiveCryptoConfigs() {
  return useQuery({ queryKey: billingKeys.cryptoConfigs, queryFn: fetchActiveCryptoConfigs })
}

export function useWorkspaceSubscription() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: billingKeys.subscription(activeWorkspace.id),
    queryFn: () => fetchWorkspaceSubscription(activeWorkspace.id),
  })
}

export function useWorkspacePayments() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: billingKeys.payments(activeWorkspace.id),
    queryFn: () => fetchWorkspacePayments(activeWorkspace.id),
  })
}

export function useWorkspaceEntitlements() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: billingKeys.entitlements(activeWorkspace.id),
    queryFn: () => fetchWorkspaceEntitlements(activeWorkspace.id),
  })
}

function useInvalidateBilling() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: billingKeys.subscription(activeWorkspace.id) })
    queryClient.invalidateQueries({ queryKey: billingKeys.payments(activeWorkspace.id) })
    queryClient.invalidateQueries({ queryKey: billingKeys.entitlements(activeWorkspace.id) })
    queryClient.invalidateQueries({ queryKey: billingKeys.pendingPayments })
    queryClient.invalidateQueries({ queryKey: billingKeys.allSubscriptions })
  }
}

export function useSubscribeToPlan() {
  const { activeWorkspace } = useWorkspace()
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (vars: { planId: string; billingInterval: 'monthly' | 'annual' }) =>
      subscribeToPlan(activeWorkspace.id, vars.planId, vars.billingInterval),
    onSuccess: invalidate,
  })
}

export function useSubmitTenantPayment() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (input: SubmitPaymentInput) => submitTenantPayment(input),
    onSuccess: invalidate,
  })
}

export function useCancelSubscription() {
  const { activeWorkspace } = useWorkspace()
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: (reason?: string) => cancelTenantSubscription(activeWorkspace.id, reason),
    onSuccess: invalidate,
  })
}

// ---------- Platform admin ----------

export function useAllPlans() {
  return useQuery({ queryKey: billingKeys.allPlans, queryFn: fetchAllPlans })
}

export function useAllPaymentMethods() {
  return useQuery({ queryKey: billingKeys.allPaymentMethods, queryFn: fetchAllPaymentMethods })
}

export function useAllCryptoConfigs() {
  return useQuery({ queryKey: billingKeys.allCryptoConfigs, queryFn: fetchAllCryptoConfigs })
}

export function usePendingPayments() {
  return useQuery({ queryKey: billingKeys.pendingPayments, queryFn: fetchPendingPayments })
}

export function useAllTenantSubscriptions() {
  return useQuery({ queryKey: billingKeys.allSubscriptions, queryFn: fetchAllTenantSubscriptions })
}

function useInvalidatePlatformAdmin() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: billingKeys.plans })
    queryClient.invalidateQueries({ queryKey: billingKeys.allPlans })
    queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods })
    queryClient.invalidateQueries({ queryKey: billingKeys.allPaymentMethods })
    queryClient.invalidateQueries({ queryKey: billingKeys.cryptoConfigs })
    queryClient.invalidateQueries({ queryKey: billingKeys.allCryptoConfigs })
    queryClient.invalidateQueries({ queryKey: billingKeys.pendingPayments })
    queryClient.invalidateQueries({ queryKey: billingKeys.allSubscriptions })
  }
}

export function useUpsertPlan() {
  const invalidate = useInvalidatePlatformAdmin()
  return useMutation({ mutationFn: (fields: PlanFormFields) => upsertSubscriptionPlan(fields), onSuccess: invalidate })
}

export function useSetPlanActive() {
  const invalidate = useInvalidatePlatformAdmin()
  return useMutation({ mutationFn: (vars: { id: string; isActive: boolean }) => setPlanActive(vars.id, vars.isActive), onSuccess: invalidate })
}

export function useSetPaymentMethodConfig() {
  const invalidate = useInvalidatePlatformAdmin()
  return useMutation({ mutationFn: setPaymentMethodConfig, onSuccess: invalidate })
}

export function useSetCryptoPaymentConfig() {
  const invalidate = useInvalidatePlatformAdmin()
  return useMutation({ mutationFn: setCryptoPaymentConfig, onSuccess: invalidate })
}

export function useReviewTenantPayment() {
  const invalidate = useInvalidatePlatformAdmin()
  return useMutation({
    mutationFn: (vars: { paymentId: string; decision: 'approve' | 'reject'; reason?: string }) =>
      reviewTenantPayment(vars.paymentId, vars.decision, vars.reason),
    onSuccess: invalidate,
  })
}

// ---------- Platform settings (homepage config) ----------

export function usePlatformSetting(key: string) {
  return useQuery({ queryKey: billingKeys.platformSetting(key), queryFn: () => fetchPlatformSetting(key) })
}

export function useSetPlatformSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { key: string; value: Record<string, unknown> }) => setPlatformSetting(vars.key, vars.value),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.platformSetting(vars.key) })
    },
  })
}
