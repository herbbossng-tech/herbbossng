import { Building2, Lock, RefreshCcw, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatCard } from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter } from '@/features/finance/components/DateRangeFilter'
import { useMarketingDateRange } from '@/features/marketing/dateRange'
import { useMarketingSummary, useMarketingTrend } from '@/features/marketing/hooks'
import { formatCurrency } from '@/lib/currency'

export function MarketingOverviewPage() {
  const canView = usePermission('marketing.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Marketing is hidden" description="You don't have permission to view marketing data. Ask a workspace admin for the marketing.view permission." />
      </Card>
    )
  }
  return <MarketingOverviewContent />
}

function MarketingOverviewContent() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { setPreset, customFrom, customTo, setCustom, resolved, range } = useMarketingDateRange()

  const { data: summary, isLoading, isError, refetch } = useMarketingSummary(range)
  const { data: trend } = useMarketingTrend(null, range)

  if (!activeBrand) {
    return (
      <Card className="p-8">
        <EmptyState icon={Building2} title="Select a brand" description="Marketing data is scoped to a brand — pick one from the switcher to continue." />
      </Card>
    )
  }

  const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatCurrency(n, currency))
  const count = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString())
  const ratio = (n: number | null | undefined, suffix: string) => (n === null || n === undefined ? '—' : `${n.toLocaleString()}${suffix}`)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Marketing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track acquisition performance from spend to delivered cash.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link to="/marketing/campaigns">Create Campaign</Link>
          </Button>
        </div>
      </div>

      <DateRangeFilter value={resolved} onChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomChange={setCustom} />

      {isError ? (
        <ErrorState message="Couldn't load marketing summary." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading marketing summary…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard icon="dollar" label="Total Ad Spend" value={money(summary?.total_ad_spend)} />
            <StatCard icon="cart" label="Orders Created" value={count(summary?.orders_created)} />
            <StatCard icon="check" label="Delivered Orders" value={count(summary?.delivered_orders)} />
            <StatCard icon="wallet" label="Delivered Revenue" value={money(summary?.delivered_revenue)} />
            <StatCard icon="target" label="Delivered ROAS" value={ratio(summary?.delivered_roas, 'x')} />
            <StatCard icon="percent" label="Delivered CPA" value={money(summary?.delivered_cpa)} />
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Daily Trend</h2>
              <span className="text-xs text-muted-foreground">{summary?.active_campaigns ?? 0} active campaign{(summary?.active_campaigns ?? 0) === 1 ? '' : 's'}</span>
            </div>
            {trend && trend.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-semibold">Date</th>
                      <th className="py-2 pr-4 font-semibold">Spend</th>
                      <th className="py-2 pr-4 font-semibold">Orders</th>
                      <th className="py-2 pr-4 font-semibold">Delivered</th>
                      <th className="py-2 pr-4 font-semibold">Delivered Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((row) => (
                      <tr key={row.bucket} className="border-t border-border/60">
                        <td className="py-2 pr-4 text-muted-foreground">{new Date(row.bucket).toLocaleDateString()}</td>
                        <td className="py-2 pr-4">{money(row.spend)}</td>
                        <td className="py-2 pr-4">{count(row.orders_created)}</td>
                        <td className="py-2 pr-4">{count(row.delivered_orders)}</td>
                        <td className="py-2 pr-4">{money(row.delivered_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={TrendingUp} title="No trend data" description="No marketing activity in this date range yet." />
            )}
          </Card>

          <p className="text-xs text-muted-foreground">
            Ad Spend is dated by spend period; Orders Created is dated by order creation; Delivered Revenue is dated by delivery date — see{' '}
            <Link to="/settings/integrations" className="underline">
              Integration Health
            </Link>{' '}
            for tracking dispatch status.
          </p>
        </>
      )}
    </div>
  )
}
