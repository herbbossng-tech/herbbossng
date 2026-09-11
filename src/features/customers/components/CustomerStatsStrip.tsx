import { Clock, RotateCcw, UserCheck, UserPlus, Users } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { useCustomerStats } from '@/features/customers/hooks'

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string | number; tone?: string }) {
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

export function CustomerStatsStrip() {
  const { data: stats, isLoading } = useCustomerStats()
  const v = (n: number | undefined) => (isLoading || n === undefined ? '—' : n.toLocaleString())

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatTile icon={Users} label="Total Customers" value={v(stats?.total_customers)} />
      <StatTile icon={UserPlus} label="New Customers" value={v(stats?.new_customers)} tone="text-info" />
      <StatTile icon={RotateCcw} label="Repeat Customers" value={v(stats?.repeat_customers)} tone="text-success" />
      <StatTile icon={UserCheck} label="Active Customers" value={v(stats?.active_customers)} />
      <StatTile icon={Clock} label="With Pending Orders" value={v(stats?.customers_with_pending_orders)} tone="text-warning" />
    </div>
  )
}
