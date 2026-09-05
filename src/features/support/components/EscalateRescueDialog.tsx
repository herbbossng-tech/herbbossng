import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useEscalateRescueCase } from '@/features/support/hooks'

export function EscalateRescueDialog({
  open,
  onOpenChange,
  rescueCaseId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rescueCaseId: string | null
}) {
  const escalate = useEscalateRescueCase()
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setReason('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rescueCaseId) return
    setError(null)
    if (!reason.trim()) {
      setError('An escalation reason is required.')
      return
    }
    try {
      await escalate.mutateAsync({ rescueCaseId, reason: reason.trim() })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to escalate')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escalate Rescue Case</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Why is this being escalated?</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus placeholder="e.g. Customer threatening a chargeback, needs manager attention" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={escalate.isPending}>
              {escalate.isPending ? 'Escalating…' : 'Escalate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
