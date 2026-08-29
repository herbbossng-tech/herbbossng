import { CheckCircle2, Clock, Phone, RotateCcw, ShoppingCart, Truck, XCircle } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { useOrderStats } from '@/features/orders/hooks'

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof ShoppingCart; label: string; value: string | number; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-2 text-xl font-extrabold tracking-tight ${tone ?? ''}`}>{value}</p>
    </Card>
  )
}

export function OrderStats() {
  const { data: stats, isLoading } = useOrderStats()
  const v = (n: number | undefined) => (isLoading || n === undefined ? '—' : n.toLocaleString())

  const pendingConfirmation = stats && stats.pending_count + stats.will_call_back_count
  const processing = stats && stats.processing_count + stats.scheduled_count

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <StatTile icon={ShoppingCart} label="Total Orders" value={v(stats?.total_orders)} />
      <StatTile icon={ShoppingCart} label="New" value={v(stats?.new_count)} tone="text-info" />
      <StatTile icon={Phone} label="Pending Confirmation" value={v(pendingConfirmation)} tone="text-warning" />
      <StatTile icon={Clock} label="Processing / Dispatch" value={v(processing)} />
      <StatTile icon={Truck} label="In Transit" value={v(stats?.in_transit_count)} tone="text-info" />
      <StatTile icon={CheckCircle2} label="Delivered" value={v(stats?.delivered_count)} tone="text-success" />
      <StatTile icon={RotateCcw} label="Returned" value={v(stats?.returned_count)} tone="text-destructive" />
      <StatTile icon={XCircle} label="Cancelled" value={v(stats?.cancelled_count)} tone="text-muted-foreground" />
    </div>
  )
}
