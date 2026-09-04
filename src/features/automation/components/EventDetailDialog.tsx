import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { automationEventTypeLabels } from '@/features/automation/automationFields'
import type { AutomationEvent, AutomationEventProcessingStatus } from '@/types/database'

const processingStatusVariant: Record<AutomationEventProcessingStatus, 'secondary' | 'success' | 'destructive'> = {
  pending: 'secondary',
  processed: 'success',
  failed: 'destructive',
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? 'break-all font-mono text-xs' : 'font-medium'}>{value}</p>
    </div>
  )
}

export function EventDetailDialog({ event, onOpenChange }: { event: AutomationEvent | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(event)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Event Detail</DialogTitle>
        </DialogHeader>
        {event && (
          <div className="flex flex-col gap-4 p-6 pt-2">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Field label="Type" value={automationEventTypeLabels[event.event_type as keyof typeof automationEventTypeLabels] ?? event.event_type} />
              <Field label="Entity" value={event.entity_type} />
              <Field label="Entity ID" value={event.entity_id ?? '—'} mono />
              <Field label="Source" value={event.source} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Processing</p>
                <Badge variant={processingStatusVariant[event.processing_status]}>{event.processing_status}</Badge>
              </div>
              <Field label="Occurred" value={new Date(event.occurred_at).toLocaleString()} />
            </div>
            {event.processing_error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{event.processing_error}</div>
            )}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payload</p>
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-secondary/30 p-3 text-xs">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
            <Field label="Idempotency Key" value={event.idempotency_key} mono />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
