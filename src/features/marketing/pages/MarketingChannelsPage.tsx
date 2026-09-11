import { Share2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter } from '@/features/finance/components/DateRangeFilter'
import { useMarketingDateRange } from '@/features/marketing/dateRange'
import { useMarketingChannelPerformance } from '@/features/marketing/hooks'
import { formatCurrency } from '@/lib/currency'

const CHANNEL_LABELS: Record<string, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  google: 'Google',
  affiliate: 'Affiliate',
  organic: 'Organic',
  direct: 'Direct',
  whatsapp: 'WhatsApp',
  other: 'Other',
}

export function MarketingChannelsPage() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { setPreset, customFrom, customTo, setCustom, resolved, range } = useMarketingDateRange()
  const { data: rows, isLoading, isError, refetch } = useMarketingChannelPerformance(range)

  const money = (n: number | null) => (n === null ? '—' : formatCurrency(n, currency))
  const ratio = (n: number | null, suffix: string) => (n === null ? '—' : `${n.toLocaleString()}${suffix}`)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Channel &amp; Source Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Where delivered cash actually came from — paid campaigns, affiliate, organic and direct.</p>
      </div>
      <DateRangeFilter value={resolved} onChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomChange={setCustom} />

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load channel performance." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading channel performance…" />
            </div>
          ) : (rows?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Share2} title="No channel activity yet" description="No orders or spend recorded in this date range." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Channel</th>
                    <th className="px-5 py-3 font-semibold">Spend</th>
                    <th className="px-5 py-3 font-semibold">Orders</th>
                    <th className="px-5 py-3 font-semibold">Delivered</th>
                    <th className="px-5 py-3 font-semibold">Delivered Revenue</th>
                    <th className="px-5 py-3 font-semibold">Delivered CPA</th>
                    <th className="px-5 py-3 font-semibold">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row) => (
                    <tr key={row.channel} className="border-t border-border/60">
                      <td className="px-5 py-3 font-medium">{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                      <td className="px-5 py-3">{money(row.spend)}</td>
                      <td className="px-5 py-3">{row.orders_created.toLocaleString()}</td>
                      <td className="px-5 py-3">{row.delivered_orders.toLocaleString()}</td>
                      <td className="px-5 py-3">{money(row.delivered_revenue)}</td>
                      <td className="px-5 py-3">{money(row.delivered_cpa)}</td>
                      <td className="px-5 py-3">{ratio(row.roas, 'x')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Spend is only shown for a channel where it was actually recorded against a marketing campaign of that channel — affiliate commission is
        never counted here as advertising spend.
      </p>
    </div>
  )
}
