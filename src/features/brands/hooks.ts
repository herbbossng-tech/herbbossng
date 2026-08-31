import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { createBrand, fetchBrand, fetchBrands, setBrandStatus, updateBrand, type BrandFilters, type BrandFormFields } from './api'

export const brandKeys = {
  list: (workspaceId: string, filters: BrandFilters) => ['brands-admin', workspaceId, filters] as const,
  detail: (id: string) => ['brand-admin', id] as const,
}

export function useBrandsList(filters: BrandFilters = {}) {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: brandKeys.list(activeWorkspace.id, filters),
    queryFn: () => fetchBrands(activeWorkspace.id, filters),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useBrand(id: string | undefined) {
  return useQuery({
    queryKey: brandKeys.detail(id ?? ''),
    queryFn: () => fetchBrand(id as string),
    enabled: Boolean(id),
  })
}

function useInvalidateBrands() {
  const queryClient = useQueryClient()
  const { activeWorkspace, refetchWorkspaces } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['brands-admin', activeWorkspace.id] })
    refetchWorkspaces()
  }
}

export function useCreateBrand() {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateBrands()
  return useMutation({
    mutationFn: (fields: BrandFormFields) => {
      if (!user) throw new Error('You must be signed in')
      return createBrand(activeWorkspace.id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateBrand(id: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateBrands()
  return useMutation({
    mutationFn: (fields: Partial<BrandFormFields> & { logo_url?: string | null }) => {
      if (!user) throw new Error('You must be signed in')
      return updateBrand(id, fields, user.id)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(brandKeys.detail(id), data)
      invalidate()
    },
  })
}

export function useSetBrandStatus() {
  const { user } = useAuth()
  const invalidate = useInvalidateBrands()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) => {
      if (!user) throw new Error('You must be signed in')
      return setBrandStatus(id, status, user.id)
    },
    onSuccess: invalidate,
  })
}
