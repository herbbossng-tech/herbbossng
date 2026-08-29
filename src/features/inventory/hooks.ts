import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import { productKeys } from '@/features/products/hooks'

import { adjustInventory, fetchInventorySummary, fetchInventoryTransactions, fetchLowStockProducts } from './api'

export const inventoryKeys = {
  transactions: (workspaceId: string, brandId: string) => ['inventory-transactions', workspaceId, brandId] as const,
  lowStock: (workspaceId: string, brandId: string) => ['inventory-low-stock', workspaceId, brandId] as const,
  summary: (workspaceId: string, brandId: string) => ['inventory-summary', workspaceId, brandId] as const,
}

export function useInventoryTransactions() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: inventoryKeys.transactions(activeWorkspace.id, brandId),
    queryFn: () => fetchInventoryTransactions(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
}

export function useLowStockProducts() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: inventoryKeys.lowStock(activeWorkspace.id, brandId),
    queryFn: () => fetchLowStockProducts(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
}

export function useInventorySummary() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: inventoryKeys.summary(activeWorkspace.id, brandId),
    queryFn: () => fetchInventorySummary(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
}

export function useAdjustInventory() {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useMutation({
    mutationFn: adjustInventory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.transactions(activeWorkspace.id, brandId) })
      queryClient.invalidateQueries({ queryKey: inventoryKeys.lowStock(activeWorkspace.id, brandId) })
      queryClient.invalidateQueries({ queryKey: inventoryKeys.summary(activeWorkspace.id, brandId) })
      queryClient.invalidateQueries({ queryKey: productKeys.all(activeWorkspace.id, brandId) })
    },
  })
}
