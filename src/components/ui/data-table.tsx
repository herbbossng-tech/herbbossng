import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  getRowId?: (row: TData) => string
  pageSize?: number
  onRowClick?: (row: TData) => void
}

export function DataTable<TData>({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  pageSize = 10,
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection: rowSelection ?? {} },
    onSortingChange: setSorting,
    onRowSelectionChange: onRowSelectionChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(rowSelection ?? {}) : updater
          onRowSelectionChange(next)
        }
      : undefined,
    getRowId,
    enableRowSelection: Boolean(onRowSelectionChange),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

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

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} · {data.length} total
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
