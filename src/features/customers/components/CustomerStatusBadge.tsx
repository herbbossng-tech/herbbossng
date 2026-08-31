import { Badge } from '@/components/ui/badge'
import { customerStatusLabels, customerStatusTone } from '@/features/customers/statusMeta'
import type { CustomerStatus } from '@/types/database'

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <Badge variant={customerStatusTone[status]}>{customerStatusLabels[status]}</Badge>
}
