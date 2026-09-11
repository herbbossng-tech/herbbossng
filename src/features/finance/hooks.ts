import { useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { TrendGranularity } from '@/types/database'

import {
  fetchCustomerAnalytics,
  fetchDeliveryFunnelStats,
  fetchFinanceSummary,
  fetchFinanceTransactions,
  fetchLandingPageAnalytics,
  fetchOrderStatusValueBreakdown,
  fetchProductPerformance,
  fetchRevenueTrend,
  type FinanceDateRange,
} from './api'

export const financeKeys = {
  summary: (ws: string, brand: string, r: FinanceDateRange) => ['finance-summary', ws, brand, r] as const,
  statusBreakdown: (ws: string, brand: string, r: FinanceDateRange) => ['finance-status-breakdown', ws, brand, r] as const,
  funnel: (ws: string, brand: string, r: FinanceDateRange) => ['finance-funnel', ws, brand, r] as const,
  trend: (ws: string, brand: string, r: FinanceDateRange, g: TrendGranularity) => ['finance-trend', ws, brand, r, g] as const,
  productPerformance: (ws: string, brand: string, r: FinanceDateRange) => ['finance-product-performance', ws, brand, r] as const,
  customerAnalytics: (ws: string, brand: string, r: FinanceDateRange) => ['finance-customer-analytics', ws, brand, r] as const,
  landingPageAnalytics: (ws: string, brand: string, r: FinanceDateRange) => ['finance-landing-page-analytics', ws, brand, r] as const,
  transactions: (ws: string, brand: string, r: FinanceDateRange, page: number) => ['finance-transactions', ws, brand, r, page] as const,
}

function useScoped() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  return { workspaceId: activeWorkspace.id, brandId: activeBrand?.id ?? '' }
}

export function useFinanceSummary(range: FinanceDateRange) {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.summary(workspaceId, brandId, range),
    queryFn: () => fetchFinanceSummary(workspaceId, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useOrderStatusValueBreakdown(range: FinanceDateRange) {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.statusBreakdown(workspaceId, brandId, range),
    queryFn: () => fetchOrderStatusValueBreakdown(workspaceId, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useDeliveryFunnelStats(range: FinanceDateRange) {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.funnel(workspaceId, brandId, range),
    queryFn: () => fetchDeliveryFunnelStats(workspaceId, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useRevenueTrend(range: FinanceDateRange, granularity: TrendGranularity = 'day') {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.trend(workspaceId, brandId, range, granularity),
    queryFn: () => fetchRevenueTrend(workspaceId, brandId, range, granularity),
    enabled: Boolean(brandId),
  })
}

export function useProductPerformance(range: FinanceDateRange) {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.productPerformance(workspaceId, brandId, range),
    queryFn: () => fetchProductPerformance(workspaceId, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useCustomerAnalytics(range: FinanceDateRange) {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.customerAnalytics(workspaceId, brandId, range),
    queryFn: () => fetchCustomerAnalytics(workspaceId, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useLandingPageAnalytics(range: FinanceDateRange) {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.landingPageAnalytics(workspaceId, brandId, range),
    queryFn: () => fetchLandingPageAnalytics(workspaceId, brandId, range),
    enabled: Boolean(brandId),
  })
}

export function useFinanceTransactions(range: FinanceDateRange, page = 1) {
  const { workspaceId, brandId } = useScoped()
  return useQuery({
    queryKey: financeKeys.transactions(workspaceId, brandId, range, page),
    queryFn: () => fetchFinanceTransactions(workspaceId, brandId, range, page),
    enabled: Boolean(brandId),
    placeholderData: (prev) => prev,
  })
}
