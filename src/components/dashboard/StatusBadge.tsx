import { Badge } from '@/components/ui/badge'

const statusVariant = {
  Delivered: 'success',
  'Out for Delivery': 'info',
  'Pending Call': 'warning',
  Cancelled: 'destructive',
} as const

export function StatusBadge({ status }: { status: keyof typeof statusVariant }) {
  return <Badge variant={statusVariant[status]}>{status}</Badge>
}
