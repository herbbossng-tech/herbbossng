import { Download, Lock, Receipt } from 'lucide-react'
import * as React from 'react'

import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter, type DateRangePreset } from '@/features/finance/components/DateRangeFilter'
import { RevenueTrendChart } from '@/features/finance/components/RevenueTrendChart'
import { resolveDateRange } from '@/features/finance/dateRanges'
import {
  useDeliveryFunnelStats,
  useFinanceSummary,
  useFinanceTransactions,
  useOrderStatusValueBreakdown,
  useRevenueTrend,
} from '@/features/finance/hooks'
import { orderStatusLabels } from '@/features/orders/statusMeta'
import { formatCurrency } from '@/lib/currency'
import { exportToCsv } from '@/lib/csv'
import { formatRatio, safeRatePct } from '@/lib/financeMath'
import type { DeliveryFunnelStage } from '@/types/database'

const FUNNEL_STAGE_LABELS: Record<DeliveryFunnelStage, string> = {
  CREATED: 'Orders Created',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CASH_COLLECTED: 'Cash Collected',
}

export function FinancePage() {
  const canView = usePermission('finance.view')

  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={Lock}
          title="Finance is hidden"
          description="You don't have permission to view financial figures in this workspace. Ask a workspace admin for the finance.view permission."
        />
      </Card>
    )
  }

  return <FinanceContent />
}

