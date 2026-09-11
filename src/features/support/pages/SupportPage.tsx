import { AlertTriangle, ExternalLink, Headset, Lock, MessageSquarePlus, Search, ShieldAlert } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { EscalateRescueDialog } from '@/features/support/components/EscalateRescueDialog'
import { LogInteractionDialog } from '@/features/support/components/LogInteractionDialog'
import { StartRescueDialog } from '@/features/support/components/StartRescueDialog'
import { useSupportQueue, useSupportSummary } from '@/features/support/hooks'
import { priorityTone, rescueStatusLabels, rescueStatusTone } from '@/features/support/statusMeta'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { SupportQueueRow } from '@/types/database'

export function SupportPage() {
  const canView = usePermission('support.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Support is hidden" description="You don't have permission to view the Support workspace. Ask a workspace admin for the support.view permission." />
      </Card>
    )
  }
  return <SupportContent />
}

function SupportContent() {
  const { activeWorkspace } = useWorkspace()
  const { data: summary, isLoading: summaryLoading } = useSupportSummary()
  const { data: rows, isLoading, isError, refetch } = useSupportQueue()
  const hasSupportCreate = usePermission('support.create')
  const hasSupportManage = usePermission('support.manage')
  const hasRescueCreate = usePermission('rescue.create')
  const hasRescueEscalate = usePermission('rescue.escalate')
  const hasRescueManage = usePermission('rescue.manage')
  const canCreateInteraction = hasSupportCreate || hasSupportManage
  const canCreateRescue = hasRescueCreate || hasRescueManage
  const canEscalate = hasRescueEscalate || hasRescueManage

  const [search, setSearch] = React.useState('')
  const [priorityFilter, setPriorityFilter] = React.useState('all')
  const [interactionOrderId, setInteractionOrderId] = React.useState<string | null>(null)
  const [rescueOrderId, setRescueOrderId] = React.useState<string | null>(null)
  const [escalateCaseId, setEscalateCaseId] = React.useState<string | null>(null)

  const filtered = React.useMemo(() => {
    let list = rows ?? []
    if (priorityFilter !== 'all') list = list.filter((r) => r.priority === priorityFilter)
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      list = list.filter(
        (r) => r.order_number.toLowerCase().includes(term) || r.customer_name.toLowerCase().includes(term) || r.customer_phone.includes(term),
      )
    }
    return list
  }, [rows, priorityFilter, search])

  const count = (n: number | undefined) => (n ?? 0).toLocaleString()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Support</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything needing customer attention right now, why it's here, and what to do next.</p>
        </div>
      </div>

      {summaryLoading || !summary ? (
        <LoadingState label="Loading Support KPIs…" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <StatCard label="Needs Attention" value={count(summary.needs_attention_count)} icon="phone" compact tone={summary.needs_attention_count > 0 ? 'warning' : 'default'} />
          <StatCard label="Due Today" value={count(summary.due_today_count)} icon="clock" compact />
          <StatCard label="Overdue" value={count(summary.overdue_count)} icon="clock" compact tone={summary.overdue_count > 0 ? 'warning' : 'default'} />
          <StatCard label="Awaiting Customer" value={count(summary.awaiting_customer_count)} icon="phone" compact />
          <StatCard label="Rescue Opportunities" value={count(summary.rescue_opportunities_count)} icon="userCheck" compact />
          <StatCard label="Escalated" value={count(summary.escalated_count)} icon="boxes" compact tone={summary.escalated_count > 0 ? 'warning' : 'default'} />
          <StatCard label="Completed Today" value={count(summary.completed_today_count)} icon="check" compact tone="success" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search order, customer, phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load the Support queue." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading Support queue…" />
      ) : filtered.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={Headset} title="Nothing needs attention" description="Orders with open follow-ups, active rescue cases or unanswered confirmations will appear here." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((row) => (
            <SupportQueueCard
              key={row.order_id}
              row={row}
              canCreateInteraction={canCreateInteraction}
              canCreateRescue={canCreateRescue}
              canEscalate={canEscalate}
              onLogInteraction={() => setInteractionOrderId(row.order_id)}
              onStartRescue={() => setRescueOrderId(row.order_id)}
              onEscalate={() => row.rescue_case_id && setEscalateCaseId(row.rescue_case_id)}
            />
          ))}
        </div>
      )}

      <LogInteractionDialog open={Boolean(interactionOrderId)} onOpenChange={(open) => !open && setInteractionOrderId(null)} orderId={interactionOrderId} />
      <StartRescueDialog open={Boolean(rescueOrderId)} onOpenChange={(open) => !open && setRescueOrderId(null)} orderId={rescueOrderId} />
      <EscalateRescueDialog open={Boolean(escalateCaseId)} onOpenChange={(open) => !open && setEscalateCaseId(null)} rescueCaseId={escalateCaseId} />
      <p className="text-xs text-muted-foreground">Workspace: {activeWorkspace.name}</p>
    </div>
  )
}

function SupportQueueCard({
  row,
  canCreateInteraction,
  canCreateRescue,
  canEscalate,
  onLogInteraction,
  onStartRescue,
  onEscalate,
}: {
  row: SupportQueueRow
  canCreateInteraction: boolean
  canCreateRescue: boolean
  canEscalate: boolean
  onLogInteraction: () => void
  onStartRescue: () => void
  onEscalate: () => void
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={priorityTone[row.priority] ?? 'secondary'} className="capitalize">
              {row.priority}
            </Badge>
            <Link to={`/orders/${row.order_id}`} className="font-mono text-sm font-semibold hover:text-primary">
              {row.order_number}
            </Link>
            {row.rescue_status && <Badge variant={rescueStatusTone[row.rescue_status]}>{rescueStatusLabels[row.rescue_status]}</Badge>}
            {row.rescue_escalated && (
              <Badge variant="destructive">
                <ShieldAlert className="h-3 w-3" />
                Escalated
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {row.customer_name} · {row.customer_phone}
          </p>
          {row.priority_reasons.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
              {row.priority_reasons.join(' · ')}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Last contact: {row.last_interaction_at ? `${row.last_interaction_summary ?? ''} (${new Date(row.last_interaction_at).toLocaleString()})` : 'none yet'}
          </p>
          <p className="mt-0.5 text-xs font-medium text-foreground">Next: {row.next_action}</p>
          {row.open_task_due_at && <p className="mt-0.5 text-xs text-muted-foreground">Due {new Date(row.open_task_due_at).toLocaleString()}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/orders/${row.order_id}`}>
              <ExternalLink className="h-4 w-4" />
              Open
            </Link>
          </Button>
          {canCreateInteraction && (
            <Button size="sm" variant="outline" onClick={onLogInteraction}>
              <MessageSquarePlus className="h-4 w-4" />
              Log contact
            </Button>
          )}
          {!row.rescue_case_id && canCreateRescue && (
            <Button size="sm" onClick={onStartRescue}>
              Start Rescue
            </Button>
          )}
          {row.rescue_case_id && !row.rescue_escalated && canEscalate && (
            <Button size="sm" variant="destructive" onClick={onEscalate}>
              Escalate
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
