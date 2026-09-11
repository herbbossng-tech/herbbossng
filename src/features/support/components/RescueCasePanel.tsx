import { AlertOctagon, History } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePermission } from '@/contexts/PermissionsContext'
import { EscalateRescueDialog } from '@/features/support/components/EscalateRescueDialog'
import { useRescueAttempts, useUpdateRescueCaseStatus } from '@/features/support/hooks'
import { rescueStatusLabels, rescueStatusTone, rescueStatusTransitions } from '@/features/support/statusMeta'
import type { RescueCase, RescueCaseStatus } from '@/types/database'

export function RescueCasePanel({ rescueCase }: { rescueCase: RescueCase }) {
  const hasRescueUpdate = usePermission('rescue.update')
  const hasRescueEscalate = usePermission('rescue.escalate')
  const hasRescueManage = usePermission('rescue.manage')
  const canUpdate = hasRescueUpdate || hasRescueManage
  const canEscalate = hasRescueEscalate || hasRescueManage
  const updateStatus = useUpdateRescueCaseStatus()
  const [showHistory, setShowHistory] = React.useState(false)
  const [escalateOpen, setEscalateOpen] = React.useState(false)
  const nextOptions = rescueStatusTransitions[rescueCase.status] ?? []
  const isTerminal = nextOptions.length === 0

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={rescueStatusTone[rescueCase.status]}>{rescueStatusLabels[rescueCase.status]}</Badge>
          {rescueCase.escalated && (
            <Badge variant="destructive">
              <AlertOctagon className="h-3 w-3" />
              Escalated
            </Badge>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-3.5 w-3.5" />
            History
          </Button>
        </div>
        {!isTerminal && (canUpdate || canEscalate) && (
          <div className="flex flex-wrap items-center gap-2">
            {canUpdate && nextOptions.length > 0 && (
              <Select
                value=""
                onValueChange={(v) => updateStatus.mutate({ rescueCaseId: rescueCase.id, status: v as RescueCaseStatus })}
                disabled={updateStatus.isPending}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Progress…" />
                </SelectTrigger>
                <SelectContent>
                  {nextOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {rescueStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {canEscalate && !rescueCase.escalated && (
              <Button size="sm" variant="outline" onClick={() => setEscalateOpen(true)}>
                <AlertOctagon className="h-3.5 w-3.5" />
                Escalate
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{rescueCase.reason}</p>
      {rescueCase.escalated && rescueCase.escalation_reason && (
        <p className="mt-1 text-xs text-destructive">Escalated: {rescueCase.escalation_reason}</p>
      )}
      {showHistory && <RescueAttemptHistory rescueCaseId={rescueCase.id} />}
      <EscalateRescueDialog open={escalateOpen} onOpenChange={setEscalateOpen} rescueCaseId={rescueCase.id} />
    </div>
  )
}

function RescueAttemptHistory({ rescueCaseId }: { rescueCaseId: string }) {
  const { data: attempts, isLoading } = useRescueAttempts(rescueCaseId)
  if (isLoading) return <p className="mt-2 text-xs text-muted-foreground">Loading history…</p>
  if (!attempts?.length) return <p className="mt-2 text-xs text-muted-foreground">No attempts recorded yet.</p>
  return (
    <ol className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
      {attempts.map((a) => (
        <li key={a.id} className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{a.from_status ? `${rescueStatusLabels[a.from_status]} → ${rescueStatusLabels[a.to_status]}` : rescueStatusLabels[a.to_status]}</span>
          {a.action_note && <span> — {a.action_note}</span>}
          <span className="ml-1 opacity-70">({new Date(a.created_at).toLocaleString()})</span>
        </li>
      ))}
    </ol>
  )
}
