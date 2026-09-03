import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { OrderTaskType, TaskPriority } from '@/types/database'

import { assignOrderTask, createOrderTask, fetchOrderTasks, fetchTasks, fetchTaskStats, updateOrderTaskStatus, type TaskFilters } from './api'

export function useTasks(filters: TaskFilters = {}) {
  const { activeWorkspace } = useWorkspace()
  const { user } = useAuth()
  return useQuery({
    queryKey: ['order-tasks', activeWorkspace.id, filters, user?.id],
    queryFn: () => fetchTasks(activeWorkspace.id, { ...filters, currentUserId: user?.id }),
    enabled: Boolean(activeWorkspace.id),
  })
}

export function useOrderTasks(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-tasks-for-order', orderId ?? ''],
    queryFn: () => fetchOrderTasks(orderId as string),
    enabled: Boolean(orderId),
  })
}

export function useTaskStats() {
  const { activeWorkspace } = useWorkspace()
  return useQuery({
    queryKey: ['task-stats', activeWorkspace.id],
    queryFn: () => fetchTaskStats(activeWorkspace.id),
    enabled: Boolean(activeWorkspace.id),
  })
}

function useInvalidateTasks() {
  const queryClient = useQueryClient()
  const { activeWorkspace } = useWorkspace()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['order-tasks', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['order-tasks-for-order'] })
    queryClient.invalidateQueries({ queryKey: ['task-stats', activeWorkspace.id] })
    queryClient.invalidateQueries({ queryKey: ['rescue-board', activeWorkspace.id] })
  }
}

export function useCreateOrderTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (input: {
      orderId: string
      taskType: OrderTaskType
      title: string
      description?: string | null
      priority?: TaskPriority
      assignedTo?: string | null
      dueAt?: string | null
    }) => createOrderTask(input.orderId, input.taskType, input.title, input.description, input.priority, input.assignedTo, input.dueAt),
    onSuccess: invalidate,
  })
}

export function useAssignOrderTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ taskId, assignedTo }: { taskId: string; assignedTo: string | null }) => assignOrderTask(taskId, assignedTo),
    onSuccess: invalidate,
  })
}

export function useUpdateOrderTaskStatus() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ taskId, status, note }: { taskId: string; status: string; note?: string | null }) => updateOrderTaskStatus(taskId, status, note),
    onSuccess: invalidate,
  })
}
