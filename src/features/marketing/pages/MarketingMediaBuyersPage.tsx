import { UserCheck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter } from '@/features/finance/components/DateRangeFilter'
import { useMarketingDateRange } from '@/features/marketing/dateRange'
import { useMarketingMediaBuyerPerformance } from '@/features/marketing/hooks'
import { formatCurrency } from '@/lib/currency'

export function MarketingMediaBuyersPage() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { setPreset, customFrom, customTo, setCustom, resolved, range } = useMarketingDateRange()
  const { data: rows, isLoading, isError, refetch } = useMarketingMediaBuyerPerformance(range)

  const money = (n: number | null) => (n === null ? '—' : formatCurrency(n, currency))
  const ratio = (n: number | null, suffix: string) => (n === null ? '—' : `${n.toLocaleString()}${suffix}`)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Media Buyer Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Performance of campaigns assigned to each media buyer. Assign a media buyer from a campaign's detail page.</p>
      </div>
      <DateRangeFilter value={resolved} onChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomChange={setCustom} />

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load media buyer performance." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading media buyer performance…" />
            </div>
          ) : (rows?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={UserCheck} title="No media buyers assigned yet" description="Assign a campaign to a staff member to see their performance here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Media Buyer</th>
                    <th className="px-5 py-3 font-semibold">Campaigns</th>
                    <th className="px-5 py-3 font-semibold">Spend</th>
                    <th className="px-5 py-3 font-semibold">Orders</th>
                    <th className="px-5 py-3 font-semibold">Delivered</th>
                    <th className="px-5 py-3 font-semibold">Delivered Revenue</th>
                    <th className="px-5 py-3 font-semibold">Delivered CPA</th>
                    <th className="px-5 py-3 font-semibold">ROAS</th>
                    <th className="px-5 py-3 font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row) => (
                    <tr key={row.media_buyer_id} className="border-t border-border/60">
                      <td className="px-5 py-3 font-medium">{row.media_buyer_name ?? 'Unnamed staff'}</td>
                      <td className="px-5 py-3">{row.campaigns_count.toLocaleString()}</td>
                      <td className="px-5 py-3">{money(row.spend)}</td>
                      <td className="px-5 py-3">{row.orders_created.toLocaleString()}</td>
                      <td className="px-5 py-3">{row.delivered_orders.toLocaleString()}</td>
                      <td className="px-5 py-3">{money(row.delivered_revenue)}</td>
                      <td className="px-5 py-3">{money(row.delivered_cpa)}</td>
                      <td className="px-5 py-3">{ratio(row.roas, 'x')}</td>
                      <td className="px-5 py-3">{money(row.contribution_profit)}</td>
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
