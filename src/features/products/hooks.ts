import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Product } from '@/types/database'

import { archiveProduct, createProduct, duplicateProduct, fetchProduct, fetchProducts, updateProduct } from './api'
import type { ProductFilters, ProductFormValues } from './types'

export const productKeys = {
  all: (workspaceId: string, brandId: string) => ['products', workspaceId, brandId] as const,
  list: (workspaceId: string, brandId: string, filters: ProductFilters) =>
    ['products', workspaceId, brandId, filters] as const,
  detail: (id: string) => ['product', id] as const,
}

export function useProducts(filters: ProductFilters = {}) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: productKeys.list(activeWorkspace.id, brandId, filters),
    queryFn: () => fetchProducts(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
  })
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id ?? ''),
    queryFn: () => fetchProduct(id as string),
    enabled: Boolean(id),
  })
}

function useInvalidateProducts() {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  return () => queryClient.invalidateQueries({ queryKey: productKeys.all(activeWorkspace.id, activeBrand?.id ?? '') })
}

export function useCreateProduct() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateProducts()

  return useMutation({
    mutationFn: (values: ProductFormValues) => {
      if (!activeBrand) throw new Error('Select a brand before creating a product')
      if (!user) throw new Error('You must be signed in')
      return createProduct(activeWorkspace.id, activeBrand.id, values, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateProduct(id: string) {
  const { user } = useAuth()
  const invalidate = useInvalidateProducts()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (values: ProductFormValues) => {
      if (!user) throw new Error('You must be signed in')
      return updateProduct(id, values, user.id)
    },
    onSuccess: (product: Product) => {
      queryClient.setQueryData(productKeys.detail(id), product)
      invalidate()
    },
  })
}

export function useArchiveProduct() {
  const { user } = useAuth()
  const invalidate = useInvalidateProducts()

  return useMutation({
    mutationFn: (id: string) => {
      if (!user) throw new Error('You must be signed in')
      return archiveProduct(id, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useDuplicateProduct() {
  const { user } = useAuth()
  const invalidate = useInvalidateProducts()

  return useMutation({
    mutationFn: (product: Product) => {
      if (!user) throw new Error('You must be signed in')
      return duplicateProduct(product, user.id)
    },
    onSuccess: invalidate,
  })
}
