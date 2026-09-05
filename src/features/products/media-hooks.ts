import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import { deleteProductImage, fetchProductImages, setPrimaryProductImage, uploadProductImage } from './media-api'

export const productImageKeys = {
  list: (productId: string) => ['product-images', productId] as const,
}

export function useProductImages(productId: string | undefined) {
  return useQuery({
    queryKey: productImageKeys.list(productId ?? ''),
    queryFn: () => fetchProductImages(productId as string),
    enabled: Boolean(productId),
  })
}

export function useUploadProductImage(productId: string) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, makePrimary }: { file: File; makePrimary: boolean }) => {
      if (!activeBrand) throw new Error('Select a brand first')
      if (!user) throw new Error('You must be signed in')
      return uploadProductImage(activeWorkspace.id, activeBrand.id, productId, file, user.id, makePrimary)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productImageKeys.list(productId) }),
  })
}

export function useDeleteProductImage(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteProductImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productImageKeys.list(productId) }),
  })
}

export function useSetPrimaryProductImage(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mediaId: string) => setPrimaryProductImage(productId, mediaId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productImageKeys.list(productId) }),
  })
}
