import { AlertTriangle, ExternalLink, Lock, Phone, Plus, ShoppingCart, TrendingUp, UserPlus, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

import { OrdersByDayChart } from '@/components/dashboard/OrdersByDayChart'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { StatCard } from '@/components/dashboard/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { Progress } from '@/components/ui/progress'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { mediaBuyers, nonOrderKpis, notifications, topProducts } from '@/data/mockData'
import { useLandingPages } from '@/features/landingPages/hooks'
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge'
import { useOrderDailyStats, useOrders, useOrderStats } from '@/features/orders/hooks'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

export function Dashboard() {
  const { activeWorkspace } = useWorkspace()
  const canViewOrders = usePermission('orders.view')

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
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time cash on delivery operations for <span className="font-semibold text-foreground">{activeWorkspace.name}</span>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4" />
            Preview Funnels
          </Button>
          <PermissionGate permission="finance.view">
            <Button variant="outline" size="sm" asChild>
              <Link to="/finance">
                <Wallet className="h-4 w-4" />
                Finance
              </Link>
            </Button>
          </PermissionGate>
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

      {canViewOrders ? <OrderDrivenSections /> : <OrdersPermissionNotice />}

      {/* Products, media buyers, notifications */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Products</CardTitle>
            <CardDescription className="mt-1">Best sellers this week (sample data — sell-through reporting lands in a later phase)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {topProducts.map((product) => (
              <div key={product.name} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.sold} sold · ₦{product.revenue.toLocaleString()}</p>
                </div>
                <Badge variant={product.stock <= 10 ? 'warning' : 'secondary'} className="shrink-0">
                  {product.stock <= 10 && <AlertTriangle className="h-3 w-3" />}
                  {product.stock} in stock
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Media Buyers</CardTitle>
              <CardDescription className="mt-1">Spend, orders & ROAS this week (sample data — affiliates module not built yet)</CardDescription>
            </div>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {mediaBuyers.map((buyer) => (
              <div key={buyer.name} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{buyer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ₦{buyer.spend.toLocaleString()} spend · {buyer.orders} orders
                  </p>
                </div>
                <Badge variant={buyer.roas >= 2.5 ? 'success' : 'outline'}>{buyer.roas}x ROAS</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Notifications</CardTitle>
              <CardDescription className="mt-1">Latest operational alerts (sample data)</CardDescription>
            </div>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {notifications.map((note) => (
              <div key={note.title} className="flex items-start gap-3 text-sm">
                <span
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    note.tone === 'success' && 'bg-success',
                    note.tone === 'warning' && 'bg-warning',
                    note.tone === 'info' && 'bg-info',
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate">{note.title}</p>
                  <p className="text-xs text-muted-foreground">{note.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function OrdersPermissionNotice() {
  return (
    <Card className="p-8">
      <EmptyState
        icon={Lock}
        title="Order metrics are hidden"
        description="You don't have permission to view orders in this workspace, so order-derived KPIs, charts, and the recent-orders feed are hidden. Ask a workspace admin for the orders.view permission."
      />
    </Card>
  )
}

function OrderDrivenSections() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { data: stats, isLoading: statsLoading } = useOrderStats()
  const { data: recentOrders, isLoading: recentLoading } = useOrders({ sortBy: 'created_at', sortDirection: 'desc', page: 1, pageSize: 5 })
  const { data: daily } = useOrderDailyStats(7)
  const { data: publishedPages, isLoading: pagesLoading } = useLandingPages({ status: 'published', page: 1, pageSize: 1 })

  const money = (n: number | undefined) => (statsLoading || n === undefined ? '—' : formatCurrency(n, currency))
  const count = (n: number | undefined) => (statsLoading || n === undefined ? '—' : n.toLocaleString())

  const activeOrders = stats ? stats.total_orders - stats.delivered_count - stats.returned_count - stats.cancelled_count : undefined

  const revenueSeries = (daily ?? []).map((d) => ({
    day: WEEKDAY_FORMAT.format(new Date(`${d.day}T00:00:00`)),
    revenue: d.delivered_revenue,
  }))
  const ordersSeries = (daily ?? []).map((d) => ({
    day: WEEKDAY_FORMAT.format(new Date(`${d.day}T00:00:00`)),
    orders: d.order_count,
  }))
  const daysOrdersTotal = (daily ?? []).reduce((sum, d) => sum + d.order_count, 0)
  const daysRevenueTotal = (daily ?? []).reduce((sum, d) => sum + d.delivered_revenue, 0)

  const funnel = stats
    ? [
        { stage: 'Orders Submitted', count: stats.total_orders, tone: 'info' as const },
        { stage: 'Confirmed', count: Math.max(stats.total_orders - stats.new_count, 0), tone: 'default' as const },
        { stage: 'Scheduled / Processing', count: stats.scheduled_count + stats.processing_count, tone: 'warning' as const },
        { stage: 'Dispatched / In Transit', count: stats.dispatched_count + stats.in_transit_count + stats.partially_delivered_count, tone: 'warning' as const },
        { stage: 'Delivered & Paid', count: stats.delivered_count, tone: 'success' as const },
      ]
    : []

  return (
    <>
      {/* Hero KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Active Orders" value={count(activeOrders)} unit="in progress" icon="cart" />
        <StatCard
          label="Delivered Revenue"
          value={money(stats?.delivered_revenue)}
          sub="All-time · Strict Delivered Rule"
          icon="wallet"
          highlight
        />
        <StatCard label="Pending Confirmation" value={count(stats && stats.pending_count + stats.will_call_back_count)} unit="need contact" icon="phone" />
        <StatCard label="Delivery Success Rate" value={statsLoading || !stats ? '—' : `${stats.delivery_success_rate}%`} sub="Successful cash collections" icon="check" />
      </div>

      {/* Secondary KPI grid */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Today at a Glance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Today's Orders" value={count(stats?.today_orders)} icon="cart" compact />
          <StatCard label="Today's Sales Value" value={money(stats?.today_sales_value)} icon="dollar" compact />
          <StatCard label="Pending Revenue" value={money(stats?.pending_revenue)} icon="clock" compact />
          <StatCard label="Completed Orders" value={count(stats?.delivered_count)} icon="check" compact />
          <StatCard label="Published Pages" value={pagesLoading ? '—' : (publishedPages?.totalCount ?? 0).toLocaleString()} icon="boxes" compact />
          {nonOrderKpis.map((kpi) => (
            <StatCard key={kpi.label} {...kpi} compact />
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Revenue Overview (Last 7 Days)
              </CardTitle>
              <CardDescription className="mt-1">Delivered physical cash collections trend, by day delivered</CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              Total: {formatCurrency(daysRevenueTotal, currency)}
            </Badge>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-success" />
                Orders by Day
              </CardTitle>
              <CardDescription className="mt-1">Daily order submission volume, by day created</CardDescription>
            </div>
            <Badge variant="success">{daysOrdersTotal} Total</Badge>
          </CardHeader>
          <CardContent>
            <OrdersByDayChart data={ordersSeries} />
          </CardContent>
        </Card>
      </div>

      {/* Operations grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Recent orders */}
        <Card className="xl:col-span-2">
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
                <EmptyState
                  icon={ShoppingCart}
                  title="No orders yet"
                  description="Orders will appear here once your funnels or staff start creating them."
                />
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

        {/* Delivery funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Funnel</CardTitle>
            <CardDescription className="mt-1">Confirmation-to-cash pipeline</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {funnel.length === 0 || funnel[0].count === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet to build a funnel from.</p>
            ) : (
              funnel.map((stage) => (
                <div key={stage.stage}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{stage.stage}</span>
                    <span className="font-semibold">{stage.count}</span>
                  </div>
                  <Progress
                    value={(stage.count / funnel[0].count) * 100}
                    indicatorClassName={cn(
                      stage.tone === 'success' && 'bg-success',
                      stage.tone === 'warning' && 'bg-warning',
                      stage.tone === 'info' && 'bg-info',
                    )}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
