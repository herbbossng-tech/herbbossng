import { DollarSign, PackageCheck, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'

import { useMyAffiliateDashboard } from '../hooks'

function StatCard({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function AffiliateDashboardPage() {
  const { data, isLoading, isError, refetch } = useMyAffiliateDashboard()

  if (isLoading) return <LoadingState label="Loading your dashboard…" />
  if (isError || !data) return <ErrorState message="Couldn't load your dashboard." onRetry={() => refetch()} />

  const currency = data.wallet_currency_code

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Orders and earnings from your embeddable order forms.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={PackageCheck} label="Total orders" value={String(data.total_orders)} />
        <StatCard icon={DollarSign} label="Total order value" value={formatCurrency(data.total_revenue, currency)} />
        <StatCard icon={Wallet} label="Wallet balance" value={formatCurrency(data.wallet_balance, currency)} />
      </div>

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
    </div>
  )
}
