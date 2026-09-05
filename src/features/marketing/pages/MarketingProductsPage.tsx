import { Package } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter } from '@/features/finance/components/DateRangeFilter'
import { useMarketingDateRange } from '@/features/marketing/dateRange'
import { useMarketingProductPerformance } from '@/features/marketing/hooks'
import { formatCurrency } from '@/lib/currency'

/**
 * Reuses get_product_performance() (Phase 9) verbatim. Campaign spend
 * is never arbitrarily allocated across products here — that
 * allocation would be a guess GCOS has no basis for, so this tab
 * shows product-level delivery/revenue only, consistent with the
 * master prompt's explicit "show Unallocated rather than inventing
 * allocation" instruction.
 */
export function MarketingProductsPage() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { setPreset, customFrom, customTo, setCustom, resolved, range } = useMarketingDateRange()
  const { data: rows, isLoading, isError, refetch } = useMarketingProductPerformance(range)

  const money = (n: number) => formatCurrency(n, currency)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Product Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders and delivered revenue by product. Campaign spend is not allocated across products — see the Campaigns tab for spend tied to a
          specific campaign's product.
        </p>
      </div>
      <DateRangeFilter value={resolved} onChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomChange={setCustom} />

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load product performance." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading product performance…" />
            </div>
          ) : (rows?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Package} title="No product activity yet" description="No orders recorded in this date range." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Orders</th>
                    <th className="px-5 py-3 font-semibold">Units Sold</th>
                    <th className="px-5 py-3 font-semibold">Delivered Revenue</th>
                    <th className="px-5 py-3 font-semibold">Delivery Rate</th>
                    <th className="px-5 py-3 font-semibold">Gross Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row) => (
                    <tr key={row.product_id} className="border-t border-border/60">
                      <td className="px-5 py-3 font-medium">{row.product_name}</td>
                      <td className="px-5 py-3">{row.orders_count.toLocaleString()}</td>
                      <td className="px-5 py-3">{row.units_sold.toLocaleString()}</td>
                      <td className="px-5 py-3">{money(row.delivered_revenue)}</td>
                      <td className="px-5 py-3">
                        {row.orders_count > 0 ? `${Math.round((100 * row.items_delivered) / Math.max(row.units_sold, 1))}%` : '—'}
                      </td>
                      <td className="px-5 py-3">{row.items_with_cost_data > 0 ? money(row.gross_profit) : 'Not available'}</td>
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
