import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useCreateRescueCase } from '@/features/support/hooks'
import type { TaskPriority } from '@/types/database'

export function StartRescueDialog({ open, onOpenChange, orderId }: { open: boolean; onOpenChange: (open: boolean) => void; orderId: string | null }) {
  const { user } = useAuth()
  const createRescueCase = useCreateRescueCase()
  const [reason, setReason] = React.useState('')
  const [priority, setPriority] = React.useState<TaskPriority>('high')
  const [assignToMe, setAssignToMe] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setReason('')
      setPriority('high')
      setAssignToMe(true)
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orderId) return
    setError(null)
    if (!reason.trim()) {
      setError('A reason is required.')
      return
    }
    try {
      await createRescueCase.mutateAsync({ orderId, reason: reason.trim(), priority, assignedTo: assignToMe && user ? user.id : null })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open rescue case')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Rescue</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Why does this order need rescuing?</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus placeholder="e.g. Two failed delivery attempts, customer unreachable" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Assign to me
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRescueCase.isPending}>
              {createRescueCase.isPending ? 'Opening…' : 'Open Rescue Case'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
