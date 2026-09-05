import { ArrowLeft, ExternalLink, ShoppingCart } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { PermissionGate } from '@/contexts/PermissionsContext'
import { useMarketingCampaignDetail, useMarketingTrend, useSetMarketingCampaignStatus } from '@/features/marketing/hooks'
import { formatCurrency } from '@/lib/currency'
import type { MarketingCampaignStatus } from '@/types/database'

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'secondary',
  archived: 'destructive',
}

const STATUS_OPTIONS: MarketingCampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'archived']

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold text-foreground">{value}</span>
    </div>
  )
}

export function MarketingCampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { activeWorkspace, activeBrand } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { data: campaign, isLoading, isError, refetch } = useMarketingCampaignDetail(id)
  const { data: trend } = useMarketingTrend(id ?? null, { dateFrom: null, dateTo: null })
  const setStatus = useSetMarketingCampaignStatus(id ?? '')

  if (isLoading) return <LoadingState label="Loading campaign…" />
  if (isError || !campaign) return <ErrorState message="Couldn't load this campaign." onRetry={() => refetch()} />

  const money = (n: number | null) => (n === null ? '—' : formatCurrency(n, currency))
  const count = (n: number) => n.toLocaleString()
  const ratio = (n: number | null, suffix: string) => (n === null ? '—' : `${n.toLocaleString()}${suffix}`)

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to="/marketing/campaigns">
          <ArrowLeft className="h-4 w-4" />
          Back to Campaigns
        </Link>
      </Button>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{campaign.name}</h1>
            <Badge variant={STATUS_TONE[campaign.status] ?? 'secondary'}>{campaign.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaign.channel} · {campaign.market_country_code ?? activeBrand?.name} ·{' '}
            {campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : 'No start date'}
            {campaign.end_date ? ` – ${new Date(campaign.end_date).toLocaleDateString()}` : ''}
          </p>
        </div>
        <PermissionGate permission="marketing.update">
          <div className="flex items-center gap-2">
            {STATUS_OPTIONS.filter((s) => s !== campaign.status).map((s) => (
              <Button key={s} size="sm" variant="outline" onClick={() => setStatus.mutate(s)} disabled={setStatus.isPending}>
                Mark {s}
              </Button>
            ))}
          </div>
        </PermissionGate>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Spend" value={money(campaign.spend)} />
          <Metric label="Orders Created" value={count(campaign.orders_created)} />
          <Metric label="Delivered Orders" value={count(campaign.delivered_orders)} />
          <Metric label="Delivered Revenue" value={money(campaign.delivered_revenue)} />
          <Metric label="Delivered CPA" value={money(campaign.delivered_cpa)} />
          <Metric label="ROAS" value={ratio(campaign.roas, 'x')} />
          <Metric label="Delivery Rate" value={ratio(campaign.delivery_rate_pct, '%')} />
          <Metric label="Cancellation Rate" value={ratio(campaign.cancellation_rate_pct, '%')} />
          <Metric label="Return Rate" value={ratio(campaign.return_rate_pct, '%')} />
          <Metric label="Total Order Value" value={money(campaign.total_order_value)} />
          <Metric label="Average Order Value" value={money(campaign.average_order_value)} />
          <Metric label="Initial CPA" value={money(campaign.initial_cpa)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funnel</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Metric label="Landing Page Views" value={count(campaign.landing_page_views)} />
          <Metric label="Form Starts" value={count(campaign.landing_page_form_starts)} />
          <Metric label="Orders Created" value={count(campaign.orders_created)} />
          <Metric label="Confirmed" value={count(campaign.confirmed_orders)} />
          <Metric label="Dispatched" value={count(campaign.dispatched_orders)} />
          <Metric label="Delivered" value={count(campaign.delivered_orders)} />
        </CardContent>
        {campaign.landing_page_id && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Landing page views/form starts are the landing page's own traffic in this campaign's date range (all sources), not exclusive to this
              campaign.
            </p>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attribution</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="UTM Campaign" value={campaign.utm_campaign ?? 'Not set'} />
            <Row label="External Campaign ID" value={campaign.external_campaign_id ?? 'Not set'} />
            <Row label="Product" value={campaign.product_name ?? 'Not set'} />
            <Row label="Landing Page" value={campaign.landing_page_name ?? 'Not set'} />
            <Row label="Affiliate Campaign" value={campaign.affiliate_campaign_name ?? 'Not linked'} />
            <Row label="Media Buyer" value={campaign.media_buyer_name ?? 'Unassigned'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Economics</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Delivered Revenue" value={money(campaign.delivered_revenue)} />
            <Row label="COGS (delivered)" value={money(campaign.cogs_delivered)} />
            <Row label="Delivery Cost (delivered)" value={campaign.delivery_cost_delivered === null ? 'Not configured' : money(campaign.delivery_cost_delivered)} />
            <Row label="Affiliate Commission" value={money(campaign.affiliate_commission)} />
            <Row label="Marketing Spend" value={money(campaign.spend)} />
            <Row
              label="Contribution Profit"
              value={campaign.profit_data_available ? money(campaign.contribution_profit) : 'Not available — missing delivery cost data'}
            />
          </CardContent>
        </Card>
      </div>

      {(campaign.target_orders || campaign.target_delivered_orders || campaign.target_delivered_revenue || campaign.target_delivered_roas) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Targets: Actual vs Target</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {campaign.target_orders !== null && (
              <Metric label="Orders (Actual / Target)" value={`${count(campaign.orders_created)} / ${count(campaign.target_orders)}`} />
            )}
            {campaign.target_delivered_orders !== null && (
              <Metric label="Delivered (Actual / Target)" value={`${count(campaign.delivered_orders)} / ${count(campaign.target_delivered_orders)}`} />
            )}
            {campaign.target_delivered_revenue !== null && (
              <Metric label="Delivered Revenue (Actual / Target)" value={`${money(campaign.delivered_revenue)} / ${money(campaign.target_delivered_revenue)}`} />
            )}
            {campaign.target_delivered_roas !== null && (
              <Metric label="ROAS (Actual / Target)" value={`${ratio(campaign.roas, 'x')} / ${campaign.target_delivered_roas}x`} />
            )}
          </CardContent>
        </Card>
      )}

      {trend && trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trend</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
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
                    <td className="py-2 pr-4">{row.orders_created.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.delivered_orders.toLocaleString()}</td>
                    <td className="py-2 pr-4">{money(row.delivered_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {campaign.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{campaign.notes}</CardContent>
        </Card>
      )}

      <Button variant="outline" size="sm" asChild className="w-fit">
        <Link to="/settings/integrations">
          <ExternalLink className="h-3.5 w-3.5" />
          View Integration Health
        </Link>
      </Button>

      {!campaign.orders_created && (
        <Card className="p-6">
          <EmptyState icon={ShoppingCart} title="No orders attributed yet" description="Orders are attributed by matching the UTM Campaign value above against incoming order attribution." />
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
