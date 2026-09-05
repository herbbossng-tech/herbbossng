import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, Lock, Plus, UserCheck } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { assignOrder } from '@/features/orders/api'
import { useOperationsRealtime, useRescueBoard } from '@/features/operations/hooks'
import { RescueCasePanel } from '@/features/support/components/RescueCasePanel'
import { StartRescueDialog } from '@/features/support/components/StartRescueDialog'
import { useActiveRescueCases } from '@/features/support/hooks'
import { useCreateOrderTask } from '@/features/tasks/hooks'
import { formatCurrency } from '@/lib/currency'
import type { RescueCase } from '@/types/database'

const priorityTone: Record<string, 'secondary' | 'warning' | 'destructive'> = {
  normal: 'secondary',
  high: 'warning',
  urgent: 'destructive',
}

export function RescueBoardPage() {
  const canView = usePermission('operations.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Rescue Board is hidden" description="You don't have permission to view the Rescue Board. Ask a workspace admin for the operations.view permission." />
      </Card>
    )
  }
  return <RescueBoardContent />
}

function RescueBoardContent() {
  useOperationsRealtime()
  const { data: rows, isLoading, isError, refetch } = useRescueBoard()
  const { data: activeRescueCases } = useActiveRescueCases()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const hasRescueCreate = usePermission('rescue.create')
  const hasRescueManage = usePermission('rescue.manage')
  const canCreateRescue = hasRescueCreate || hasRescueManage
  const assignToMe = useMutation({
    mutationFn: ({ orderId }: { orderId: string }) => {
      if (!user) throw new Error('You must be signed in')
      return assignOrder(orderId, user.id, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rescue-board'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
  const [taskDialogOrderId, setTaskDialogOrderId] = React.useState<string | null>(null)
  const [rescueDialogOrderId, setRescueDialogOrderId] = React.useState<string | null>(null)

  const rescueCaseByOrderId = React.useMemo(() => {
    const map = new Map<string, RescueCase>()
    for (const rc of activeRescueCases ?? []) map.set(rc.order_id, rc)
    return map
  }, [activeRescueCases])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Rescue Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">Orders genuinely needing human intervention right now — unanswered confirmations, repeated failed deliveries, callbacks, returns.</p>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load the Rescue Board." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading Rescue Board…" />
      ) : (rows?.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState icon={AlertTriangle} title="Nothing needs rescue right now" description="Orders with unanswered confirmations, repeated failed deliveries or returns will appear here." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows?.map((row) => {
            const rescueCase = rescueCaseByOrderId.get(row.order_id)
            return (
              <Card key={row.order_id} className="p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/orders/${row.order_id}`} className="font-mono text-sm font-semibold hover:text-primary">
                        {row.order_number}
                      </Link>
                      <Badge variant={priorityTone[row.priority] ?? 'secondary'} className="capitalize">
                        {row.priority}
                      </Badge>
                      {row.open_task_count > 0 && <Badge variant="info">{row.open_task_count} open task{row.open_task_count === 1 ? '' : 's'}</Badge>}
                    </div>
                    <p className="mt-1 text-sm font-medium text-destructive">{row.issue}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.customer_name} · {row.customer_phone} · {formatCurrency(row.total_amount, row.currency_code)} · {row.status.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/orders/${row.order_id}`}>
                        <ExternalLink className="h-4 w-4" />
                        Open
                      </Link>
                    </Button>
                    {!row.assigned_to && user && (
                      <Button size="sm" variant="outline" onClick={() => assignToMe.mutate({ orderId: row.order_id })} disabled={assignToMe.isPending}>
                        <UserCheck className="h-4 w-4" />
                        Assign to me
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setTaskDialogOrderId(row.order_id)}>
                      <Plus className="h-4 w-4" />
                      Follow-up
                    </Button>
                    {!rescueCase && canCreateRescue && (
                      <Button size="sm" onClick={() => setRescueDialogOrderId(row.order_id)}>
                        Start Rescue
                      </Button>
                    )}
                  </div>
                </div>
                {rescueCase && (
                  <div className="mt-3">
                    <RescueCasePanel rescueCase={rescueCase} />
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <StartRescueDialog open={Boolean(rescueDialogOrderId)} onOpenChange={(open) => !open && setRescueDialogOrderId(null)} orderId={rescueDialogOrderId} />

      <QuickTaskDialog orderId={taskDialogOrderId} onOpenChange={(open) => !open && setTaskDialogOrderId(null)} />
    </div>
  )
}

function QuickTaskDialog({ orderId, onOpenChange }: { orderId: string | null; onOpenChange: (open: boolean) => void }) {
  const { activeWorkspace } = useWorkspace()
  const createTask = useCreateOrderTask()
  const [taskType, setTaskType] = React.useState('CALL_BACK')
  const [title, setTitle] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!orderId) {
      setTaskType('CALL_BACK')
      setTitle('')
      setNote('')
      setError(null)
    }
  }, [orderId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orderId) return
    setError(null)
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    try {
      await createTask.mutateAsync({ orderId, taskType: taskType as never, title, description: note || null, priority: 'high' })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    }
  }

  return (
    <Dialog open={Boolean(orderId)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Follow-up Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Task type</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call to reschedule delivery" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">Workspace: {activeWorkspace.name}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
