import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useCreateSupportInteraction } from '@/features/support/hooks'
import { interactionOutcomeLabels, interactionTypeLabels } from '@/features/support/statusMeta'
import { useCreateOrderTask } from '@/features/tasks/hooks'
import type { SupportInteractionOutcome, SupportInteractionType } from '@/types/database'

const INTERACTION_TYPES = Object.keys(interactionTypeLabels) as SupportInteractionType[]
const OUTCOMES = Object.keys(interactionOutcomeLabels) as SupportInteractionOutcome[]

export function LogInteractionDialog({
  open,
  onOpenChange,
  orderId,
  customerId,
  defaultType = 'CALL',
  title = 'Log Support Interaction',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId?: string | null
  customerId?: string | null
  defaultType?: SupportInteractionType
  title?: string
}) {
  const { user } = useAuth()
  const createInteraction = useCreateSupportInteraction()
  const createTask = useCreateOrderTask()
  const [interactionType, setInteractionType] = React.useState<SupportInteractionType>(defaultType)
  const [outcome, setOutcome] = React.useState<string>('none')
  const [summary, setSummary] = React.useState('')
  const [scheduleFollowUp, setScheduleFollowUp] = React.useState(false)
  const [followUpAt, setFollowUpAt] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setInteractionType(defaultType)
      setOutcome('none')
      setSummary('')
      setScheduleFollowUp(false)
      setFollowUpAt('')
      setError(null)
    }
  }, [open, defaultType])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!summary.trim()) {
      setError('A summary is required.')
      return
    }
    if (scheduleFollowUp && !followUpAt) {
      setError('Pick a date and time for the follow-up.')
      return
    }
    try {
      // Create the follow-up task first (existing order_tasks infrastructure
      // — no separate follow-up system) so the interaction we log right
      // after can link back to it via related_task_id, keeping the two
      // records connected the way Order Detail's timeline expects.
      let relatedTaskId: string | null = null
      if (scheduleFollowUp && orderId) {
        const task = await createTask.mutateAsync({
          orderId,
          taskType: 'CALL_BACK',
          title: summary.trim().slice(0, 80),
          assignedTo: user?.id ?? null,
          dueAt: new Date(followUpAt).toISOString(),
        })
        relatedTaskId = task.id
      }
      await createInteraction.mutateAsync({
        interactionType,
        summary: summary.trim(),
        orderId: orderId ?? null,
        customerId: customerId ?? null,
        outcome: outcome === 'none' ? null : (outcome as SupportInteractionOutcome),
        relatedTaskId,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log interaction')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={interactionType} onValueChange={(v) => setInteractionType(v as SupportInteractionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {interactionTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {interactionType !== 'INTERNAL_NOTE' && (
            <div className="flex flex-col gap-1.5">
              <Label>Outcome (optional)</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger>
                  <SelectValue placeholder="No outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No outcome</SelectItem>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {interactionOutcomeLabels[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{interactionType === 'INTERNAL_NOTE' ? 'Note' : 'Summary'}</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              autoFocus
              placeholder={interactionType === 'INTERNAL_NOTE' ? 'Internal note — never visible to the customer' : 'What happened on this contact?'}
            />
          </div>
          {orderId && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox checked={scheduleFollowUp} onCheckedChange={(v) => setScheduleFollowUp(v === true)} />
                Schedule a follow-up
              </label>
              {scheduleFollowUp && (
                <div className="flex flex-col gap-1.5 pl-6">
                  <Label>Follow up at</Label>
                  <Input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Creates a follow-up task assigned to you, linked to this interaction.</p>
                </div>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createInteraction.isPending || createTask.isPending}>
              {createInteraction.isPending || createTask.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
