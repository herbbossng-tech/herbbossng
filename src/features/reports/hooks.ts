import { useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'

import { fetchDeliveryReportRows, fetchSalesReportRows, type ReportFilters } from './api'

export function useSalesReportRows(filters: ReportFilters) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: ['sales-report', activeWorkspace.id, brandId, filters],
    queryFn: () => fetchSalesReportRows(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
    placeholderData: (prev) => prev,
  })
}

export function useDeliveryReportRows(filters: ReportFilters) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: ['delivery-report', activeWorkspace.id, brandId, filters],
    queryFn: () => fetchDeliveryReportRows(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
    placeholderData: (prev) => prev,
  })
}
