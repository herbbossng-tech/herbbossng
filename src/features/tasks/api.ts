import { supabase } from '@/lib/supabase'
import type { OrderTask, OrderTaskType, TaskPriority, TaskStats } from '@/types/database'

export interface TaskRow extends OrderTask {
  order: { order_number: string; customer_name: string; customer_phone: string } | null
}

export interface TaskFilters {
  search?: string
  status?: string | 'all'
  priority?: string | 'all'
  taskType?: string | 'all'
  assignedTo?: string | 'all' | 'me' | 'unassigned'
  currentUserId?: string
}

export async function fetchTasks(workspaceId: string, filters: TaskFilters = {}): Promise<TaskRow[]> {
  let query = supabase
    .from('order_tasks')
    .select('*, order:orders(order_number, customer_name, customer_phone)')
    .eq('workspace_id', workspaceId)

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.priority && filters.priority !== 'all') query = query.eq('priority', filters.priority)
  if (filters.taskType && filters.taskType !== 'all') query = query.eq('task_type', filters.taskType)
  if (filters.assignedTo === 'me' && filters.currentUserId) query = query.eq('assigned_to', filters.currentUserId)
  else if (filters.assignedTo === 'unassigned') query = query.is('assigned_to', null)
  else if (filters.assignedTo && !['all', 'me', 'unassigned'].includes(filters.assignedTo)) query = query.eq('assigned_to', filters.assignedTo)

  const { data, error } = await query.order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
  if (error) throw error

  let rows = (data ?? []) as unknown as TaskRow[]
  if (filters.search) {
    const term = filters.search.toLowerCase()
    rows = rows.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        t.order?.order_number.toLowerCase().includes(term) ||
        t.order?.customer_name.toLowerCase().includes(term) ||
        t.order?.customer_phone.includes(term),
    )
  }
  return rows
}

export async function fetchOrderTasks(orderId: string): Promise<OrderTask[]> {
  const { data, error } = await supabase.from('order_tasks').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrderTask[]
}

export async function fetchTaskStats(workspaceId: string): Promise<TaskStats> {
  const { data, error } = await supabase.rpc('get_task_stats', { p_workspace_id: workspaceId }).single()
  if (error) throw error
  return data as TaskStats
}

export async function createOrderTask(
  orderId: string,
  taskType: OrderTaskType,
  title: string,
  description?: string | null,
  priority: TaskPriority = 'normal',
  assignedTo?: string | null,
  dueAt?: string | null,
): Promise<OrderTask> {
  const { data, error } = await supabase
    .rpc('create_order_task', {
      p_order_id: orderId,
      p_task_type: taskType,
      p_title: title,
      p_description: description ?? null,
      p_priority: priority,
      p_assigned_to: assignedTo ?? null,
      p_due_at: dueAt ?? null,
    })
    .single()
  if (error) throw error
  return data as OrderTask
}

export async function assignOrderTask(taskId: string, assignedTo: string | null): Promise<OrderTask> {
  const { data, error } = await supabase.rpc('assign_order_task', { p_task_id: taskId, p_assigned_to: assignedTo }).single()
  if (error) throw error
  return data as OrderTask
}

export async function updateOrderTaskStatus(taskId: string, status: string, note?: string | null): Promise<OrderTask> {
  const { data, error } = await supabase.rpc('update_order_task_status', { p_task_id: taskId, p_status: status, p_note: note ?? null }).single()
  if (error) throw error
  return data as OrderTask
}
