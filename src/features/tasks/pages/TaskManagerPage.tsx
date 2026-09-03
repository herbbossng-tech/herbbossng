import { CheckCircle2, Clock, ClipboardList, Lock, Search, UserCheck } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/contexts/PermissionsContext'
import { useAssignOrderTask, useTaskStats, useTasks, useUpdateOrderTaskStatus } from '@/features/tasks/hooks'
import { cn } from '@/lib/utils'

const priorityTone: Record<string, 'secondary' | 'warning' | 'destructive'> = {
  low: 'secondary',
  normal: 'secondary',
  high: 'warning',
  urgent: 'destructive',
}

const statusTone: Record<string, 'secondary' | 'info' | 'success' | 'destructive'> = {
  OPEN: 'secondary',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
}

type QuickFilter = 'all' | 'mine' | 'overdue' | 'due_today' | 'completed'

export function TaskManagerPage() {
  const canView = usePermission('tasks.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Follow-up Tasks is hidden" description="You don't have permission to view tasks. Ask a workspace admin for the tasks.view permission." />
      </Card>
    )
  }
  return <TaskManagerContent />
}

function TaskManagerContent() {
  const { user } = useAuth()
  const [quick, setQuick] = React.useState<QuickFilter>('all')
  const [search, setSearch] = React.useState('')
  const [priority, setPriority] = React.useState('all')
  const [taskType, setTaskType] = React.useState('all')

  const { data: stats } = useTaskStats()

  const filters = React.useMemo(() => {
    const base: Parameters<typeof useTasks>[0] = { search, priority, taskType }
    if (quick === 'mine') base.assignedTo = 'me'
    if (quick === 'completed') base.status = 'COMPLETED'
    return base
  }, [search, priority, taskType, quick])

  const { data: allTasks, isLoading, isError, refetch } = useTasks(filters)

  const now = Date.now()
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  const todayEnd = todayStart + 24 * 60 * 60 * 1000

  const tasks = React.useMemo(() => {
    if (!allTasks) return allTasks
    if (quick === 'overdue') {
      return allTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now && !['COMPLETED', 'CANCELLED'].includes(t.status))
    }
    if (quick === 'due_today') {
      return allTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() >= todayStart && new Date(t.due_at).getTime() < todayEnd && !['COMPLETED', 'CANCELLED'].includes(t.status))
    }
    return allTasks
  }, [allTasks, quick, now, todayStart, todayEnd])

  const assignToMe = useAssignOrderTask()
  const updateStatus = useUpdateOrderTaskStatus()
  const canAssign = usePermission('tasks.assign')
  const canUpdate = usePermission('tasks.update')
  const canManage = usePermission('tasks.manage')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Task Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every follow-up task across your workspace.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            { key: 'all', label: 'All Tasks', value: (stats?.open_count ?? 0) + (stats?.in_progress_count ?? 0), icon: ClipboardList },
            { key: 'mine', label: 'My Tasks', value: '—', icon: UserCheck },
            { key: 'overdue', label: 'Overdue', value: stats?.overdue_count ?? 0, icon: Clock },
            { key: 'due_today', label: 'Due Today', value: stats?.due_today_count ?? 0, icon: Clock },
            { key: 'completed', label: 'Completed Today', value: stats?.completed_today_count ?? 0, icon: CheckCircle2 },
          ] as const
        ).map((tile) => (
          <button
            key={tile.key}
            onClick={() => setQuick(tile.key)}
            className={cn(
              'rounded-xl border p-3 text-left transition-colors',
              quick === tile.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40',
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tile.label}</p>
              <tile.icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="mt-1 text-xl font-extrabold tracking-tight">{tile.value}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search task, order, customer, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={taskType} onValueChange={setTaskType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All task types</SelectItem>
            <SelectItem value="CONFIRM_ORDER">Confirm Order</SelectItem>
            <SelectItem value="CALL_BACK">Call Back</SelectItem>
            <SelectItem value="VERIFY_ADDRESS">Verify Address</SelectItem>
            <SelectItem value="DELIVERY_FOLLOW_UP">Delivery Follow-up</SelectItem>
            <SelectItem value="FAILED_DELIVERY">Failed Delivery</SelectItem>
            <SelectItem value="CUSTOMER_REQUEST">Customer Request</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load tasks." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading tasks…" />
            </div>
          ) : (tasks?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={ClipboardList} title="No tasks match this view" description="Follow-up tasks created from an order will appear here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Task</th>
                    <th className="px-5 py-3 font-semibold">Order</th>
                    <th className="px-5 py-3 font-semibold">Priority</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Due</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {tasks?.map((t) => {
                    const overdue = t.due_at && new Date(t.due_at).getTime() < now && !['COMPLETED', 'CANCELLED'].includes(t.status)
                    return (
                      <tr key={t.id} className="border-t border-border/60 hover:bg-accent/40">
                        <td className="px-5 py-3">
                          <p className="font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">{t.task_type.replace(/_/g, ' ').toLowerCase()}</p>
                        </td>
                        <td className="px-5 py-3">
                          {t.order ? (
                            <Link to={`/orders/${t.order_id}`} className="font-mono text-xs text-muted-foreground hover:text-primary">
                              {t.order.order_number}
                            </Link>
                          ) : (
                            '—'
                          )}
                          {t.order && <p className="text-xs text-muted-foreground">{t.order.customer_name}</p>}
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={priorityTone[t.priority]} className="capitalize">
                            {t.priority}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={statusTone[t.status]}>{t.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className={cn('px-5 py-3 text-xs', overdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                          {t.due_at ? new Date(t.due_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            {canAssign && !t.assigned_to && !['COMPLETED', 'CANCELLED'].includes(t.status) && (
                              <Button size="sm" variant="outline" onClick={() => user && assignToMe.mutate({ taskId: t.id, assignedTo: user.id })} disabled={assignToMe.isPending}>
                                Assign to me
                              </Button>
                            )}
                            {(canUpdate || canManage) && t.status === 'OPEN' && (
                              <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ taskId: t.id, status: 'IN_PROGRESS' })} disabled={updateStatus.isPending}>
                                Start
                              </Button>
                            )}
                            {(canUpdate || canManage) && ['OPEN', 'IN_PROGRESS'].includes(t.status) && (
                              <Button size="sm" onClick={() => updateStatus.mutate({ taskId: t.id, status: 'COMPLETED' })} disabled={updateStatus.isPending}>
                                <CheckCircle2 className="h-4 w-4" />
                                Complete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
