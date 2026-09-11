import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

const toneClasses: Record<string, string> = {
  default: 'bg-muted text-foreground',
  info: 'bg-info/15 text-info',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
  destructive: 'bg-destructive/15 text-destructive',
  secondary: 'bg-secondary text-secondary-foreground',
}

/**
 * One "My Work" status card. Deliberately a <Link>, not a button + onClick
 * — clicking always navigates to a properly filtered queue (Section 3/13),
 * so it must be a real, bookmarkable/shareable URL.
 */
export function MyWorkCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  href,
  sub,
  highlight,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone?: keyof typeof toneClasses
  href: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <Link
      to={href}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40',
        highlight && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none tabular-nums">{value.toLocaleString()}</p>
        <p className="mt-1.5 text-sm font-medium text-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Link>
  )
}
