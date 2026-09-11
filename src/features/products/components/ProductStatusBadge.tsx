import { Badge } from '@/components/ui/badge'
import type { ProductStatus } from '@/types/database'

const variants: Record<ProductStatus, 'secondary' | 'success' | 'outline'> = {
  draft: 'secondary',
  active: 'success',
  archived: 'outline',
}

const labels: Record<ProductStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={variants[status]}>{labels[status]}</Badge>
}
