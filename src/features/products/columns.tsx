import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Copy, MoreHorizontal, Pencil, PackageOpen } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProductStatusBadge } from '@/features/products/components/ProductStatusBadge'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { ProductWithCategory } from '@/features/products/types'

export function buildProductColumns(options: {
  currencyCode: string | null
  onArchive: (product: ProductWithCategory) => void
  onDuplicate: (product: ProductWithCategory) => void
  canUpdate: boolean
  canDelete: boolean
}): ColumnDef<ProductWithCategory, unknown>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          onClick={(event) => event.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.sku ?? 'No SKU'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.category_name ?? '—'}</span>,
    },
    {
      accessorKey: 'selling_price',
      header: 'Price',
      cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.selling_price, options.currencyCode)}</span>,
    },
    {
      accessorKey: 'available_quantity',
      header: 'Stock',
      cell: ({ row }) => {
        const product = row.original
        if (!product.track_inventory) return <span className="text-muted-foreground">Not tracked</span>
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn('font-medium', product.is_low_stock && 'text-warning')}>{product.available_quantity}</span>
            {product.is_low_stock && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <ProductStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(event) => event.stopPropagation()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            {options.canUpdate && (
              <DropdownMenuItem asChild>
                <Link to={`/products/${row.original.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
            )}
            {options.canUpdate && (
              <DropdownMenuItem onSelect={() => options.onDuplicate(row.original)}>
                <Copy className="h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
            )}
            {options.canDelete && row.original.status !== 'archived' && (
              <DropdownMenuItem onSelect={() => options.onArchive(row.original)} className="text-destructive focus:text-destructive">
                <PackageOpen className="h-4 w-4" />
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
}
