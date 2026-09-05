import type { ColumnDef } from '@tanstack/react-table'
import { ChevronRight, Phone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { CustomerStatusBadge } from '@/features/customers/components/CustomerStatusBadge'
import { customerClassificationLabel } from '@/features/customers/statusMeta'
import type { CustomerListItem } from '@/features/customers/types'
import { formatCurrency } from '@/lib/currency'

export function buildCustomerColumns(currencyCode: string | null | undefined): ColumnDef<CustomerListItem, unknown>[] {
  return [
    {
      accessorKey: 'full_name',
      header: 'Customer',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium text-foreground">{row.original.full_name}</p>
            {row.original.is_repeat_customer && (
              <Badge variant="info" className="shrink-0 px-1.5 py-0 text-[10px]">
                Repeat
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{customerClassificationLabel(row.original.is_repeat_customer)}</p>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => (
        <a
          href={`tel:${row.original.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <Phone className="h-3 w-3" />
          {row.original.phone}
        </a>
      ),
      enableSorting: false,
    },
    {
      id: 'location',
      header: 'Location',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {[row.original.city, row.original.state].filter(Boolean).join(', ') || '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'total_orders',
      header: 'Orders',
      cell: ({ row }) => <span className="font-semibold">{row.original.total_orders}</span>,
    },
    {
      accessorKey: 'delivered_count',
      header: 'Delivered',
      cell: ({ row }) => <span className="text-success">{row.original.delivered_count}</span>,
    },
    {
      accessorKey: 'returned_count',
      header: 'Returned',
      cell: ({ row }) => <span className={row.original.returned_count > 0 ? 'text-destructive' : 'text-muted-foreground'}>{row.original.returned_count}</span>,
    },
    {
      accessorKey: 'total_order_value',
      header: 'Total Value',
      cell: ({ row }) => <span className="font-semibold">{formatCurrency(row.original.total_order_value, currencyCode)}</span>,
    },
    {
      accessorKey: 'last_order_at',
      header: 'Last Order',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.last_order_at ? new Date(row.original.last_order_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <CustomerStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
    },
  ]
}
