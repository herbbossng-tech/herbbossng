import { AlertTriangle, DollarSign, PackageCheck, TrendingUp, Wallet } from 'lucide-react'
import * as React from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'
import { resolveDateRange, type DateRangePreset, type DateRangeValue } from '@/features/finance/dateRanges'
import { DateRangeFilter } from '@/features/finance/components/DateRangeFilter'

import { useMyAffiliateDashboard } from '../hooks'

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  sublabel?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
          {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export function AffiliateDashboardPage() {
  const [range, setRange] = React.useState<DateRangeValue>(() => resolveDateRange('last14days', 'UTC'))
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')

  const dateFrom = range.from ? range.from.slice(0, 10) : null
  const dateTo = range.to ? range.to.slice(0, 10) : null
  const { data, isLoading, isError, refetch } = useMyAffiliateDashboard(dateFrom, dateTo)

  function handlePresetChange(preset: DateRangePreset) {
    setRange(resolveDateRange(preset, 'UTC'))
  }
  function handleCustomChange(from: string, to: string) {
    setCustomFrom(from)
    setCustomTo(to)
    setRange(resolveDateRange('custom', 'UTC', { from, to }))
  }

  if (isLoading) return <LoadingState label="Loading your dashboard…" />
  if (isError || !data) return <ErrorState message="Couldn't load your dashboard." onRetry={() => refetch()} />

  const currency = data.wallet_currency_code ?? 'NGN'
  const conversionDelta = data.conversion_rate - data.prior_conversion_rate

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Orders and earnings from your embeddable order forms.</p>
        </div>
        <DateRangeFilter value={range} onChange={handlePresetChange} customFrom={customFrom} customTo={customTo} onCustomChange={handleCustomChange} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={PackageCheck} label="Total orders" value={String(data.total_orders)} sublabel={`${data.delivered_orders} delivered`} />
            <StatCard
              icon={TrendingUp}
              label="Conversion rate"
              value={`${data.conversion_rate.toFixed(1)}%`}
              sublabel={`${conversionDelta >= 0 ? '+' : ''}${conversionDelta.toFixed(1)}pp vs prior period`}
            />
            <StatCard icon={DollarSign} label="Total revenue" value={formatCurrency(data.total_revenue, currency)} />
            <StatCard
              icon={Wallet}
              label="Commission"
              value={formatCurrency(data.commission_earned, currency)}
              sublabel={`${formatCurrency(data.wallet_balance, currency)} available in wallet`}
            />
          </div>

          {data.refund_rate > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span>{data.refund_rate.toFixed(1)}% of orders in this period were returned.</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent orders</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent_orders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No orders yet — share your order form's link to start earning.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {data.recent_orders.map((order) => (
                    <div key={order.order_number} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{order.order_number}</p>
                        <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{order.status}</Badge>
                        <span className="text-sm font-semibold text-foreground">{formatCurrency(order.total_amount, order.currency_code)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="earnings" className="flex flex-col gap-6 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={Wallet} label="Wallet balance" value={formatCurrency(data.wallet_balance, currency)} />
            <StatCard icon={Wallet} label="Reserved balance" value={formatCurrency(data.wallet_reserved_balance, currency)} />
            <StatCard icon={DollarSign} label="Commission earned (period)" value={formatCurrency(data.commission_earned, currency)} />
          </div>
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="text-xs uppercase tracking-wide opacity-80">Next payout</p>
              <p className="text-3xl font-bold">{formatCurrency(data.wallet_balance, currency)}</p>
              <p className="text-sm opacity-80">Available wallet balance</p>
              <div className="mt-2 flex flex-col gap-1 border-t border-primary-foreground/20 pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="opacity-80">Delivered revenue</span>
                  <span className="font-semibold">{formatCurrency(data.delivered_revenue, currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="opacity-80">Pending orders</span>
                  <span className="font-semibold">{data.pending_orders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="opacity-80">Conversion</span>
                  <span className="font-semibold">{data.conversion_rate.toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="flex flex-col gap-6 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={TrendingUp} label="Best day" value={data.best_day ? DATE_FMT.format(new Date(`${data.best_day}T00:00:00`)) : '—'} sublabel={data.best_day ? formatCurrency(data.best_day_revenue, currency) : undefined} />
            <StatCard icon={DollarSign} label="Avg / day" value={formatCurrency(data.avg_per_day, currency)} />
            <StatCard icon={AlertTriangle} label="Refund rate" value={`${data.refund_rate.toFixed(1)}%`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue · Daily</CardTitle>
            </CardHeader>
            <CardContent>
              {data.daily_revenue.every((d) => d.revenue === 0) ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No revenue in this period yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart
                    data={data.daily_revenue.map((d) => ({ label: DATE_FMT.format(new Date(`${d.date}T00:00:00`)), revenue: d.revenue }))}
                    margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 6" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} width={48} />
                    <Tooltip
                      contentStyle={{ background: 'var(--color-popover)', border: '1px solid var(--color-border)', borderRadius: 10, fontSize: 12 }}
                      formatter={(value: number) => [formatCurrency(value, currency), 'Revenue']}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top products</CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_products.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No product breakdown yet. Your bestsellers will appear here once available.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {data.top_products.map((p) => (
                    <div key={p.product_name} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{p.product_name}</p>
                        <p className="text-xs text-muted-foreground">{p.orders} order{p.orders === 1 ? '' : 's'}</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(p.revenue, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
