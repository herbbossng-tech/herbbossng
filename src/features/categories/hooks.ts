import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { type CategoryFormValues, createCategory, deleteCategory, fetchCategories, updateCategory } from './api'

export const categoryKeys = {
  list: (workspaceId: string, brandId: string) => ['categories', workspaceId, brandId] as const,
}

export function useCategories() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: categoryKeys.list(activeWorkspace.id, brandId),
    queryFn: () => fetchCategories(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
}

function useInvalidateCategories() {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  return () => queryClient.invalidateQueries({ queryKey: categoryKeys.list(activeWorkspace.id, activeBrand?.id ?? '') })
}

export function useCreateCategory() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateCategories()

  return useMutation({
    mutationFn: (values: CategoryFormValues) => {
      if (!activeBrand) throw new Error('Select a brand before creating a category')
      if (!user) throw new Error('You must be signed in')
      return createCategory(activeWorkspace.id, activeBrand.id, values, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateCategory(id: string) {
  const { user } = useAuth()
  const invalidate = useInvalidateCategories()

  return useMutation({
    mutationFn: (values: CategoryFormValues) => {
      if (!user) throw new Error('You must be signed in')
      return updateCategory(id, values, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: invalidate,
  })
}
