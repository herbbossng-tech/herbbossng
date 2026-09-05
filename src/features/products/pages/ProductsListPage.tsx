import type { RowSelectionState } from '@tanstack/react-table'
import { Download, Package, PackageOpen, Plus, Search } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCategories } from '@/features/categories/hooks'
import { buildProductColumns } from '@/features/products/columns'
import { useArchiveProduct, useDuplicateProduct, useProducts } from '@/features/products/hooks'
import type { ProductFilters, ProductWithCategory } from '@/features/products/types'
import { exportToCsv } from '@/lib/csv'

export function ProductsListPage() {
  const navigate = useNavigate()
  const { activeWorkspace } = useWorkspace()
  const [filters, setFilters] = React.useState<ProductFilters>({ status: 'all', categoryId: 'all' })
  const [searchInput, setSearchInput] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  React.useEffect(() => {
    const handle = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput })), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const { data: products, isLoading, isError, refetch } = useProducts(filters)
  const { data: categories } = useCategories()
  const archiveProduct = useArchiveProduct()
  const duplicateProduct = useDuplicateProduct()

  const canCreate = usePermission('products.create')
  const canUpdate = usePermission('products.update')
  const canDelete = usePermission('products.delete')
  const canExport = usePermission('products.export')

  const columns = React.useMemo(
    () =>
      buildProductColumns({
        currencyCode: activeWorkspace.currency_code,
        canUpdate,
        canDelete,
        onArchive: (product) => archiveProduct.mutate(product.id),
        onDuplicate: (product) => duplicateProduct.mutate(product),
      }),
    [activeWorkspace.currency_code, canUpdate, canDelete, archiveProduct, duplicateProduct],
  )

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  function handleExport(rows: ProductWithCategory[]) {
    exportToCsv(
      `products-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((p) => ({
        name: p.name,
        sku: p.sku ?? '',
        category: p.category_name ?? '',
        status: p.status,
        selling_price: p.selling_price,
        stock_quantity: p.stock_quantity,
        available_quantity: p.available_quantity,
      })),
    )
  }

  function handleBulkArchive() {
    selectedIds.forEach((id) => archiveProduct.mutate(id))
    setRowSelection({})
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your product catalogue for this brand.</p>
        </div>
        <PermissionGate permission="products.create">
          <Button asChild>
            <Link to="/products/new">
              <Plus className="h-4 w-4" />
              Create Product
            </Link>
          </Button>
        </PermissionGate>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or SKU…"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select value={filters.status ?? 'all'} onValueChange={(value) => setFilters((f) => ({ ...f, status: value as ProductFilters['status'] }))}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.categoryId ?? 'all'} onValueChange={(value) => setFilters((f) => ({ ...f, categoryId: value }))}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canExport && products && products.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => handleExport(products)}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <PermissionGate permission="products.delete">
              <Button variant="outline" size="sm" onClick={handleBulkArchive}>
                <PackageOpen className="h-4 w-4" />
                Archive selected
              </Button>
            </PermissionGate>
            {canExport && products && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport(products.filter((p) => selectedIds.includes(p.id)))}
              >
                <Download className="h-4 w-4" />
                Export selected
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading && <LoadingState label="Loading products…" />}
      {isError && <ErrorState message="We couldn't load your products." onRetry={() => refetch()} />}
      {!isLoading && !isError && products && products.length === 0 && (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Create your first product to start building your catalogue."
          action={
            canCreate && (
              <Button asChild size="sm">
                <Link to="/products/new">
                  <Plus className="h-4 w-4" />
                  Create Product
                </Link>
              </Button>
            )
          }
        />
      )}
      {!isLoading && !isError && products && products.length > 0 && (
        <DataTable
          columns={columns}
          data={products}
          getRowId={(row) => row.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          onRowClick={canUpdate ? (row) => navigate(`/products/${row.id}/edit`) : undefined}
        />
      )}
    </div>
  )
}
