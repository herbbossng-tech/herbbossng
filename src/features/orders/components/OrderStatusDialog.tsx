import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTransitionOrderStatus } from '@/features/orders/hooks'
import { orderStatusLabels, statusRequiresField } from '@/features/orders/statusMeta'
import { type StatusChangeFormInput, type StatusChangeFormOutput, statusChangeSchema } from '@/features/orders/validation'
import type { Order, OrderStatus, OrderStatusTransition } from '@/types/database'

interface OrderStatusDialogProps {
  order: Order
  transitions: OrderStatusTransition[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrderStatusDialog({ order, transitions, open, onOpenChange }: OrderStatusDialogProps) {
  const [status, setStatus] = React.useState<OrderStatus | ''>('')
  const transitionOrder = useTransitionOrderStatus(order.id)

  const {
    register,
    handleSubmit,
    control,
    reset,
  } = useForm<StatusChangeFormInput, unknown, StatusChangeFormOutput>({
    resolver: zodResolver(statusChangeSchema),
    defaultValues: {
      scheduledAt: '',
      cancellationReason: '',
      returnReason: '',
      cashCollectedAmount: order.total_amount,
      cashCollectionStatus: 'collected',
    },
  })

  React.useEffect(() => {
    if (!open) {
      setStatus('')
      reset()
    }
  }, [open, reset])

  const availableTransitions = transitions.filter((t) => t.from_status === order.status)
  const requiredField = status ? statusRequiresField(status) : null

  async function submit(values: StatusChangeFormOutput) {
    if (!status) return
    await transitionOrder.mutateAsync({ status, ...values })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change order status</DialogTitle>
          <DialogDescription>Current status: {orderStatusLabels[order.status]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4 px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label>New status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                {availableTransitions.map((t) => (
                  <SelectItem key={t.to_status} value={t.to_status}>
                    {orderStatusLabels[t.to_status]}
                    {t.requires_approval ? ' (requires approval)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableTransitions.length === 0 && (
              <p className="text-xs text-muted-foreground">No further transitions are available from this status.</p>
            )}
          </div>

          {requiredField === 'scheduled_at' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduledAt">Scheduled date/time</Label>
              <Input id="scheduledAt" type="datetime-local" {...register('scheduledAt')} />
            </div>
          )}
          {requiredField === 'cancellation_reason' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cancellationReason">Cancellation reason</Label>
              <Textarea id="cancellationReason" rows={2} {...register('cancellationReason')} />
            </div>
          )}
          {requiredField === 'return_reason' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="returnReason">Return reason</Label>
              <Textarea id="returnReason" rows={2} {...register('returnReason')} />
            </div>
          )}
          {requiredField === 'cash' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cashCollectedAmount">Cash collected</Label>
                <Input id="cashCollectedAmount" type="number" step="0.01" min={0} {...register('cashCollectedAmount')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Collection status</Label>
                <Controller
                  control={control}
                  name="cashCollectionStatus"
                  render={({ field }) => (
                    <Select value={field.value ?? 'collected'} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="collected">Fully collected</SelectItem>
                        <SelectItem value="partial">Partially collected</SelectItem>
                        <SelectItem value="failed">Collection failed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </>
          )}

          {transitionOrder.isError && (
            <p className="text-xs text-destructive">{(transitionOrder.error as Error)?.message ?? 'Could not update status.'}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!status || transitionOrder.isPending}>
              {transitionOrder.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Update status
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
