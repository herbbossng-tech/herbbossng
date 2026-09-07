import { Lock, PlayCircle } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useOperationsRealtime, useOperationsSummary, useRunAutoAssignmentSweep, useWorkforceOpsSummary } from '@/features/operations/hooks'
import { formatCurrency } from '@/lib/currency'

export function OperationsDashboardPage() {
  const canView = usePermission('operations.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Operations is hidden" description="You don't have permission to view the Operations dashboard. Ask a workspace admin for the operations.view permission." />
      </Card>
    )
  }
  return <OperationsDashboardContent />
}

function OperationsDashboardContent() {
  useOperationsRealtime()
  const { activeWorkspace } = useWorkspace()
  const { data: summary, isLoading } = useOperationsSummary()

  if (isLoading || !summary) return <LoadingState label="Loading operations…" />

  const count = (n: number) => n.toLocaleString()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Operations Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Where every order stands right now, across the full COD pipeline.</p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Pipeline</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link to="/orders">
            <StatCard label="Awaiting Confirmation" value={count(summary.awaiting_confirmation_count)} icon="phone" compact />
          </Link>
          <Link to="/orders">
            <StatCard label="Scheduled" value={count(summary.scheduled_count)} icon="clock" compact />
          </Link>
          <Link to="/orders">
            <StatCard label="Processing" value={count(summary.processing_count)} icon="boxes" compact />
          </Link>
          <Link to="/orders">
            <StatCard label="Dispatched" value={count(summary.dispatched_count)} icon="cart" compact />
          </Link>
          <Link to="/orders">
            <StatCard label="In Transit" value={count(summary.in_transit_count)} icon="cart" compact />
          </Link>
          <Link to="/orders">
            <StatCard label="Partially Delivered" value={count(summary.partially_delivered_count)} icon="check" compact />
          </Link>
          <Link to="/operations/rescue-board">
            <StatCard label="Failed Deliveries" value={count(summary.failed_deliveries_count)} icon="phone" compact tone="warning" />
          </Link>
          <Link to="/orders">
            <StatCard label="Returned" value={count(summary.returned_count)} icon="boxes" compact tone="warning" />
          </Link>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Cash & Settlement</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link to="/operations/settlement">
            <StatCard
              label="Pending Cash Collection"
              value={count(summary.pending_cash_collection_count)}
              sub={formatCurrency(summary.pending_cash_collection_amount, activeWorkspace.currency_code)}
              icon="wallet"
            />
          </Link>
          <Link to="/operations/settlement">
            <StatCard
              label="Settlement Exceptions"
              value={count(summary.settlement_exceptions_count)}
              sub={`Outstanding: ${formatCurrency(summary.settlement_outstanding_amount, activeWorkspace.currency_code)}`}
              icon="clock"
              tone="warning"
            />
          </Link>
        </div>
      </div>

      <WorkforceSection />
    </div>
  )
}

function WorkforceSection() {
  const { data: workforce, isLoading } = useWorkforceOpsSummary()
  const canAssign = usePermission('orders.assign')
  const canManageOrders = usePermission('orders.manage')
  const canRunSweep = canAssign || canManageOrders
  const sweep = useRunAutoAssignmentSweep()
  const [sweepMessage, setSweepMessage] = React.useState<string | null>(null)

  async function handleRunSweep() {
    setSweepMessage(null)
    try {
      const results = await sweep.mutateAsync(20)
      const assignedCount = results.filter((r) => r.result === 'ASSIGNED').length
      setSweepMessage(
        results.length === 0
          ? 'No orders were old enough to need auto-assignment right now.'
          : `Examined ${results.length} eligible order(s): ${assignedCount} assigned, ${results.length - assignedCount} left unassigned (see reasons on the affected orders).`,
      )
    } catch (err) {
      setSweepMessage(err instanceof Error ? err.message : 'Auto-assignment sweep failed.')
    }
  }

  const count = (n: number) => n.toLocaleString()

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Workforce</h2>
        {canRunSweep && (
          <Button size="sm" variant="outline" onClick={handleRunSweep} disabled={sweep.isPending}>
            <PlayCircle className="h-4 w-4" />
            {sweep.isPending ? 'Running…' : 'Run Auto-Assignment Now'}
          </Button>
        )}
      </div>
      {sweepMessage && <p className="mb-3 text-xs text-muted-foreground">{sweepMessage}</p>}
      {isLoading || !workforce ? (
        <LoadingState label="Loading workforce metrics…" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link to="/orders?assignedTo=unassigned">
            <StatCard label="Unassigned Orders" value={count(workforce.unassigned_count)} icon="boxes" compact />
          </Link>
          <Link to="/orders?assignedTo=unassigned">
            <StatCard
              label="Aging Over Threshold"
              value={count(workforce.orders_aging_over_threshold_count)}
              icon="clock"
              compact
              tone={workforce.orders_aging_over_threshold_count > 0 ? 'warning' : 'default'}
            />
          </Link>
          <Link to="/orders?assignedTo=unassigned">
            <StatCard
              label="Without Eligible Staff"
              value={count(workforce.orders_without_eligible_staff_count)}
              icon="phone"
              compact
              tone={workforce.orders_without_eligible_staff_count > 0 ? 'warning' : 'default'}
            />
          </Link>
          <Link to="/orders?assignedTo=unassigned">
            <StatCard label="Assigned Today" value={count(workforce.orders_assigned_today_count)} icon="check" compact tone="success" />
          </Link>
          <Link to="/staff">
            <StatCard label="Active Staff" value={count(workforce.active_staff_count)} icon="userCheck" compact />
          </Link>
          <Link to="/staff">
            <StatCard label="Available Staff" value={count(workforce.available_staff_count)} icon="userCheck" compact />
          </Link>
          <Link to="/staff">
            <StatCard
              label="At Capacity"
              value={count(workforce.staff_at_capacity_count)}
              icon="target"
              compact
              tone={workforce.staff_at_capacity_count > 0 ? 'warning' : 'default'}
            />
          </Link>
          <Card className="flex flex-col justify-between gap-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auto-Assignment (24h)</p>
            <div className="flex items-center gap-2">
              {workforce.assignment_success_rate_24h === null ? (
                <Badge variant="secondary">No attempts yet</Badge>
              ) : (
                <span className="text-xl font-extrabold tracking-tight">{workforce.assignment_success_rate_24h}%</span>
              )}
              {workforce.avg_assignment_time_seconds_24h !== null && (
                <span className="text-xs text-muted-foreground">
                  avg {Math.round(workforce.avg_assignment_time_seconds_24h / 60)}m to assign
                </span>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
