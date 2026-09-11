import { ExternalLink, MapPin, MessageSquarePlus, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { relativeDueTime, relativeTime } from '@/features/myWork/format'
import { orderStatusLabels, orderStatusTone } from '@/features/orders/statusMeta'
import { priorityTone } from '@/features/support/statusMeta'
import { formatCurrency } from '@/lib/currency'
import type { MyWorkQueueItem } from '@/types/database'

export function PriorityQueueItem({
  item,
  currencyCode,
  canLogInteraction,
  onLogInteraction,
}: {
  item: MyWorkQueueItem
  currencyCode: string | null
  canLogInteraction: boolean
  onLogInteraction: () => void
}) {
  const location = [item.customer_city, item.customer_state].filter(Boolean).join(', ')
  const nextFollowUp = item.next_follow_up_at
    ? item.queue_group === 'OVERDUE_FOLLOW_UP' || item.queue_group === 'DUE_TODAY'
      ? relativeDueTime(item.next_follow_up_at)
      : `follow up ${relativeDueTime(item.next_follow_up_at)}`
    : null

  return (
    <Card className="p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={priorityTone[item.priority] ?? 'secondary'} className="capitalize">
              {item.priority}
            </Badge>
            <Link to={`/orders/${item.order_id}`} className="font-mono text-sm font-semibold hover:text-primary">
              {item.order_number}
            </Link>
            <Badge variant={orderStatusTone[item.status]}>{orderStatusLabels[item.status]}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {item.customer_name} · <a href={`tel:${item.customer_phone}`} className="hover:text-primary">{item.customer_phone}</a>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.product_summary ?? 'No items'} · {formatCurrency(item.total_amount, currencyCode)}
            {location && (
              <>
                {' '}
                · <MapPin className="inline h-3 w-3 -translate-y-px" /> {location}
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last contact: {item.last_interaction_at ? `${item.last_interaction_summary ?? ''} (${relativeTime(item.last_interaction_at)})` : 'not yet contacted'}
          </p>
          {nextFollowUp && <p className="mt-0.5 text-xs font-medium text-foreground">{nextFollowUp}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">Updated {relativeTime(item.updated_at)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href={`tel:${item.customer_phone}`}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          </Button>
          {canLogInteraction && (
            <Button size="sm" variant="outline" onClick={onLogInteraction}>
              <MessageSquarePlus className="h-4 w-4" />
              Add Note
            </Button>
          )}
          <Button size="sm" asChild>
            <Link to={`/orders/${item.order_id}`}>
              <ExternalLink className="h-4 w-4" />
              Open
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  )
}
