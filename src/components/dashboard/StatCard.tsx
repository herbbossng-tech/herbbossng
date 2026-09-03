import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  DollarSign,
  type LucideIcon,
  Percent,
  Phone,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const iconMap: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  wallet: Wallet,
  phone: Phone,
  check: CheckCircle2,
  dollar: DollarSign,
  clock: Clock,
  boxes: Boxes,
  percent: Percent,
  userCheck: UserCheck,
}

const toneClasses: Record<string, string> = {
  default: 'bg-primary/15 text-primary',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
  info: 'bg-info/15 text-info',
  purple: 'bg-purple/15 text-purple',
}

export interface StatCardProps {
  label: string
  value: string
  prefix?: string
  unit?: string
  sub?: string
  delta?: string
  deltaLabel?: string
  trend?: 'up' | 'down'
  icon: keyof typeof iconMap
  highlight?: boolean
  tone?: keyof typeof toneClasses
  compact?: boolean
  /** Optional "View records"-style link rendered as a footer row. */
  href?: string
  actionLabel?: string
}

export function StatCard({
  label,
  value,
  prefix,
  unit,
  sub,
  delta,
  deltaLabel,
  trend = 'up',
  icon,
  highlight,
  tone = 'default',
  compact,
  href,
  actionLabel = 'View records',
}: StatCardProps) {
  const Icon = iconMap[icon] ?? ShoppingCart
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown

  return (
    <Card
      className={cn(
        'relative overflow-hidden p-5 transition-colors',
        highlight && 'border-primary/40 shadow-[0_0_0_1px_var(--color-primary)/20]',
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            highlight ? 'bg-primary/15 text-primary' : toneClasses[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className={cn('mt-3 flex items-baseline gap-1.5', compact && 'mt-2')}>
        {prefix && <span className={cn('font-bold text-primary', compact ? 'text-lg' : 'text-2xl')}>{prefix}</span>}
        <span className={cn('font-extrabold tracking-tight', compact ? 'text-xl' : 'text-3xl')}>{value}</span>
        {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>

      {(delta || sub) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {delta && (
            <span
              className={cn(
                'flex items-center gap-0.5 font-semibold',
                trend === 'up' ? 'text-success' : 'text-destructive',
              )}
            >
              <TrendIcon className="h-3 w-3" />
              {delta}
            </span>
          )}
          <span className="truncate text-muted-foreground">{sub ?? deltaLabel}</span>
        </div>
      )}

      {href && (
        <Link
          to={href}
          className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {actionLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </Card>
  )
}
