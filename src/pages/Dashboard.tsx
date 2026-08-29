import { AlertTriangle, ExternalLink, Phone, Plus, TrendingUp, UserPlus } from 'lucide-react'

import { OrdersByDayChart } from '@/components/dashboard/OrdersByDayChart'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { StatCard } from '@/components/dashboard/StatCard'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  deliveryFunnel,
  heroKpis,
  mediaBuyers,
  notifications,
  recentOrders,
  secondaryKpis,
  topProducts,
} from '@/data/mockData'
import { cn } from '@/lib/utils'

export function Dashboard() {
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
            Real-time cash on delivery operations for <span className="font-semibold text-foreground">Nigeria</span>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4" />
            Preview Funnels
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Manage Order Queue
          </Button>
        </div>
      </div>

      {/* Hero KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {heroKpis.map((kpi) => (
          <StatCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Secondary KPI grid — rich operational snapshot */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Today at a Glance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {secondaryKpis.map((kpi) => (
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
              <CardDescription className="mt-1">
                Delivered physical cash collections trend in active currency (₦)
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              Total: ₦652,000
            </Badge>
          </CardHeader>
          <CardContent>
            <RevenueChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-success" />
                Orders by Day
              </CardTitle>
              <CardDescription className="mt-1">Daily customer checkout volume distribution</CardDescription>
            </div>
            <Badge variant="success">64 Total</Badge>
          </CardHeader>
          <CardContent>
            <OrdersByDayChart />
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
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Order</th>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{order.id}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{order.customer}</p>
                        <p className="text-xs text-muted-foreground">{order.city}</p>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{order.product}</td>
                      <td className="px-5 py-3 font-semibold">₦{order.amount.toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Delivery funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Funnel</CardTitle>
            <CardDescription className="mt-1">Confirmation-to-cash pipeline</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {deliveryFunnel.map((stage) => (
              <div key={stage.stage}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{stage.stage}</span>
                  <span className="font-semibold">{stage.count}</span>
                </div>
                <Progress
                  value={(stage.count / deliveryFunnel[0].count) * 100}
                  indicatorClassName={cn(
                    stage.tone === 'success' && 'bg-success',
                    stage.tone === 'warning' && 'bg-warning',
                    stage.tone === 'info' && 'bg-info',
                  )}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Products, media buyers, notifications */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Products</CardTitle>
            <CardDescription className="mt-1">Best sellers this week</CardDescription>
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
              <CardDescription className="mt-1">Spend, orders & ROAS this week</CardDescription>
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
              <CardDescription className="mt-1">Latest operational alerts</CardDescription>
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
