import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateSupportInteraction } from '@/features/support/hooks'
import { interactionOutcomeLabels, interactionTypeLabels } from '@/features/support/statusMeta'
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
  const createInteraction = useCreateSupportInteraction()
  const [interactionType, setInteractionType] = React.useState<SupportInteractionType>(defaultType)
  const [outcome, setOutcome] = React.useState<string>('none')
  const [summary, setSummary] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setInteractionType(defaultType)
      setOutcome('none')
      setSummary('')
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
    try {
      await createInteraction.mutateAsync({
        interactionType,
        summary: summary.trim(),
        orderId: orderId ?? null,
        customerId: customerId ?? null,
        outcome: outcome === 'none' ? null : (outcome as SupportInteractionOutcome),
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createInteraction.isPending}>
              {createInteraction.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
