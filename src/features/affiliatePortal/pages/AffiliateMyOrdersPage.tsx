import { Package } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'

import { useMyAffiliateOrders } from '../hooks'

const STATUS_OPTIONS = [
  'all',
  'NEW',
  'PENDING',
  'CONFIRMED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
] as const

export function AffiliateMyOrdersPage() {
  const [status, setStatus] = React.useState<string>('all')
  const { data: orders, isLoading, isError, refetch } = useMyAffiliateOrders(status === 'all' ? null : status)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every order placed through any of your order forms.</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState label="Loading your orders…" />
            </div>
          ) : isError ? (
            <div className="p-4">
              <ErrorState message="Couldn't load your orders." onRetry={() => refetch()} />
            </div>
          ) : (orders ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Package} title="No orders yet" description="Orders placed through your forms will show up here." />
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {orders?.map((order) => (
                <div key={order.order_number} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.source_detail ?? 'Order form'} · {new Date(order.created_at).toLocaleDateString()}
                    </p>
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
