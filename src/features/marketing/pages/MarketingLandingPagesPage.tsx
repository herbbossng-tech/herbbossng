import { Layout } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter } from '@/features/finance/components/DateRangeFilter'
import { useMarketingDateRange } from '@/features/marketing/dateRange'
import { useMarketingLandingPagePerformance } from '@/features/marketing/hooks'
import { formatCurrency } from '@/lib/currency'

/**
 * Reuses get_landing_page_analytics() (Phase 9/10) verbatim — a
 * marketing-lens view on the SAME data Finance/Analytics show, never
 * a second landing-page analytics computation.
 */
export function MarketingLandingPagesPage() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { setPreset, customFrom, customTo, setCustom, resolved, range } = useMarketingDateRange()
  const { data: rows, isLoading, isError, refetch } = useMarketingLandingPagePerformance(range)

  const money = (n: number) => formatCurrency(n, currency)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Landing Page Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Orders and delivered revenue by landing page.</p>
      </div>
      <DateRangeFilter value={resolved} onChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomChange={setCustom} />

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load landing page performance." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading landing page performance…" />
            </div>
          ) : (rows?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Layout} title="No landing page activity yet" description="No orders recorded against a landing page in this date range." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Landing Page</th>
                    <th className="px-5 py-3 font-semibold">Orders</th>
                    <th className="px-5 py-3 font-semibold">Delivered Revenue</th>
                    <th className="px-5 py-3 font-semibold">Pending Revenue</th>
                    <th className="px-5 py-3 font-semibold">Returned</th>
                    <th className="px-5 py-3 font-semibold">Cancelled</th>
                    <th className="px-5 py-3 font-semibold">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row) => (
                    <tr key={row.landing_page_id} className="border-t border-border/60">
                      <td className="px-5 py-3 font-medium">{row.landing_page_name}</td>
                      <td className="px-5 py-3">{row.orders_count.toLocaleString()}</td>
                      <td className="px-5 py-3">{money(row.delivered_revenue)}</td>
                      <td className="px-5 py-3">{money(row.pending_revenue)}</td>
                      <td className="px-5 py-3">{row.returned_orders.toLocaleString()}</td>
                      <td className="px-5 py-3">{row.cancelled_orders.toLocaleString()}</td>
                      <td className="px-5 py-3">{money(row.average_order_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
