import type { ColumnDef } from '@tanstack/react-table'
import { ChevronRight, Phone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge'
import { orderSourceLabels } from '@/features/orders/statusMeta'
import type { OrderListItem } from '@/features/orders/types'
import { formatCurrency } from '@/lib/currency'

const priorityVariant: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  urgent: 'destructive',
  high: 'warning',
  normal: 'secondary',
}

export function buildOrderColumns(): ColumnDef<OrderListItem, unknown>[] {
  return [
    {
      accessorKey: 'order_number',
      header: 'Order',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-foreground">{row.original.order_number}</p>
          {row.original.priority !== 'normal' && (
            <Badge variant={priorityVariant[row.original.priority]} className="mt-1">
              {row.original.priority}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.original.customer_name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.customer_city || row.original.customer_state || '—'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'customer_phone',
      header: 'Phone',
      cell: ({ row }) => (
        <a
          href={`tel:${row.original.customer_phone}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <Phone className="h-3 w-3" />
          {row.original.customer_phone}
        </a>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => <span className="font-semibold">{formatCurrency(row.original.total_amount, row.original.currency_code)}</span>,
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => <span className="text-muted-foreground">{orderSourceLabels[row.original.source] ?? row.original.source}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.created_at).toLocaleString()}</span>,
    },
    {
      accessorKey: 'assigned_to_email',
      header: 'Assigned To',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.assigned_to_email ?? 'Unassigned'}</span>,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
    },
  ]
}
