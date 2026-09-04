import { AlertTriangle, ExternalLink, Lock, Plus, ShoppingCart, XCircle } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { Progress } from '@/components/ui/progress'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter, type DateRangePreset } from '@/features/finance/components/DateRangeFilter'
import { RevenueTrendChart } from '@/features/finance/components/RevenueTrendChart'
import { resolveDateRange } from '@/features/finance/dateRanges'
import type { FinanceDateRange } from '@/features/finance/api'
import type { DeliveryFunnelStage } from '@/types/database'
import {
  useDeliveryFunnelStats,
  useFinanceSummary,
  useOrderStatusValueBreakdown,
  useProductPerformance,
  useRevenueTrend,
} from '@/features/finance/hooks'
import { useRecentNotifications } from '@/features/notifications/hooks'
import { useWithdrawals } from '@/features/withdrawals/hooks'
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge'
import { useOrders } from '@/features/orders/hooks'
import { useProducts } from '@/features/products/hooks'
import { useSupportSummary } from '@/features/support/hooks'
import { formatCurrency } from '@/lib/currency'
import { formatRatio, safeRatePct } from '@/lib/financeMath'
import { cn } from '@/lib/utils'

const FUNNEL_STAGES: { key: DeliveryFunnelStage; label: string }[] = [
  { key: 'CREATED', label: 'Orders Submitted' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'DISPATCHED', label: 'Dispatched / Out for Delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CASH_COLLECTED', label: 'Delivered & Collected' },
]

function useFinanceVisibility() {
  const canViewFinance = usePermission('finance.view')
  const canViewAnalytics = usePermission('analytics.view')
  const canViewReports = usePermission('reports.view')
  return canViewFinance || canViewAnalytics || canViewReports
}

export function Dashboard() {
  const { activeWorkspace } = useWorkspace()
  const canViewOrders = usePermission('orders.view')

  const [preset, setPreset] = React.useState<DateRangePreset>('last30days')
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')
  const resolved = React.useMemo(
    () => resolveDateRange(preset, activeWorkspace.timezone || 'UTC', { from: customFrom, to: customTo }),
    [preset, customFrom, customTo, activeWorkspace.timezone],
  )
  const range: FinanceDateRange = { dateFrom: resolved.from, dateTo: resolved.to }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            LIVE OPERATIONS ACTIVE
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Golden <span className="text-primary">COD</span> Operations Dashboard
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Store-wide revenue, orders, fulfillment and cash position for{' '}
            <span className="font-semibold text-foreground">{activeWorkspace.name}</span> in the selected period.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          <DateRangeFilter
            value={resolved}
            onChange={setPreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => {
              setCustomFrom(f)
              setCustomTo(t)
              setPreset('custom')
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" />
              Preview Funnels
            </Button>
            <PermissionGate permission="orders.create">
              <Button size="sm" asChild>
                <Link to="/orders/new">
                  <Plus className="h-4 w-4" />
                  Create Order
                </Link>
              </Button>
            </PermissionGate>
          </div>
        </div>
      </div>

      <MoneyOperationsSection range={range} />

      <SupportAttentionRow />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TopProductsCard range={range} />
        <NeedsAttentionCard range={range} />
      </div>

      {canViewOrders ? <RecentOrdersSection /> : <OrdersPermissionNotice />}
    </div>
  )
}

// Deliberately restrained: at most two compact cards, both linking
// into /support for the real detail. Detailed support/rescue
// intelligence belongs on the Support workspace and Analytics tab,
// never sprawled across the Dashboard.
function SupportAttentionRow() {
  const canView = usePermission('support.view')
  const { data: summary } = useSupportSummary()
  if (!canView) return null
  const count = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString())
  return (
    <div className="grid grid-cols-2 gap-3 sm:w-1/2">
      <StatCard label="Support Attention" value={count(summary?.needs_attention_count)} icon="phone" compact href="/support" />
      <StatCard label="Rescue Opportunities" value={count(summary?.rescue_opportunities_count)} icon="userCheck" compact href="/support" />
    </div>
  )
}

function FinanceHiddenNotice() {
  return (
    <Card className="p-8">
      <EmptyState
        icon={Lock}
        title="Financial and delivery metrics are hidden"
        description="You don't have permission to view revenue, operations or delivery figures in this workspace. Ask a workspace admin for the finance.view, analytics.view or reports.view permission."
      />
    </Card>
  )
}

