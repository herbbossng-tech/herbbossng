import { ExternalLink, Flame, UsersRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { marketPulse } from '@/data/mockData'

export function Topbar() {
  return (
    <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar/60 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Flame className="h-3.5 w-3.5 text-primary" />
        <span className="tracking-widest">MARKET PULSE:</span>
        <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
          <span aria-hidden className="text-sm leading-none">🇳🇬</span>
          {marketPulse.code} {marketPulse.country}
          <span className="rounded-full bg-success/25 px-1.5">{marketPulse.activeOrders}</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm">
          <UsersRound className="h-4 w-4" />
          Affiliate Portal
        </Button>
        <Button size="sm">
          <ExternalLink className="h-4 w-4" />
          Live Storefront Preview
        </Button>
      </div>
    </header>
  )
}
