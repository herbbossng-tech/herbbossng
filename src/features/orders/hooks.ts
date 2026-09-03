import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Order } from '@/types/database'

import {
  addOrderNote,
  assignOrder,
  createOrder,
  fetchOrder,
  fetchOrderDailyStats,
  fetchOrderDeliveryAttempts,
  fetchOrderItems,
  fetchOrderNotes,
  fetchOrders,
  fetchOrderStats,
  fetchOrderStatusTransitions,
  fetchOrderTimeline,
  markOrderPacked,
  recordCashCollection,
  recordDeliveryAttempt,
  setOrderTags,
  transitionOrderStatus,
  updateOrder,
  type UpdateOrderFields,
} from './api'
import type { CreateOrderOutput, StatusChangeFormOutput } from './validation'
import type { OrderFilters } from './types'

export const orderKeys = {
  all: (workspaceId: string, brandId: string) => ['orders', workspaceId, brandId] as const,
  list: (workspaceId: string, brandId: string, filters: OrderFilters) => ['orders', workspaceId, brandId, filters] as const,
  detail: (id: string) => ['order', id] as const,
  items: (id: string) => ['order-items', id] as const,
  timeline: (id: string) => ['order-timeline', id] as const,
  notes: (id: string) => ['order-notes', id] as const,
  stats: (workspaceId: string, brandId: string) => ['order-stats', workspaceId, brandId] as const,
  dailyStats: (workspaceId: string, brandId: string, days: number) => ['order-daily-stats', workspaceId, brandId, days] as const,
  transitions: () => ['order-status-transitions'] as const,
}

export function useOrders(filters: OrderFilters = {}) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: orderKeys.list(activeWorkspace.id, brandId, filters),
    queryFn: () => fetchOrders(activeWorkspace.id, brandId, filters),
    enabled: Boolean(brandId),
    placeholderData: (prev) => prev,
  })
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => fetchOrder(id as string),
    enabled: Boolean(id),
  })
}

export function useOrderItems(orderId: string | undefined) {
  return useQuery({
    queryKey: orderKeys.items(orderId ?? ''),
    queryFn: () => fetchOrderItems(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useOrderTimeline(orderId: string | undefined) {
  return useQuery({
    queryKey: orderKeys.timeline(orderId ?? ''),
    queryFn: () => fetchOrderTimeline(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useOrderNotes(orderId: string | undefined) {
  return useQuery({
    queryKey: orderKeys.notes(orderId ?? ''),
    queryFn: () => fetchOrderNotes(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useOrderStatusTransitions() {
  return useQuery({
    queryKey: orderKeys.transitions(),
    queryFn: fetchOrderStatusTransitions,
    staleTime: Infinity,
  })
}

export function useOrderStats() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: orderKeys.stats(activeWorkspace.id, brandId),
    queryFn: () => fetchOrderStats(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
}

export function useOrderDailyStats(days = 7) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''

  return useQuery({
    queryKey: orderKeys.dailyStats(activeWorkspace.id, brandId, days),
    queryFn: () => fetchOrderDailyStats(activeWorkspace.id, brandId, days),
    enabled: Boolean(brandId),
  })
}

function useInvalidateOrders() {
  const queryClient = useQueryClient()
  const { activeWorkspace, activeBrand } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: orderKeys.all(activeWorkspace.id, activeBrand?.id ?? '') })
    queryClient.invalidateQueries({ queryKey: orderKeys.stats(activeWorkspace.id, activeBrand?.id ?? '') })
  }
}

export function useCreateOrder() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const invalidate = useInvalidateOrders()

  return useMutation({
    mutationFn: (input: CreateOrderOutput) => {
      if (!activeBrand) throw new Error('Select a brand before creating an order')
      return createOrder(activeWorkspace.id, activeBrand.id, input)
    },
    onSuccess: invalidate,
  })
}

function useOrderDetailInvalidate(id: string) {
  const queryClient = useQueryClient()
  const invalidateList = useInvalidateOrders()
  return (order?: Order) => {
    if (order) queryClient.setQueryData(orderKeys.detail(id), order)
    queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) })
    queryClient.invalidateQueries({ queryKey: orderKeys.timeline(id) })
    invalidateList()
  }
}

export function useUpdateOrder(id: string) {
  const { user } = useAuth()
  const invalidate = useOrderDetailInvalidate(id)

  return useMutation({
    mutationFn: (fields: UpdateOrderFields) => {
      if (!user) throw new Error('You must be signed in')
      return updateOrder(id, fields, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useTransitionOrderStatus(id: string) {
  const { user } = useAuth()
  const invalidate = useOrderDetailInvalidate(id)

  return useMutation({
    mutationFn: (input: StatusChangeFormOutput & { status: string }) => {
      if (!user) throw new Error('You must be signed in')
      return transitionOrderStatus(id, input, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useAddOrderNote(orderId: string) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: string) => {
      if (!activeBrand) throw new Error('Select a brand first')
      if (!user) throw new Error('You must be signed in')
      return addOrderNote(orderId, activeWorkspace.id, activeBrand.id, body, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.notes(orderId) })
      queryClient.invalidateQueries({ queryKey: orderKeys.timeline(orderId) })
    },
  })
}

export function useSetOrderTags(id: string) {
  const { user } = useAuth()
  const invalidate = useOrderDetailInvalidate(id)

  return useMutation({
    mutationFn: (tags: string[]) => {
      if (!user) throw new Error('You must be signed in')
      return setOrderTags(id, tags, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useAssignOrder(id: string) {
  const { user } = useAuth()
  const invalidate = useOrderDetailInvalidate(id)

  return useMutation({
    mutationFn: (assignedTo: string | null) => {
      if (!user) throw new Error('You must be signed in')
      return assignOrder(id, assignedTo, user.id)
    },
    onSuccess: invalidate,
  })
}

export function useOrderDeliveryAttempts(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-delivery-attempts', orderId ?? ''],
    queryFn: () => fetchOrderDeliveryAttempts(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useRecordDeliveryAttempt(id: string) {
  const invalidate = useOrderDetailInvalidate(id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { result: string; waybillId?: string | null; deliveryPartnerId?: string | null; failureReason?: string | null; notes?: string | null }) =>
      recordDeliveryAttempt(id, input.result, input.waybillId, input.deliveryPartnerId, input.failureReason, input.notes),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['order-delivery-attempts', id] })
    },
  })
}

export function useMarkOrderPacked(id: string) {
  const invalidate = useOrderDetailInvalidate(id)
  return useMutation({
    mutationFn: () => markOrderPacked(id),
    onSuccess: invalidate,
  })
}

export function useRecordCashCollection(id: string) {
  const invalidate = useOrderDetailInvalidate(id)
  return useMutation({
    mutationFn: (input: { amount: number; note?: string | null }) => recordCashCollection(id, input.amount, input.note),
    onSuccess: invalidate,
  })
}