// ---------------------------------------------------------------
// Level 1 (Money) + Level 2 (Operations) + Level 3 (Trends) +
// Level 4 (Delivery Funnel) — all sourced from the SAME three
// already-authoritative, date-range-aware, finance-visibility-gated
// RPCs (get_finance_summary/get_revenue_trend/get_delivery_funnel_stats)
// that already power Finance/Analytics/Reports. No frontend financial
// math beyond reading fields off these responses and simple funnel
// stage-to-stage percentages via the shared safeRatePct utility.
// ---------------------------------------------------------------
function MoneyOperationsSection({ range }: { range: FinanceDateRange }) {
  const canView = useFinanceVisibility()
  if (!canView) return <FinanceHiddenNotice />
  return <MoneyOperationsContent range={range} />
}

function MoneyOperationsContent({ range }: { range: FinanceDateRange }) {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { data: summary, isLoading } = useFinanceSummary(range)
  const { data: trend } = useRevenueTrend(range, 'day')
  const { data: funnel } = useDeliveryFunnelStats(range)

  const money = (n: number | undefined) => (isLoading || n === undefined ? '—' : formatCurrency(n, currency))
  const count = (n: number | undefined) => (isLoading || n === undefined ? '—' : n.toLocaleString())
  const noData = !isLoading && summary !== undefined && summary.total_orders === 0

  const funnelByStage = new Map((funnel ?? []).map((f) => [f.stage, f.order_count]))
  const funnelCounts = FUNNEL_STAGES.map((s) => funnelByStage.get(s.key) ?? 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Level 1: Money */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Money</h2>
        {noData && <p className="mb-3 text-sm text-muted-foreground">No sales data for this period.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Sales Value" value={money(summary?.total_sales_value)} sub="Eligible order value in period" icon="dollar" href="/finance" />
          <StatCard
            label="Delivered Revenue"
            value={money(summary?.delivered_revenue)}
            sub="Realised from delivered & collected orders"
            icon="wallet"
            highlight
            href="/finance"
          />
          <StatCard label="Pending Revenue" value={money(summary?.pending_revenue)} sub="Order value still outstanding" icon="clock" href="/finance" />
          <StatCard
            label="Delivery Success Rate"
            value={isLoading || !summary ? '—' : `${summary.delivery_success_rate}%`}
            sub={summary ? `${formatRatio(summary.rate_delivered_count, summary.rate_eligible_count)} delivered` : undefined}
            icon="percent"
            href="/finance"
          />
        </div>
      </div>

      {/* Level 2: Operations */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Operations</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Orders" value={count(summary?.total_orders)} sub="Eligible orders in period" icon="cart" compact href="/orders" />
          <StatCard
            label="In Progress"
            value={count(summary?.pending_orders)}
            sub="Awaiting confirmation, fulfillment or delivery"
            icon="clock"
            compact
            href="/orders"
          />
          <StatCard label="Delivered" value={count(summary?.delivered_orders)} sub="Delivered & collected" icon="check" compact tone="success" href="/orders" />
          <CancelledReturnedCard cancelled={summary?.cancelled_orders} returned={summary?.returned_orders} loading={isLoading} />
        </div>
      </div>

      {/* Level 3: Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Revenue Overview
          </CardTitle>
          <CardDescription className="mt-1">Order value → realised cash → outstanding value, for the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {!trend || trend.length === 0 || trend.every((t) => t.sales_value === 0 && t.delivered_revenue === 0 && t.pending_revenue === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No sales data for this period.</p>
          ) : (
            <RevenueTrendChart data={trend} currencyCode={currency} />
          )}
        </CardContent>
      </Card>

      {/* Level 4: Delivery Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Funnel</CardTitle>
          <CardDescription className="mt-1">Confirmation-to-cash pipeline for the selected period</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {funnelCounts[0] === 0 ? (
            <p className="text-sm text-muted-foreground">No orders in this period to build a funnel from.</p>
          ) : (
            FUNNEL_STAGES.map((stage, i) => {
              const value = funnelCounts[i]
              const prevValue = funnelCounts[Math.max(i - 1, 0)]
              return (
                <div key={stage.key}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{stage.label}</span>
                    <span className="font-semibold">
                      {value.toLocaleString()}
                      {i > 0 && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          ({safeRatePct(value, prevValue)}% of {FUNNEL_STAGES[i - 1].label.toLowerCase()})
                        </span>
                      )}
                    </span>
                  </div>
                  <Progress
                    value={(value / funnelCounts[0]) * 100}
                    indicatorClassName={cn(stage.key === 'CASH_COLLECTED' ? 'bg-success' : 'bg-info')}
                  />
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CancelledReturnedCard({ cancelled, returned, loading }: { cancelled?: number; returned?: number; loading: boolean }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cancelled / Returned</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
          <XCircle className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-4">
        <div>
          <span className="text-xl font-extrabold tracking-tight">{loading || cancelled === undefined ? '—' : cancelled.toLocaleString()}</span>
          <span className="ml-1 text-xs text-muted-foreground">cancelled</span>
        </div>
        <div>
          <span className="text-xl font-extrabold tracking-tight">{loading || returned === undefined ? '—' : returned.toLocaleString()}</span>
          <span className="ml-1 text-xs text-muted-foreground">returned</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Orders that did not become realised revenue</p>
    </Card>
  )
}

// ---------------------------------------------------------------
// Top Products — real data via the existing finance-gated
// get_product_performance() RPC (already date-range aware, already
// used by Analytics), replacing what used to be a hardcoded mock
// array on the dashboard.
// ---------------------------------------------------------------
function TopProductsCard({ range }: { range: FinanceDateRange }) {
  const canView = useFinanceVisibility()
  const { activeWorkspace } = useWorkspace()
  const { data: products, isLoading } = useProductPerformance(range)

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Products</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Lock}
            title="Hidden"
            description="Ask a workspace admin for finance.view, analytics.view or reports.view to see product performance."
          />
        </CardContent>
      </Card>
    )
  }

  const top = (products ?? []).slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Products</CardTitle>
        <CardDescription className="mt-1">Ranked by sales value, selected period</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <LoadingState label="Loading top products…" />
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground">No product sales in this period.</p>
        ) : (
          top.map((product) => (
            <div key={product.product_id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{product.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {product.units_sold} sold · {formatCurrency(product.delivered_revenue, activeWorkspace.currency_code)}
                </p>
              </div>
              {product.available_quantity !== null && (
                <Badge variant={product.available_quantity <= 10 ? 'warning' : 'secondary'} className="shrink-0">
                  {product.available_quantity <= 10 && <AlertTriangle className="h-3 w-3" />}
                  {product.available_quantity} in stock
                </Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------
// Level 5: Needs Attention. Every row is real, backend-sourced and
// only rendered when its count is > 0 and the viewer holds the
// relevant permission — never an invented count, never a metric
// shown to someone who shouldn't see it. Order-status buckets reuse
// get_order_status_value_breakdown() (already finance-gated); low
// stock reuses products.is_low_stock via the existing lowStockOnly
// filter; pending withdrawals and notifications reuse their own
// existing, real, permission-scoped hooks.
// ---------------------------------------------------------------
function NeedsAttentionCard({ range }: { range: FinanceDateRange }) {
  const canViewFinance = useFinanceVisibility()
  const canViewProducts = usePermission('products.view')
  const canViewWithdrawals = usePermission('withdrawals.view')

  const { data: statusBreakdown } = useOrderStatusValueBreakdown(range)
  const { data: lowStockProducts } = useProducts({ lowStockOnly: true })
  const { data: pendingWithdrawals } = useWithdrawals({ status: 'PENDING' })
  const { data: notifications } = useRecentNotifications()

  const byStatus = new Map((statusBreakdown ?? []).map((r) => [r.status, r.order_count]))
  const awaitingConfirmation = (byStatus.get('NEW') ?? 0) + (byStatus.get('PENDING') ?? 0) + (byStatus.get('WILL_CALL_BACK') ?? 0)
  const inFulfillment = (byStatus.get('SCHEDULED') ?? 0) + (byStatus.get('PROCESSING_FOR_DISPATCH') ?? 0)
  const outForDelivery = (byStatus.get('DISPATCHED') ?? 0) + (byStatus.get('IN_TRANSIT') ?? 0) + (byStatus.get('PARTIALLY_DELIVERED') ?? 0)
  const lowStockCount = lowStockProducts?.length ?? 0
  const pendingWithdrawalsCount = pendingWithdrawals?.length ?? 0

  const alerts: { key: string; label: string; count: number; href: string; tone: 'warning' | 'destructive' | 'info' }[] = []
  if (canViewFinance) {
    if (awaitingConfirmation > 0) alerts.push({ key: 'confirm', label: 'Orders awaiting confirmation', count: awaitingConfirmation, href: '/orders', tone: 'warning' })
    if (inFulfillment > 0) alerts.push({ key: 'fulfillment', label: 'Orders in fulfillment', count: inFulfillment, href: '/orders', tone: 'info' })
    if (outForDelivery > 0) alerts.push({ key: 'delivery', label: 'Orders out for delivery', count: outForDelivery, href: '/orders', tone: 'info' })
  }
  if (canViewProducts && lowStockCount > 0) {
    alerts.push({ key: 'lowstock', label: 'Low-stock products', count: lowStockCount, href: '/products/inventory', tone: 'destructive' })
  }
  if (canViewWithdrawals && pendingWithdrawalsCount > 0) {
    alerts.push({ key: 'withdrawals', label: 'Withdrawals awaiting approval', count: pendingWithdrawalsCount, href: '/affiliates/withdrawals', tone: 'warning' })
  }

  const toneDot: Record<string, string> = { destructive: 'bg-destructive', warning: 'bg-warning', info: 'bg-info' }
  const toneBadge: Record<string, 'destructive' | 'warning' | 'info'> = { destructive: 'destructive', warning: 'warning', info: 'info' }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Needs Attention</CardTitle>
        <CardDescription className="mt-1">Actionable operational alerts for this workspace</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {alerts.length === 0 && (notifications?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">You're all caught up — nothing needs attention right now.</p>
        )}
        {alerts.map((a) => (
          <Link
            key={a.key}
            to={a.href}
            className="flex items-center justify-between rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent/40"
          >
            <span className="flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', toneDot[a.tone])} />
              {a.label}
            </span>
            <Badge variant={toneBadge[a.tone]}>{a.count}</Badge>
          </Link>
        ))}
        {(notifications?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Notifications</p>
            {notifications?.slice(0, 4).map((note) => (
              <div key={note.id} className="flex items-start gap-3 text-sm">
                <span
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    note.priority === 'urgent' && 'bg-destructive',
                    note.priority === 'high' && 'bg-warning',
                    note.priority === 'normal' && 'bg-info',
                    note.priority === 'low' && 'bg-muted-foreground',
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate">{note.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OrdersPermissionNotice() {
  return (
    <Card className="p-8">
      <EmptyState
        icon={Lock}
        title="Order records are hidden"
        description="You don't have permission to view orders in this workspace, so the recent-orders feed is hidden. Ask a workspace admin for the orders.view permission."
      />
    </Card>
  )
}

function RecentOrdersSection() {
  const { data: recentOrders, isLoading: recentLoading } = useOrders({ sortBy: 'created_at', sortDirection: 'desc', page: 1, pageSize: 5 })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <CardDescription className="mt-1">Latest customer submissions across all funnels</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {recentLoading && (
          <div className="px-5 py-8">
            <LoadingState label="Loading recent orders…" />
          </div>
        )}
        {!recentLoading && (recentOrders?.rows.length ?? 0) === 0 && (
          <div className="px-5 py-8">
            <EmptyState icon={ShoppingCart} title="No orders yet" description="Orders will appear here once your funnels or staff start creating them." />
          </div>
        )}
        {(recentOrders?.rows.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders?.rows.map((order) => (
                  <tr key={order.id} className="border-t border-border/60 hover:bg-accent/40">
                    <td className="px-5 py-3">
                      <Link to={`/orders/${order.id}`} className="font-mono text-xs text-muted-foreground hover:text-primary">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{order.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_city ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3 capitalize text-muted-foreground">{order.source.replace('_', ' ')}</td>
                    <td className="px-5 py-3 font-semibold">{formatCurrency(order.total_amount, order.currency_code)}</td>
                    <td className="px-5 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
