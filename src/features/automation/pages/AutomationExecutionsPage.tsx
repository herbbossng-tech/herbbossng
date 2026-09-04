import { History, Lock, Search } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { automationEventTypeLabels } from '@/features/automation/automationFields'
import type { AutomationExecutionRow } from '@/features/automation/api'
import { ExecutionDetailDialog } from '@/features/automation/components/ExecutionDetailDialog'
import { useAutomationExecutions, useAutomationRules } from '@/features/automation/hooks'
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

export function AutomationExecutionsPage() {
  const canView = usePermission('automation.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Automation is hidden" description="You don't have permission to view automation executions. Ask a workspace admin for the automation.view permission." />
      </Card>
    )
  }
  return <AutomationExecutionsContent />
}

function AutomationExecutionsContent() {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [ruleId, setRuleId] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<AutomationExecutionRow | null>(null)

  const { data: rules } = useAutomationRules()
  const { data, isLoading, isError, refetch } = useAutomationExecutions({
    search,
    status: status as AutomationExecutionStatus | 'all',
    ruleId,
    page,
    pageSize: PAGE_SIZE,
  })
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Automation Executions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Full history of every rule match — one row per (event, rule), with its per-action ledger.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search rule/event/entity…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="retrying">Retrying</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
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
        <ErrorState message="Couldn't load executions." onRetry={() => refetch()} />
      ) : isLoading && !data ? (
        <LoadingState label="Loading executions…" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState icon={History} title="No executions yet" description="Nothing matches these filters yet." />
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Started</th>
                    <th className="px-5 py-3 font-semibold">Rule</th>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="px-5 py-3 font-semibold">Attempts</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((execution) => (
                    <tr key={execution.id} className="cursor-pointer border-t border-border/60 hover:bg-accent/40" onClick={() => setSelected(execution)}>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(execution.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3 font-medium">{execution.rule?.name ?? 'Deleted rule'}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {execution.event ? automationEventTypeLabels[execution.event.event_type as keyof typeof automationEventTypeLabels] ?? execution.event.event_type : '—'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {execution.attempts} / {execution.max_attempts}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant[execution.status]}>{execution.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-primary">View</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
              <p className="text-muted-foreground">
                Page {page} of {totalPages} · {data?.totalCount ?? 0} executions
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
