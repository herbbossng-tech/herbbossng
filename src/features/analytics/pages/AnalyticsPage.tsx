import { Lock } from 'lucide-react'
import * as React from 'react'

import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter, type DateRangePreset } from '@/features/finance/components/DateRangeFilter'
import { RevenueTrendChart } from '@/features/finance/components/RevenueTrendChart'
import { resolveDateRange } from '@/features/finance/dateRanges'
import {
  useCustomerAnalytics,
  useDeliveryFunnelStats,
  useFinanceSummary,
  useLandingPageAnalytics,
  useOrderStatusValueBreakdown,
  useProductPerformance,
  useRevenueTrend,
} from '@/features/finance/hooks'
import { orderStatusLabels } from '@/features/orders/statusMeta'
import { useRescueFunnel, useSupportAnalytics } from '@/features/support/hooks'
import { formatCurrency } from '@/lib/currency'
import { formatRatio, safeRatePct } from '@/lib/financeMath'

export function AnalyticsPage() {
  const canView = usePermission('analytics.view')

  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Analytics is hidden" description="You don't have permission to view analytics in this workspace. Ask a workspace admin for the analytics.view permission." />
      </Card>
    )
  }

  return <AnalyticsContent />
}

function AnalyticsContent() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code

  const [preset, setPreset] = React.useState<DateRangePreset>('last30days')
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')

  const range = React.useMemo(
    () => resolveDateRange(preset, activeWorkspace.timezone || 'UTC', { from: customFrom, to: customTo }),
    [preset, customFrom, customTo, activeWorkspace.timezone],
  )
  const dateRange = { dateFrom: range.from, dateTo: range.to }

  const { data: summary, isLoading: summaryLoading } = useFinanceSummary(dateRange)
  const { data: statusBreakdown } = useOrderStatusValueBreakdown(dateRange)
  const { data: funnel } = useDeliveryFunnelStats(dateRange)
  const { data: trend } = useRevenueTrend(dateRange, 'day')
  const { data: products, isLoading: productsLoading } = useProductPerformance(dateRange)
  const { data: customerStats, isLoading: customerLoading } = useCustomerAnalytics(dateRange)
  const { data: landingPages, isLoading: lpLoading } = useLandingPageAnalytics(dateRange)

  const days = Math.max(1, Math.ceil((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000))
  const canViewSupport = usePermission('support.view')
  const { data: supportAnalytics, isLoading: supportLoading } = useSupportAnalytics(days)
  const { data: rescueFunnel, isLoading: rescueFunnelLoading } = useRescueFunnel(days)

  const money = (n: number | undefined) => (n === undefined ? '—' : formatCurrency(n, currency))
  const count = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString())

  const funnelByStage = new Map((funnel ?? []).map((f) => [f.stage, f]))
  const created = funnelByStage.get('CREATED')?.order_count ?? 0
  const confirmed = funnelByStage.get('CONFIRMED')?.order_count ?? 0
  const dispatched = funnelByStage.get('DISPATCHED')?.order_count ?? 0
  const delivered = funnelByStage.get('DELIVERED')?.order_count ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational answers for <span className="font-semibold text-foreground">{activeWorkspace.name}</span> — sales, delivery, products, customers and funnels.
          </p>
        </div>
        <DateRangeFilter
          value={range}
          onChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomChange={(f, t) => {
            setCustomFrom(f)
            setCustomTo(t)
            setPreset('custom')
          }}
        />
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="funnels">Funnels</TabsTrigger>
          {canViewSupport && <TabsTrigger value="support">Support &amp; Rescue</TabsTrigger>}
        </TabsList>

        {/* Sales Analytics */}
        <TabsContent value="sales">
          {summaryLoading || !summary ? (
            <LoadingState label="Loading sales analytics…" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total Sales Value" value={money(summary.total_sales_value)} sub={`${count(summary.total_orders)} orders`} icon="dollar" />
                <StatCard label="Delivered Revenue" value={money(summary.delivered_revenue)} icon="wallet" highlight />
                <StatCard label="Pending Revenue" value={money(summary.pending_revenue)} icon="clock" />
                <StatCard label="Gross Profit" value={money(summary.gross_profit)} sub={`Margin ${summary.gross_margin_pct}% (delivered only)`} icon="percent" />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revenue Trend</CardTitle>
                  <CardDescription>Sales value, delivered revenue, and pending revenue over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {!trend || trend.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p> : <RevenueTrendChart data={trend} currencyCode={currency} />}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Order Analytics */}
        <TabsContent value="orders">
          {summaryLoading || !summary ? (
            <LoadingState label="Loading order analytics…" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Created" value={count(created)} icon="cart" compact />
                <StatCard label="Confirmed" value={count(confirmed)} icon="check" compact />
                <StatCard label="Dispatched" value={count(dispatched)} icon="boxes" compact />
                <StatCard label="Delivered" value={count(delivered)} icon="check" compact tone="success" />
                <StatCard label="Returned" value={count(summary.returned_orders)} icon="cart" compact tone="warning" />
                <StatCard label="Cancelled" value={count(summary.cancelled_orders)} icon="cart" compact />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Orders by Status</CardTitle>
                  <CardDescription>Count and value per lifecycle status, this period</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-5 py-2.5 font-semibold">Status</th>
                          <th className="px-5 py-2.5 text-right font-semibold">Orders</th>
                          <th className="px-5 py-2.5 text-right font-semibold">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(statusBreakdown ?? []).map((row) => (
                          <tr key={row.status} className="border-t border-border/60">
                            <td className="px-5 py-2.5">{orderStatusLabels[row.status] ?? row.status}</td>
                            <td className="px-5 py-2.5 text-right">{row.order_count.toLocaleString()}</td>
                            <td className="px-5 py-2.5 text-right font-semibold">{formatCurrency(row.order_value, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Delivery Analytics */}
        <TabsContent value="delivery">
          {summaryLoading || !summary ? (
            <LoadingState label="Loading delivery analytics…" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <RateCard label="Confirmation Rate" pct={safeRatePct(confirmed, created)} ratio={formatRatio(confirmed, created)} />
              <RateCard label="Dispatch Rate" pct={safeRatePct(dispatched, confirmed)} ratio={formatRatio(dispatched, confirmed)} />
              <RateCard label="Delivery Success Rate" pct={summary.delivery_success_rate} ratio={formatRatio(summary.rate_delivered_count, summary.rate_eligible_count)} tone="success" />
              <RateCard label="Return Rate" pct={summary.return_rate} ratio={formatRatio(summary.rate_returned_count, summary.rate_eligible_count)} tone="warning" />
              <RateCard label="Cancellation Rate" pct={summary.cancellation_rate} ratio={formatRatio(summary.rate_cancelled_count, summary.rate_eligible_count)} />
              <RateCard label="Average Delivered Order Value" pct={null} value={money(summary.average_delivered_order_value)} />
            </div>
          )}
        </TabsContent>

        {/* Product Analytics */}
        <TabsContent value="products">
          {productsLoading ? (
            <LoadingState label="Loading product analytics…" />
          ) : (products ?? []).length === 0 ? (
            <EmptyState icon={Lock} title="No product sales yet" description="Product performance will appear here once orders come in for this period." />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Products</CardTitle>
                <CardDescription>Ranked by sales value, this period</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2.5 font-semibold">Product</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Orders</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Units</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Sales Value</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Delivered Revenue</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Cancel Rate</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Available Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(products ?? []).map((p) => (
                        <tr key={p.product_id} className="border-t border-border/60">
                          <td className="px-5 py-2.5">
                            <p className="font-medium">{p.product_name}</p>
                            <p className="text-xs text-muted-foreground">{p.sku ?? '—'}</p>
                          </td>
                          <td className="px-5 py-2.5 text-right">{p.orders_count.toLocaleString()}</td>
                          <td className="px-5 py-2.5 text-right">{p.units_sold.toLocaleString()}</td>
                          <td className="px-5 py-2.5 text-right font-semibold">{formatCurrency(p.sales_value, currency)}</td>
                          <td className="px-5 py-2.5 text-right">{formatCurrency(p.delivered_revenue, currency)}</td>
                          <td className="px-5 py-2.5 text-right">{p.cancellation_rate}%</td>
                          <td className="px-5 py-2.5 text-right">{p.available_quantity ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Customer Analytics */}
        <TabsContent value="customers">
          {customerLoading || !customerStats ? (
            <LoadingState label="Loading customer analytics…" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total Customers" value={count(customerStats.total_customers)} sub="All-time" icon="userCheck" />
              <StatCard label="New Customers" value={count(customerStats.new_customers)} sub="This period" icon="userCheck" />
              <StatCard label="Repeat Customers" value={count(customerStats.repeat_customers)} sub={`${customerStats.repeat_order_rate}% repeat rate`} icon="check" />
              <StatCard label="Avg Orders / Customer" value={customerStats.avg_orders_per_customer.toString()} icon="cart" />
              <StatCard label="Customer Revenue" value={money(customerStats.customer_revenue)} sub="All-time, all orders" icon="dollar" />
              <StatCard label="Delivered Customer Revenue" value={money(customerStats.delivered_customer_revenue)} sub="All-time, delivered only" icon="wallet" highlight />
            </div>
          )}
        </TabsContent>

        {/* Funnel / Landing Page Analytics */}
        <TabsContent value="funnels">
          {lpLoading ? (
            <LoadingState label="Loading funnel analytics…" />
          ) : (landingPages ?? []).length === 0 ? (
            <EmptyState icon={Lock} title="No landing page orders yet" description="Orders attributed to a landing page/funnel will appear here." />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Landing Page Performance</CardTitle>
                <CardDescription>Orders attributed to each funnel — first-party GCOS data only, no ad-platform integration</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2.5 font-semibold">Landing Page</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Orders</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Sales Value</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Delivered Revenue</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Pending Revenue</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Returned</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Cancelled</th>
                        <th className="px-5 py-2.5 text-right font-semibold">AOV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(landingPages ?? []).map((lp) => (
                        <tr key={lp.landing_page_id} className="border-t border-border/60">
                          <td className="px-5 py-2.5">
                            <p className="font-medium">{lp.landing_page_name}</p>
                            <p className="text-xs text-muted-foreground">/l/{lp.landing_page_slug}</p>
                          </td>
                          <td className="px-5 py-2.5 text-right">{lp.orders_count.toLocaleString()}</td>
                          <td className="px-5 py-2.5 text-right font-semibold">{formatCurrency(lp.sales_value, currency)}</td>
                          <td className="px-5 py-2.5 text-right">{formatCurrency(lp.delivered_revenue, currency)}</td>
                          <td className="px-5 py-2.5 text-right">{formatCurrency(lp.pending_revenue, currency)}</td>
                          <td className="px-5 py-2.5 text-right">{lp.returned_orders}</td>
                          <td className="px-5 py-2.5 text-right">{lp.cancelled_orders}</td>
                          <td className="px-5 py-2.5 text-right">{formatCurrency(lp.average_order_value, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {canViewSupport && (
          <TabsContent value="support">
            {supportLoading || rescueFunnelLoading || !supportAnalytics || !rescueFunnel ? (
              <LoadingState label="Loading support & rescue analytics…" />
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <RateCard
                    label="Contact Rate"
                    pct={safeRatePct(supportAnalytics.orders_contacted, supportAnalytics.orders_in_scope)}
                    ratio={formatRatio(supportAnalytics.orders_contacted, supportAnalytics.orders_in_scope)}
                  />
                  <RateCard
                    label="Confirmation Recovery"
                    pct={safeRatePct(supportAnalytics.confirmation_calls_confirmed, supportAnalytics.confirmation_calls_total)}
                    ratio={formatRatio(supportAnalytics.confirmation_calls_confirmed, supportAnalytics.confirmation_calls_total)}
                  />
                  <RateCard
                    label="Rescue Rate"
                    pct={safeRatePct(supportAnalytics.rescue_successful, supportAnalytics.rescue_opportunities_opened)}
                    ratio={formatRatio(supportAnalytics.rescue_successful, supportAnalytics.rescue_opportunities_opened)}
                    tone="success"
                  />
                  <RateCard
                    label="Overdue Rate"
                    pct={safeRatePct(supportAnalytics.overdue_tasks_current, supportAnalytics.open_tasks_current)}
                    ratio={formatRatio(supportAnalytics.overdue_tasks_current, supportAnalytics.open_tasks_current)}
                    tone="warning"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Support Volume" value={supportAnalytics.support_interactions_total.toLocaleString()} icon="phone" compact />
                  <StatCard label="Rescue Opportunities" value={supportAnalytics.rescue_opportunities_opened.toLocaleString()} icon="userCheck" compact />
                  <StatCard label="Successful Rescues" value={supportAnalytics.rescue_successful.toLocaleString()} icon="check" compact tone="success" />
                  <StatCard
                    label="Avg Resolution Time"
                    value={supportAnalytics.rescue_avg_resolution_hours !== null ? `${supportAnalytics.rescue_avg_resolution_hours.toFixed(1)}h` : '—'}
                    icon="clock"
                    compact
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rescue Funnel</CardTitle>
                    <CardDescription>
                      Opportunities → Contacted → Customer Reached → Rescheduled/Fixed → Returned to Delivery → Delivered / Lost. Each rescue case is
                      counted once per stage it has ever reached — never double-counted.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: 'Opportunities', value: rescueFunnel.opportunities },
                        { label: 'Contacted', value: rescueFunnel.contacted },
                        { label: 'Customer Reached', value: rescueFunnel.customer_reached },
                        { label: 'Rescheduled / Fixed', value: rescueFunnel.rescheduled_or_fixed },
                        { label: 'Returned to Delivery', value: rescueFunnel.returned_to_delivery },
                        { label: 'Delivered', value: rescueFunnel.delivered },
                      ].map((stage) => {
                        const pct = rescueFunnel.opportunities ? Math.round((stage.value / rescueFunnel.opportunities) * 100) : 0
                        return (
                          <div key={stage.label} className="flex items-center gap-3">
                            <span className="w-40 shrink-0 text-xs text-muted-foreground">{stage.label}</span>
                            <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                              <div className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-24 shrink-0 text-right text-xs font-medium text-foreground">
                              {stage.value.toLocaleString()} ({pct}%)
                            </span>
                          </div>
                        )
                      })}
                      {rescueFunnel.lost > 0 && (
                        <p className="mt-1 text-xs text-destructive">{rescueFunnel.lost.toLocaleString()} rescue case(s) lost — not counted toward Delivered.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function RateCard({ label, pct, ratio, value, tone }: { label: string; pct: number | null; ratio?: string; value?: string; tone?: 'success' | 'warning' }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-foreground'}`}>
        {pct !== null ? `${pct}%` : value}
      </p>
      {ratio && <p className="mt-1 text-xs text-muted-foreground">{ratio}</p>}
    </Card>
  )
}
