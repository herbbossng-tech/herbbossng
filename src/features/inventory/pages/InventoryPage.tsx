import { AlertTriangle, Boxes, PackageX, SlidersHorizontal, Wallet } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { StockAdjustmentDialog } from '@/features/inventory/components/StockAdjustmentDialog'
import {
  useInventorySummary,
  useInventoryTransactions,
  useLowStockProducts,
} from '@/features/inventory/hooks'
import { formatCurrency } from '@/lib/currency'
import type { Product } from '@/types/database'

const transactionToneVariant: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  STOCK_IN: 'success',
  RETURNED: 'success',
  RESERVED: 'info',
  RELEASED: 'secondary',
  SOLD: 'info',
  STOCK_OUT: 'warning',
  DAMAGED: 'destructive',
  ADJUSTMENT: 'secondary',
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof Boxes; label: string; value: string; tone?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-3 text-2xl font-extrabold tracking-tight ${tone ?? ''}`}>{value}</p>
    </Card>
  )
}

export function InventoryPage() {
  const { activeWorkspace } = useWorkspace()
  const { data: summary, isLoading: summaryLoading } = useInventorySummary()
  const { data: lowStock, isLoading: lowStockLoading, isError: lowStockError, refetch: refetchLowStock } = useLowStockProducts()
  const { data: transactions, isLoading: txLoading, isError: txError, refetch: refetchTx } = useInventoryTransactions()
  const [adjustingProduct, setAdjustingProduct] = React.useState<Product | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stock levels, alerts and movement history for this brand.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Boxes} label="Total Products" value={summaryLoading ? '—' : String(summary?.totalProducts ?? 0)} />
        <SummaryCard
          icon={Wallet}
          label="Total Stock Value"
          value={summaryLoading ? '—' : formatCurrency(summary?.totalStockValue ?? 0, activeWorkspace.currency_code)}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Low Stock Products"
          value={summaryLoading ? '—' : String(summary?.lowStockCount ?? 0)}
          tone="text-warning"
        />
        <SummaryCard
          icon={PackageX}
          label="Out of Stock Products"
          value={summaryLoading ? '—' : String(summary?.outOfStockCount ?? 0)}
          tone="text-destructive"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {lowStockLoading && <LoadingState />}
            {lowStockError && <ErrorState message="Couldn't load low stock items." onRetry={() => refetchLowStock()} />}
            {!lowStockLoading && !lowStockError && (lowStock ?? []).length === 0 && (
              <EmptyState icon={Boxes} title="Nothing low on stock" description="All tracked products are above their threshold." />
            )}
            {!lowStockLoading &&
              (lowStock ?? []).map((product) => (
                <div key={product.id} className="flex items-center justify-between border-t border-border/60 px-5 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.available_quantity} available · threshold {product.low_stock_threshold}
                    </p>
                  </div>
                  <PermissionGate permission="inventory.update">
                    <Button variant="outline" size="sm" onClick={() => setAdjustingProduct(product)}>
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Adjust
                    </Button>
                  </PermissionGate>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {txLoading && <LoadingState />}
            {txError && <ErrorState message="Couldn't load transactions." onRetry={() => refetchTx()} />}
            {!txLoading && !txError && (transactions ?? []).length === 0 && (
              <EmptyState icon={SlidersHorizontal} title="No inventory activity yet" description="Stock movements will show up here." />
            )}
            {!txLoading &&
              (transactions ?? []).map((txn) => (
                <div key={txn.id} className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{txn.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {txn.previous_quantity} → {txn.new_quantity}
                      {txn.reason ? ` · ${txn.reason}` : ''}
                    </p>
                  </div>
                  <Badge variant={transactionToneVariant[txn.transaction_type] ?? 'secondary'} className="shrink-0">
                    {txn.transaction_type}
                  </Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <StockAdjustmentDialog product={adjustingProduct} onOpenChange={(open) => !open && setAdjustingProduct(null)} />
    </div>
  )
}
