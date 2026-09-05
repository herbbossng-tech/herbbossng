import { Badge } from '@/components/ui/badge'
import { orderStatusLabels, orderStatusTone } from '@/features/orders/statusMeta'
import type { OrderStatus } from '@/types/database'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={orderStatusTone[status]}>{orderStatusLabels[status]}</Badge>
}
