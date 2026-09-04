import { AlertOctagon, Lock } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { automationEventTypeLabels } from '@/features/automation/automationFields'
import type { AutomationExecutionRow } from '@/features/automation/api'
import { ExecutionDetailDialog } from '@/features/automation/components/ExecutionDetailDialog'
import { useAutomationRules, useFailedAutomationExecutions, useRetryAutomationExecution, useSetAutomationRuleStatus } from '@/features/automation/hooks'
import type { AutomationExecutionStatus } from '@/types/database'

const PAGE_SIZE = 30

const statusVariant: Record<AutomationExecutionStatus, 'secondary' | 'success' | 'warning' | 'destructive' | 'default'> = {
  pending: 'secondary',
  running: 'default',
  succeeded: 'success',
  failed: 'destructive',
  retrying: 'warning',
  skipped: 'secondary',
}

export function FailedAutomationsPage() {
  const canView = usePermission('automation.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Automation is hidden" description="You don't have permission to view automation executions. Ask a workspace admin for the automation.view permission." />
      </Card>
    )
  }
  return <FailedAutomationsContent />
}

function FailedAutomationsContent() {
  const [ruleId, setRuleId] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<AutomationExecutionRow | null>(null)

  const canManage = usePermission('automation.manage')
  const { data: rules } = useAutomationRules()
  const { data, isLoading, isError, refetch } = useFailedAutomationExecutions({ ruleId, page, pageSize: PAGE_SIZE })
  const retry = useRetryAutomationExecution()
  const setRuleStatus = useSetAutomationRuleStatus()
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Failed Automations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Executions currently failed or awaiting retry. Inspect the event/action ledger, retry manually, or pause the offending rule. Full audit
          trail lives in{' '}
          <Link to="/audit-logs" className="text-primary underline-offset-2 hover:underline">
            Audit Logs
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={ruleId}
          onValueChange={(v) => {
            setRuleId(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Rule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rules</SelectItem>
            {rules?.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load failed automations." onRetry={() => refetch()} />
      ) : isLoading && !data ? (
        <LoadingState label="Loading failed automations…" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState icon={AlertOctagon} title="Nothing failed" description="No failed or retrying automation executions right now." />
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Failed at</th>
                    <th className="px-5 py-3 font-semibold">Rule</th>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="px-5 py-3 font-semibold">Error</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((execution) => (
                    <tr key={execution.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="cursor-pointer px-5 py-3 text-xs text-muted-foreground" onClick={() => setSelected(execution)}>
                        {new Date(execution.updated_at).toLocaleString()}
                      </td>
                      <td className="cursor-pointer px-5 py-3 font-medium" onClick={() => setSelected(execution)}>
                        {execution.rule?.name ?? 'Deleted rule'}
                      </td>
                      <td className="cursor-pointer px-5 py-3 text-muted-foreground" onClick={() => setSelected(execution)}>
                        {execution.event ? automationEventTypeLabels[execution.event.event_type as keyof typeof automationEventTypeLabels] ?? execution.event.event_type : '—'}
                      </td>
                      <td className="max-w-[220px] cursor-pointer truncate px-5 py-3 text-xs text-muted-foreground" onClick={() => setSelected(execution)}>
                        {execution.error_message ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant[execution.status]}>{execution.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canManage && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(execution.id)}>
                              Retry
                            </Button>
                            {execution.rule && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={setRuleStatus.isPending}
                                onClick={() => setRuleStatus.mutate({ id: execution.rule!.id, status: 'paused' })}
                              >
                                Disable Rule
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
              <p className="text-muted-foreground">
                Page {page} of {totalPages} · {data?.totalCount ?? 0} failed
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ExecutionDetailDialog execution={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}
