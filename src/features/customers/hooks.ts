import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'

import {
  addCustomerNote,
  createCustomer,
  fetchCustomer,
  fetchCustomerNotes,
  fetchCustomerOrders,
  fetchCustomers,
  fetchCustomerStats,
  fetchCustomerTimeline,
  updateCustomer,
  type UpdateCustomerFields,
} from './api'
import type { CustomerFormOutput } from './validation'
import type { CustomerFilters } from './types'

export const customerKeys = {
  all: (workspaceId: string, brandId: string) => ['customers', workspaceId, brandId] as const,
  list: (workspaceId: string, brandId: string, filters: CustomerFilters) => ['customers', workspaceId, brandId, filters] as const,
  detail: (id: string) => ['customer', id] as const,
  orders: (id: string) => ['customer-orders', id] as const,
  notes: (id: string) => ['customer-notes', id] as const,
  timeline: (id: string) => ['customer-timeline', id] as const,
  stats: (workspaceId: string, brandId: string) => ['customer-stats', workspaceId, brandId] as const,
}

export function useCustomers(filters: CustomerFilters = {}) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: customerKeys.list(activeWorkspace.id, brandId, filters),
    queryFn: () => fetchCustomers(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
    placeholderData: (prev) => prev,
  })
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: customerKeys.detail(id ?? ''),
    queryFn: () => fetchCustomer(id as string),
    enabled: Boolean(id),
  })
}

export function useCustomerOrders(id: string | undefined) {
  return useQuery({
    queryKey: customerKeys.orders(id ?? ''),
    queryFn: () => fetchCustomerOrders(id as string),
    enabled: Boolean(id),
  })
}

export function useCustomerNotes(id: string | undefined) {
  return useQuery({
    queryKey: customerKeys.notes(id ?? ''),
    queryFn: () => fetchCustomerNotes(id as string),
    enabled: Boolean(id),
  })
}

export function useCustomerTimeline(id: string | undefined) {
  return useQuery({
    queryKey: customerKeys.timeline(id ?? ''),
    queryFn: () => fetchCustomerTimeline(id as string),
    enabled: Boolean(id),
  })
}

export function useCustomerStats() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: customerKeys.stats(activeWorkspace.id, brandId),
    queryFn: () => fetchCustomerStats(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
}

function useInvalidateCustomers() {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: customerKeys.all(activeWorkspace.id, activeBrand?.id ?? '') })
    queryClient.invalidateQueries({ queryKey: customerKeys.stats(activeWorkspace.id, activeBrand?.id ?? '') })
  }
}

export function useCreateCustomer() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const invalidate = useInvalidateCustomers()

  return useMutation({
    mutationFn: (input: CustomerFormOutput) => {
      if (!activeBrand) throw new Error('Select a brand before adding a customer')
      return createCustomer(activeWorkspace.id, activeBrand.id, input)
    },
    onSuccess: invalidate,
  })
}

function useCustomerDetailInvalidate(id: string) {
  const queryClient = useQueryClient()
  const invalidateList = useInvalidateCustomers()
  return () => {
    queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) })
    queryClient.invalidateQueries({ queryKey: customerKeys.timeline(id) })
    invalidateList()
  }
}

export function useUpdateCustomer(id: string) {
  const { user } = useAuth()
  const invalidate = useCustomerDetailInvalidate(id)

  return useMutation({
    mutationFn: (fields: UpdateCustomerFields) => {
      if (!user) throw new Error('You must be signed in')
      return updateCustomer(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useAddCustomerNote(customerId: string) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: string) => {
      if (!activeBrand) throw new Error('Select a brand first')
      if (!user) throw new Error('You must be signed in')
      return addCustomerNote(customerId, activeWorkspace.id, activeBrand.id, body, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.notes(customerId) })
      queryClient.invalidateQueries({ queryKey: customerKeys.timeline(customerId) })
    },
  })
}
