import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { automationEventTypeLabels } from '@/features/automation/automationFields'
import type { AutomationExecutionRow } from '@/features/automation/api'
import { useAutomationEvent, useAutomationExecutionActions, useRetryAutomationExecution } from '@/features/automation/hooks'
import type { AutomationExecutionActionStatus, AutomationExecutionStatus } from '@/types/database'

const executionStatusVariant: Record<AutomationExecutionStatus, 'secondary' | 'success' | 'warning' | 'destructive' | 'default'> = {
  pending: 'secondary',
  running: 'default',
  succeeded: 'success',
  failed: 'destructive',
  retrying: 'warning',
  skipped: 'secondary',
}

const actionStatusVariant: Record<AutomationExecutionActionStatus, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  pending: 'secondary',
  succeeded: 'success',
  failed: 'destructive',
  skipped: 'warning',
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? 'break-all font-mono text-xs' : 'font-medium'}>{value}</p>
    </div>
  )
}

export function ExecutionDetailDialog({ execution, onOpenChange }: { execution: AutomationExecutionRow | null; onOpenChange: (open: boolean) => void }) {
  const { data: actions, isLoading } = useAutomationExecutionActions(execution?.id ?? null)
  const { data: event } = useAutomationEvent(execution?.event_id ?? null)
  const canManage = usePermission('automation.manage')
  const retry = useRetryAutomationExecution()

  const canRetry = execution && canManage && (execution.status === 'failed' || execution.status === 'retrying')

  return (
    <Dialog open={Boolean(execution)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Execution Detail</DialogTitle>
        </DialogHeader>
        {execution && (
          <div className="flex flex-col gap-4 p-6 pt-2">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Field label="Rule" value={execution.rule?.name ?? 'Deleted rule'} />
              <Field
                label="Event"
                value={
                  (execution.event && automationEventTypeLabels[execution.event.event_type as keyof typeof automationEventTypeLabels]) ??
                  execution.event?.event_type ??
                  '—'
                }
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <Badge variant={executionStatusVariant[execution.status]}>{execution.status}</Badge>
              </div>
              <Field label="Attempts" value={`${execution.attempts} / ${execution.max_attempts}`} />
              <Field label="Started" value={execution.started_at ? new Date(execution.started_at).toLocaleString() : '—'} />
              <Field label="Completed" value={execution.completed_at ? new Date(execution.completed_at).toLocaleString() : '—'} />
              <Field label="Entity" value={`${execution.event?.entity_type ?? '—'}`} />
              <Field label="Entity ID" value={execution.event?.entity_id ?? '—'} mono />
            </div>

            {execution.error_message && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{execution.error_message}</div>
            )}

            {event?.payload != null && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event Payload</p>
                <pre className="max-h-40 overflow-auto rounded-md border border-border bg-secondary/30 p-3 text-xs">{JSON.stringify(event.payload, null, 2)}</pre>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
              {isLoading ? (
                <LoadingState label="Loading actions…" />
              ) : (actions?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No action rows recorded yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">#</th>
                        <th className="px-3 py-2 font-semibold">Action</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actions?.map((a) => (
                        <tr key={a.id} className="border-t border-border/60">
                          <td className="px-3 py-2 text-xs text-muted-foreground">{a.action_seq}</td>
                          <td className="px-3 py-2 font-mono text-xs">{a.action_type}</td>
                          <td className="px-3 py-2">
                            <Badge variant={actionStatusVariant[a.status]}>{a.status}</Badge>
                          </td>
                          <td className="max-w-[220px] break-words px-3 py-2 text-xs text-muted-foreground">{a.error_message ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canRetry && (
              <div className="flex justify-end">
                <Button size="sm" disabled={retry.isPending} onClick={() => retry.mutate(execution.id)}>
                  {retry.isPending ? 'Retrying…' : 'Retry'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
