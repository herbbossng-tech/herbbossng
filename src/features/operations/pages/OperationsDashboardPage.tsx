import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatCard } from '@/components/dashboard/StatCard'
import { Card } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useOperationsSummary } from '@/features/operations/hooks'
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
    </div>
  )
}