function FinanceContent() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const canExport = usePermission('finance.export')

  const [preset, setPreset] = React.useState<DateRangePreset>('last30days')
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')

  const range = React.useMemo(
    () => resolveDateRange(preset, activeWorkspace.timezone || 'UTC', { from: customFrom, to: customTo }),
    [preset, customFrom, customTo, activeWorkspace.timezone],
  )
  const dateRange = { dateFrom: range.from, dateTo: range.to }

  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useFinanceSummary(dateRange)
  const { data: statusBreakdown } = useOrderStatusValueBreakdown(dateRange)
  const { data: funnel } = useDeliveryFunnelStats(dateRange)
  const { data: trend } = useRevenueTrend(dateRange, preset === 'thisYear' || preset === 'lastMonth' ? 'week' : 'day')
  const { data: transactions, isLoading: txLoading } = useFinanceTransactions(dateRange, 1)

  const money = (n: number | undefined) => (summaryLoading || n === undefined ? '—' : formatCurrency(n, currency))
  const count = (n: number | undefined) => (summaryLoading || n === undefined ? '—' : n.toLocaleString())

  function handleExportSummary() {
    if (!summary) return
    exportToCsv(`finance-summary-${new Date().toISOString().slice(0, 10)}.csv`, [
      {
        date_range: `${range.from ?? 'all-time'} to ${range.to ?? 'now'}`,
        currency,
        total_sales_value: summary.total_sales_value,
        total_orders: summary.total_orders,
        delivered_revenue: summary.delivered_revenue,
        delivered_orders: summary.delivered_orders,
        pending_revenue: summary.pending_revenue,
        pending_orders: summary.pending_orders,
        returned_value: summary.returned_value,
        returned_orders: summary.returned_orders,
        cancelled_value: summary.cancelled_value,
        cancelled_orders: summary.cancelled_orders,
        average_order_value: summary.average_order_value,
        average_delivered_order_value: summary.average_delivered_order_value,
        cogs_delivered: summary.cogs_delivered,
        gross_profit: summary.gross_profit,
        gross_margin_pct: summary.gross_margin_pct,
        delivery_success_rate: summary.delivery_success_rate,
        return_rate: summary.return_rate,
        cancellation_rate: summary.cancellation_rate,
      },
    ])
  }

  function handleExportTransactions() {
    if (!transactions || transactions.rows.length === 0) return
    exportToCsv(
      `finance-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      transactions.rows.map((t) => ({
        date: t.created_at,
        order_number: t.order?.order_number ?? '',
        customer: t.order?.customer_name ?? '',
        event_type: t.event_type,
        from_status: t.from_status ?? '',
        to_status: t.to_status ?? '',
        description: t.description,
        order_value: t.order?.total_amount ?? '',
        currency: t.order?.currency_code ?? currency,
      })),
    )
  }

  if (summaryError) {
    return <ErrorState message="Couldn't load finance data." onRetry={() => refetchSummary()} />
  }

  const breakdownTotal = summary
    ? summary.delivered_revenue + summary.pending_revenue + summary.returned_value + summary.cancelled_value
    : 0

  const funnelByStage = new Map((funnel ?? []).map((f) => [f.stage, f]))
  const stageOrder: DeliveryFunnelStage[] = ['CREATED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CASH_COLLECTED']

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Finance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            COD financial command center for <span className="font-semibold text-foreground">{activeWorkspace.name}</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExportSummary} disabled={!summary}>
              <Download className="h-4 w-4" />
              Export Summary
            </Button>
          )}
        </div>
      </div>

      {summaryLoading && <LoadingState label="Loading finance data…" />}

      {!summaryLoading && summary && (
        <>
          {/* Primary KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Sales Value" value={money(summary.total_sales_value)} sub={`${count(summary.total_orders)} orders`} icon="dollar" />
            <StatCard label="Delivered Revenue" value={money(summary.delivered_revenue)} sub={`${count(summary.delivered_orders)} delivered`} icon="wallet" highlight />
            <StatCard label="Pending Revenue" value={money(summary.pending_revenue)} sub={`${count(summary.pending_orders)} in pipeline`} icon="clock" />
            <StatCard label="Average Order Value" value={money(summary.average_order_value)} sub={`Delivered AOV: ${money(summary.average_delivered_order_value)}`} icon="percent" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Returned Value" value={money(summary.returned_value)} sub={`${count(summary.returned_orders)} orders`} icon="cart" compact tone="warning" />
            <StatCard label="Cancelled Value" value={money(summary.cancelled_value)} sub={`${count(summary.cancelled_orders)} orders`} icon="cart" compact tone="default" />
            <StatCard label="Delivery Success Rate" value={`${summary.delivery_success_rate}%`} sub={formatRatio(summary.rate_delivered_count, summary.rate_eligible_count)} icon="check" compact tone="success" />
            <StatCard label="Gross Profit (Delivered)" value={money(summary.gross_profit)} sub={`Margin ${summary.gross_margin_pct}%`} icon="wallet" compact tone="purple" />
          </div>

          {/* Financial breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financial Breakdown</CardTitle>
              <CardDescription>Where the money is: Delivered vs. Pending vs. Returned vs. Cancelled, this period</CardDescription>
            </CardHeader>
            <CardContent>
              {breakdownTotal === 0 ? (
                <p className="text-sm text-muted-foreground">No order value in this period yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="bg-success" style={{ width: `${safeRatePct(summary.delivered_revenue, breakdownTotal)}%` }} />
                    <div className="bg-warning" style={{ width: `${safeRatePct(summary.pending_revenue, breakdownTotal)}%` }} />
                    <div className="bg-destructive" style={{ width: `${safeRatePct(summary.returned_value, breakdownTotal)}%` }} />
                    <div className="bg-muted-foreground/40" style={{ width: `${safeRatePct(summary.cancelled_value, breakdownTotal)}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <BreakdownLegend swatch="bg-success" label="Delivered" value={money(summary.delivered_revenue)} />
                    <BreakdownLegend swatch="bg-warning" label="Pending" value={money(summary.pending_revenue)} />
                    <BreakdownLegend swatch="bg-destructive" label="Returned" value={money(summary.returned_value)} />
                    <BreakdownLegend swatch="bg-muted-foreground/40" label="Cancelled" value={money(summary.cancelled_value)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Trend</CardTitle>
              <CardDescription>What we're selling vs. what we're actually collecting vs. what's still outstanding</CardDescription>
            </CardHeader>
            <CardContent>
              {!trend || trend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No revenue data in this period yet.</p>
              ) : (
                <RevenueTrendChart data={trend} currencyCode={currency} />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Delivery funnel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery Financial Funnel</CardTitle>
                <CardDescription>Orders Created → Confirmed → Dispatched → Delivered → Cash Collected</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {stageOrder.map((stage, i) => {
                  const s = funnelByStage.get(stage)
                  const prev = i > 0 ? funnelByStage.get(stageOrder[i - 1]) : undefined
                  const conversionPct = prev ? safeRatePct(s?.order_count ?? 0, prev.order_count) : null
                  const widthPct = i === 0 ? 100 : safeRatePct(s?.order_count ?? 0, funnelByStage.get('CREATED')?.order_count ?? 0)
                  return (
                    <div key={stage}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{FUNNEL_STAGE_LABELS[stage]}</span>
                        <span className="font-semibold">
                          {(s?.order_count ?? 0).toLocaleString()} · {money(s?.order_value)}
                          {conversionPct !== null && <span className="ml-2 text-xs text-muted-foreground">({conversionPct}% of prev.)</span>}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${widthPct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Order status value breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Order Status Value Breakdown</CardTitle>
                <CardDescription>Value currently sitting in each lifecycle status</CardDescription>
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

          {/* Profitability foundation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profitability</CardTitle>
              <CardDescription>Gross profit is only recognized on delivered/collected orders — never in-flight or returned ones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <ProfitStat label="Delivered Revenue" value={money(summary.delivered_revenue)} />
                <ProfitStat label="Cost of Goods Sold" value={money(summary.cogs_delivered)} />
                <ProfitStat label="Gross Profit" value={money(summary.gross_profit)} highlight />
                <ProfitStat label="Gross Margin" value={`${summary.gross_margin_pct}%`} />
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                {summary.contribution_profit_orders_count > 0 ? (
                  <>
                    Contribution profit (Revenue − COGS − Delivery Cost): <span className="font-semibold text-foreground">{money(summary.contribution_profit)}</span>{' '}
                    — based on {summary.contribution_profit_orders_count} of {summary.delivered_orders} delivered orders with a recorded delivery cost.
                  </>
                ) : (
                  <>
                    Contribution profit not configured — no order has an actual delivery/courier cost recorded yet. Once delivery costs are tracked, this
                    figure will compute automatically without needing another change here.
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Finance transaction ledger */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Finance Transaction Ledger</CardTitle>
                <CardDescription>Order-created, status-change and cash-collection events, most recent first</CardDescription>
              </div>
              {canExport && (
                <Button variant="outline" size="sm" onClick={handleExportTransactions} disabled={!transactions || transactions.rows.length === 0}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {txLoading && (
                <div className="px-5 py-8">
                  <LoadingState label="Loading ledger…" />
                </div>
              )}
              {!txLoading && (transactions?.rows.length ?? 0) === 0 && (
                <div className="px-5 py-8">
                  <EmptyState icon={Receipt} title="No financial events yet" description="Order-created, status-change and cash-collection events will appear here." />
                </div>
              )}
              {!txLoading && (transactions?.rows.length ?? 0) > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2.5 font-semibold">Date</th>
                        <th className="px-5 py-2.5 font-semibold">Order</th>
                        <th className="px-5 py-2.5 font-semibold">Event</th>
                        <th className="px-5 py-2.5 font-semibold">Description</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Order Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions?.rows.map((t) => (
                        <tr key={t.id} className="border-t border-border/60">
                          <td className="px-5 py-2.5 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                          <td className="px-5 py-2.5 font-mono text-xs">{t.order?.order_number ?? '—'}</td>
                          <td className="px-5 py-2.5">
                            <Badge variant={t.event_type === 'CASH_COLLECTED' ? 'success' : 'outline'}>{t.event_type.replace('_', ' ')}</Badge>
                          </td>
                          <td className="px-5 py-2.5 text-muted-foreground">{t.description}</td>
                          <td className="px-5 py-2.5 text-right font-semibold">{t.order ? formatCurrency(t.order.total_amount, t.order.currency_code) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function BreakdownLegend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  )
}

function ProfitStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-extrabold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}
