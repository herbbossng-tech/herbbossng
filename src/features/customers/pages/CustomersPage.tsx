import type { SortingState } from '@tanstack/react-table'
import { Download, Plus, Search, UserPlus, Users } from 'lucide-react'
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
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { updateCustomer } from '@/features/customers/api'
import { buildCustomerColumns } from '@/features/customers/columns'
import { CustomerStatsStrip } from '@/features/customers/components/CustomerStatsStrip'
import { useCustomers } from '@/features/customers/hooks'
import { customerStatusLabels, customerStatuses } from '@/features/customers/statusMeta'
import type { CustomerFilters, CustomerListItem } from '@/features/customers/types'
import { exportToCsv } from '@/lib/csv'

const PAGE_SIZE = 25

interface SortOption {
  value: string
  label: string
  sortBy: NonNullable<CustomerFilters['sortBy']>
  sortDirection: 'asc' | 'desc'
}

const sortOptions: SortOption[] = [
  { value: 'newest', label: 'Newest customer', sortBy: 'created_at', sortDirection: 'desc' },
  { value: 'oldest', label: 'Oldest customer', sortBy: 'created_at', sortDirection: 'asc' },
  { value: 'recent_order', label: 'Most recent order', sortBy: 'last_order_at', sortDirection: 'desc' },
  { value: 'highest_value', label: 'Highest total value', sortBy: 'total_order_value', sortDirection: 'desc' },
  { value: 'most_orders', label: 'Most orders', sortBy: 'total_orders', sortDirection: 'desc' },
  { value: 'most_delivered', label: 'Most delivered', sortBy: 'delivered_count', sortDirection: 'desc' },
  { value: 'most_returned', label: 'Most returned', sortBy: 'returned_count', sortDirection: 'desc' },
]

export function CustomersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const [filters, setFilters] = React.useState<CustomerFilters>({ classification: 'all', status: 'all', page: 1, pageSize: PAGE_SIZE })
  const [searchInput, setSearchInput] = React.useState('')
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'created_at', desc: true }])
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [bulkResult, setBulkResult] = React.useState<string | null>(null)
  const [bulkStatus, setBulkStatus] = React.useState<string>('')
  const [bulkPending, setBulkPending] = React.useState(false)

  React.useEffect(() => {
    const handle = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput, page: 1 })), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const appliedFilters: CustomerFilters = {
    ...filters,
    sortBy: (sorting[0]?.id as CustomerFilters['sortBy']) ?? 'created_at',
    sortDirection: sorting[0]?.desc === false ? 'asc' : 'desc',
  }

  const { data, isLoading, isError, refetch } = useCustomers(appliedFilters)
  const canCreate = usePermission('customers.create')
  const canExport = usePermission('customers.export')
  const canUpdateStatus = usePermission('customers.update')
  const canDeleteStatus = usePermission('customers.delete')
  const canUpdate = canUpdateStatus || canDeleteStatus

  const columns = React.useMemo(() => buildCustomerColumns(activeWorkspace.currency_code), [activeWorkspace.currency_code])
  const rows = data?.rows ?? []
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const selectedRows = rows.filter((r) => selectedIds.includes(r.id))

  const currentSort =
    sortOptions.find(
      (o) => o.sortBy === (sorting[0]?.id ?? 'created_at') && o.sortDirection === (sorting[0]?.desc === false ? 'asc' : 'desc'),
    )?.value ?? 'newest'

  function handleExport(customers: CustomerListItem[]) {
    exportToCsv(
      `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      customers.map((c) => ({
        name: c.full_name,
        phone: c.phone,
        email: c.email ?? '',
        state: c.state ?? '',
        city: c.city ?? '',
        order_count: c.total_orders,
        delivered_count: c.delivered_count,
        returned_count: c.returned_count,
        total_order_value: c.total_order_value,
        delivered_value: c.delivered_value,
        pending_value: c.pending_value,
        first_order_at: c.first_order_at ?? '',
        last_order_at: c.last_order_at ?? '',
        customer_type: c.is_repeat_customer ? 'Repeat Customer' : 'New Customer',
      })),
    )
  }

  async function applyBulkStatus() {
    if (!bulkStatus || !user) return
    setBulkPending(true)
    try {
      const outcomes = await Promise.allSettled(
        selectedIds.map((id) => updateCustomer(id, { status: bulkStatus }, user.id)),
      )
      const failed = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[]
      setBulkResult(
        failed.length === 0
          ? `Updated ${outcomes.length} customer(s) to ${customerStatusLabels[bulkStatus as keyof typeof customerStatusLabels]}.`
          : `${outcomes.length - failed.length} succeeded, ${failed.length} failed:\n` +
              failed.map((f) => `• ${(f.reason as Error)?.message ?? 'Unknown error'}`).join('\n'),
      )
      setRowSelection({})
      setBulkStatus('')
      refetch()
    } finally {
      setBulkPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">The central customer record for your COD operations.</p>
        </div>
        <PermissionGate permission="customers.create">
          <Button asChild>
            <Link to="/customers/new">
              <Plus className="h-4 w-4" />
              Add Customer
            </Link>
          </Button>
        </PermissionGate>
      </div>

      <CustomerStatsStrip />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name, phone, email, order #…"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {canExport && rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => handleExport(rows)}>
              <Download className="h-4 w-4" />
              Export page
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.classification ?? 'all'}
            onValueChange={(v) => setFilters((f) => ({ ...f, classification: v as CustomerFilters['classification'], page: 1 }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Customer type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">New &amp; Repeat</SelectItem>
              <SelectItem value="new">New Customers</SelectItem>
              <SelectItem value="repeat">Repeat Customers</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.status ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as CustomerFilters['status'], page: 1 }))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {customerStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {customerStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant={filters.hasPending ? 'default' : 'outline'}
            onClick={() => setFilters((f) => ({ ...f, hasPending: !f.hasPending, page: 1 }))}
          >
            Has pending orders
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filters.hasDelivered ? 'default' : 'outline'}
            onClick={() => setFilters((f) => ({ ...f, hasDelivered: !f.hasDelivered, page: 1 }))}
          >
            Has delivered orders
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filters.hasReturned ? 'default' : 'outline'}
            onClick={() => setFilters((f) => ({ ...f, hasReturned: !f.hasReturned, page: 1 }))}
          >
            Has returned orders
          </Button>
          <Select
            value={currentSort}
            onValueChange={(v) => {
              const option = sortOptions.find((o) => o.value === v)
              if (option) setSorting([{ id: option.sortBy, desc: option.sortDirection === 'desc' }])
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                  {customerStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {customerStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!bulkStatus || bulkPending} onClick={applyBulkStatus}>
                Apply
              </Button>
            </>
          )}
          {canExport && (
            <Button variant="outline" size="sm" onClick={() => handleExport(selectedRows)}>
              <Download className="h-3.5 w-3.5" />
              Export selected
            </Button>
          )}
        </div>
      )}

      {isLoading && <LoadingState label="Loading customers…" />}
      {isError && <ErrorState message="We couldn't load customers." onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Customers are created automatically from orders, or you can add one manually."
          action={
            canCreate && (
              <Button asChild size="sm">
                <Link to="/customers/new">
                  <UserPlus className="h-4 w-4" />
                  Add Customer
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
          onRowClick={(row) => navigate(`/customers/${row.id}`)}
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
