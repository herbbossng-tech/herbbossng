import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { LandingPage, LandingPageSectionType } from '@/types/database'

import {
  archiveLandingPage,
  createLandingPage,
  createPackage,
  createSection,
  deleteLandingPage,
  deletePackage,
  deleteSection,
  duplicateLandingPage,
  duplicateSection,
  fetchLandingPage,
  fetchLandingPagePackages,
  fetchLandingPages,
  fetchLandingPageSections,
  publishLandingPage,
  reorderPackages,
  reorderSections,
  togglePackageEnabled,
  unpublishLandingPage,
  updateLandingPage,
  updatePackage,
  updateSection,
  type UpdateLandingPageFields,
} from './api'
import type { LandingPageFilters } from './types'
import type { LandingPageFormOutput, PackageFormOutput } from './validation'

export const landingPageKeys = {
  all: (workspaceId: string, brandId: string) => ['landing-pages', workspaceId, brandId] as const,
  list: (workspaceId: string, brandId: string, filters: LandingPageFilters) => ['landing-pages', workspaceId, brandId, filters] as const,
  detail: (id: string) => ['landing-page', id] as const,
  sections: (id: string) => ['landing-page-sections', id] as const,
  packages: (id: string) => ['landing-page-packages', id] as const,
}

export function useLandingPages(filters: LandingPageFilters = {}) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  return useQuery({
    queryKey: landingPageKeys.list(activeWorkspace.id, brandId, filters),
    queryFn: () => fetchLandingPages(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
    placeholderData: (prev) => prev,
  })
}

export function useLandingPage(id: string | undefined) {
  return useQuery({
    queryKey: landingPageKeys.detail(id ?? ''),
    queryFn: () => fetchLandingPage(id as string),
    enabled: Boolean(id),
  })
}

export function useLandingPageSections(id: string | undefined) {
  return useQuery({
    queryKey: landingPageKeys.sections(id ?? ''),
    queryFn: () => fetchLandingPageSections(id as string),
    enabled: Boolean(id),
  })
}

export function useLandingPagePackages(id: string | undefined) {
  return useQuery({
    queryKey: landingPageKeys.packages(id ?? ''),
    queryFn: () => fetchLandingPagePackages(id as string),
    enabled: Boolean(id),
  })
}

function useInvalidateLandingPages() {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  return () => queryClient.invalidateQueries({ queryKey: landingPageKeys.all(activeWorkspace.id, activeBrand?.id ?? '') })
}

export function useCreateLandingPage() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const invalidate = useInvalidateLandingPages()
  return useMutation({
    mutationFn: (input: LandingPageFormOutput) => {
      if (!activeBrand) throw new Error('Select a brand before creating a landing page')
      if (!user) throw new Error('You must be signed in')
      return createLandingPage(activeWorkspace.id, activeBrand.id, input, user.id)
    },
    onSuccess: invalidate,
  })
}

function useDetailInvalidate(id: string) {
  const queryClient = useQueryClient()
  const invalidateList = useInvalidateLandingPages()
  return (page?: LandingPage) => {
    if (page) queryClient.setQueryData(landingPageKeys.detail(id), page)
    queryClient.invalidateQueries({ queryKey: landingPageKeys.detail(id) })
    invalidateList()
  }
}

export function useUpdateLandingPage(id: string) {
  const { user } = useAuth()
  const invalidate = useDetailInvalidate(id)
  return useMutation({
    mutationFn: (fields: UpdateLandingPageFields) => {
      if (!user) throw new Error('You must be signed in')
      return updateLandingPage(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function usePublishLandingPage(id: string) {
  const { user } = useAuth()
  const invalidate = useDetailInvalidate(id)
  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error('You must be signed in')
      return publishLandingPage(id, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useUnpublishLandingPage(id: string) {
  const { user } = useAuth()
  const invalidate = useDetailInvalidate(id)
  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error('You must be signed in')
      return unpublishLandingPage(id, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useArchiveLandingPage(id: string) {
  const { user } = useAuth()
  const invalidate = useDetailInvalidate(id)
  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error('You must be signed in')
      return archiveLandingPage(id, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteLandingPage() {
  const invalidate = useInvalidateLandingPages()
  return useMutation({ mutationFn: deleteLandingPage, onSuccess: invalidate })
}

export function useDuplicateLandingPage() {
  const { user } = useAuth()
  const invalidate = useInvalidateLandingPages()
  return useMutation({
    mutationFn: (page: LandingPage) => {
      if (!user) throw new Error('You must be signed in')
      return duplicateLandingPage(page, user.id)
    },
    onSuccess: invalidate,
  })
}

// --- Sections ---

export function useCreateSection(landingPageId: string) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, position }: { type: LandingPageSectionType; position: number }) => {
      if (!activeBrand) throw new Error('Select a brand first')
      return createSection(landingPageId, activeWorkspace.id, activeBrand.id, type, position)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.sections(landingPageId) }),
  })
}

export function useUpdateSection(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string; config?: unknown; enabled?: boolean; position?: number }) =>
      updateSection(id, fields as Parameters<typeof updateSection>[1]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.sections(landingPageId) }),
  })
}

export function useDeleteSection(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteSection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.sections(landingPageId) }),
  })
}

export function useDuplicateSection(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: duplicateSection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.sections(landingPageId) }),
  })
}

export function useReorderSections(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: reorderSections,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.sections(landingPageId) }),
  })
}

// --- Packages ---

export function useCreatePackage(landingPageId: string) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, position }: { input: PackageFormOutput; position: number }) => {
      if (!activeBrand) throw new Error('Select a brand first')
      return createPackage(landingPageId, activeWorkspace.id, activeBrand.id, input, position)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.packages(landingPageId) }),
  })
}

export function useUpdatePackage(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PackageFormOutput }) => updatePackage(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.packages(landingPageId) }),
  })
}

export function useDeletePackage(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deletePackage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.packages(landingPageId) }),
  })
}

export function useTogglePackageEnabled(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => togglePackageEnabled(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.packages(landingPageId) }),
  })
}

export function useReorderPackages(landingPageId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: reorderPackages,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landingPageKeys.packages(landingPageId) }),
  })
}
