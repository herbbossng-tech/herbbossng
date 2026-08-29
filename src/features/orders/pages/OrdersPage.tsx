import type { SortingState } from '@tanstack/react-table'
import { Download, Plus, Search, ShoppingCart, UserCheck } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ServerDataTable } from '@/components/ui/server-data-table'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useAuth } from '@/contexts/AuthContext'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { assignOrder as assignOrderApi, transitionOrderStatus } from '@/features/orders/api'
import { buildOrderColumns } from '@/features/orders/columns'
import { OrderStats } from '@/features/orders/components/OrderStats'
import { useOrders } from '@/features/orders/hooks'
import { orderSourceLabels, orderStatuses, orderStatusLabels } from '@/features/orders/statusMeta'
import type { OrderFilters, OrderListItem } from '@/features/orders/types'
import { exportToCsv } from '@/lib/csv'

const PAGE_SIZE = 25

export function OrdersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [filters, setFilters] = React.useState<OrderFilters>({ status: 'all', source: 'all', page: 1, pageSize: PAGE_SIZE })
  const [searchInput, setSearchInput] = React.useState('')
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }])
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [bulkResult, setBulkResult] = React.useState<string | null>(null)
  const [bulkStatus, setBulkStatus] = React.useState<string>('')

  React.useEffect(() => {
    const handle = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput, page: 1 })), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const appliedFilters: OrderFilters = {
    ...filters,
    sortBy: (sorting[0]?.id as OrderFilters['sortBy']) ?? 'created_at',
    sortDirection: sorting[0]?.desc === false ? 'asc' : 'desc',
  }

  const { data, isLoading, isError, refetch } = useOrders(appliedFilters)
  const canCreate = usePermission('orders.create')
  const canExport = usePermission('orders.export')
  const canAssign = usePermission('orders.assign')
  const canUpdate = usePermission('orders.update')

  const columns = React.useMemo(() => buildOrderColumns(), [])
  const rows = data?.rows ?? []
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const selectedRows = rows.filter((r) => selectedIds.includes(r.id))

  function handleExport(orders: OrderListItem[]) {
    exportToCsv(
      `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      orders.map((o) => ({
        order_number: o.order_number,
        customer: o.customer_name,
        phone: o.customer_phone,
        address: o.customer_address,
        city: o.customer_city ?? '',
        total: o.total_amount,
        currency: o.currency_code,
        source: o.source,
        status: o.status,
        created_at: o.created_at,
        scheduled_at: o.scheduled_at ?? '',
        delivered_at: o.delivered_at ?? '',
        assigned_to: o.assigned_to_email ?? '',
      })),
    )
  }

  async function applyBulkStatus() {
    if (!bulkStatus || !user) return
    const outcomes = await Promise.allSettled(
      selectedIds.map((id) => transitionOrderStatus(id, { status: bulkStatus }, user.id)),
    )
    const failed = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[]
    setBulkResult(
      failed.length === 0
        ? `Updated ${outcomes.length} order(s) to ${orderStatusLabels[bulkStatus as keyof typeof orderStatusLabels]}.`
        : `${outcomes.length - failed.length} succeeded, ${failed.length} failed:\n` +
            failed.map((f) => `• ${(f.reason as Error)?.message ?? 'Unknown error'}`).join('\n'),
    )
    setRowSelection({})
    setBulkStatus('')
    refetch()
  }

  async function assignSelectedToMe() {
    if (!user) return
    await Promise.allSettled(selectedIds.map((id) => assignOrderApi(id, user.id, user.id)))
    setRowSelection({})
    refetch()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and process your cash-on-delivery orders.</p>
        </div>
        <PermissionGate permission="orders.create">
          <Button asChild>
            <Link to="/orders/new">
              <Plus className="h-4 w-4" />
              Create Order
            </Link>
          </Button>
        </PermissionGate>
      </div>

      <OrderStats />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Order #, customer, phone, product…"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select value={filters.status ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as OrderFilters['status'], page: 1 }))}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {orderStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {orderStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.source ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, source: v as OrderFilters['source'], page: 1 }))}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {Object.entries(orderSourceLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canExport && rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => handleExport(rows)}>
            <Download className="h-4 w-4" />
            Export page
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">{selectedIds.length} selected</span>
          {canUpdate && (
            <>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Change status to…" />
                </SelectTrigger>
                <SelectContent>
                  {orderStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {orderStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!bulkStatus} onClick={applyBulkStatus}>
                Apply
              </Button>
            </>
          )}
          {canAssign && (
            <Button variant="outline" size="sm" onClick={assignSelectedToMe}>
              <UserCheck className="h-3.5 w-3.5" />
              Assign to me
            </Button>
          )}
          {canExport && (
            <Button variant="outline" size="sm" onClick={() => handleExport(selectedRows)}>
              <Download className="h-3.5 w-3.5" />
              Export selected
            </Button>
          )}
        </div>
      )}

      {isLoading && <LoadingState label="Loading orders…" />}
      {isError && <ErrorState message="We couldn't load orders." onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description="Orders submitted through your COD funnels and manually created orders will appear here."
          action={
            canCreate && (
              <Button asChild size="sm">
                <Link to="/orders/new">
                  <Plus className="h-4 w-4" />
                  Create Order
                </Link>
              </Button>
            )
          }
        />
      )}
      {!isLoading && !isError && rows.length > 0 && (
        <ServerDataTable
          columns={columns}
          data={rows}
          totalCount={data?.totalCount ?? rows.length}
          page={filters.page ?? 1}
          pageSize={PAGE_SIZE}
          onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
          sorting={sorting}
          onSortingChange={setSorting}
          getRowId={(row) => row.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          onRowClick={(row) => navigate(`/orders/${row.id}`)}
        />
      )}

      <AlertDialog open={!!bulkResult} onOpenChange={(open) => !open && setBulkResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk status update</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{bulkResult}</p>
          <AlertDialogFooter>
            <Button onClick={() => setBulkResult(null)}>Close</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
