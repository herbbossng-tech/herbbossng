import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ServerDataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  totalCount: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  getRowId?: (row: TData) => string
  onRowClick?: (row: TData) => void
}

/**
 * Like DataTable, but pagination is driven by the server: `data` is
 * expected to already be exactly one page, `totalCount` comes from the
 * query's exact count, and page changes call back out to re-fetch rather
 * than slicing client-side. Use this whenever a table can plausibly grow
 * into the thousands (orders, customers, …) — DataTable is for small,
 * fully-loaded lists.
 */
export function ServerDataTable<TData>({
  columns,
  data,
  totalCount,
  page,
  pageSize,
  onPageChange,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  onRowClick,
}: ServerDataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection: rowSelection ?? {} },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      onSortingChange(next)
    },
    onRowSelectionChange: onRowSelectionChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(rowSelection ?? {}) : updater
          onRowSelectionChange(next)
        }
      : undefined,
    getRowId,
    enableRowSelection: Boolean(onRowSelectionChange),
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-secondary/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 font-semibold">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        disabled={!header.column.getCanSort()}
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'flex items-center gap-1',
                          header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={cn('border-b border-border/60 last:border-0 hover:bg-accent/40', onRowClick && 'cursor-pointer')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
        <span>
          Page {page} of {pageCount} · {totalCount.toLocaleString()} total
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
