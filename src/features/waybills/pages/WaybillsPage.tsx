import { Lock, Search, Truck } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useUpdateWaybillStatus, useWaybills } from '@/features/waybills/hooks'
import { formatCurrency } from '@/lib/currency'

const statusTone: Record<string, 'secondary' | 'info' | 'success' | 'destructive' | 'warning'> = {
  CREATED: 'secondary',
  READY: 'info',
  DISPATCHED: 'info',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'warning',
  DELIVERED: 'success',
  FAILED: 'destructive',
  RETURNED: 'destructive',
  CANCELLED: 'secondary',
}

const nextStatus: Record<string, { status: string; label: string }[]> = {
  CREATED: [{ status: 'READY', label: 'Mark Ready' }],
  READY: [{ status: 'DISPATCHED', label: 'Dispatch' }],
  DISPATCHED: [{ status: 'IN_TRANSIT', label: 'In Transit' }],
  IN_TRANSIT: [{ status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' }],
  OUT_FOR_DELIVERY: [{ status: 'DELIVERED', label: 'Delivered' }],
}

export function WaybillsPage() {
  const canView = usePermission('waybills.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Waybills is hidden" description="You don't have permission to view waybills. Ask a workspace admin for the waybills.view permission." />
      </Card>
    )
  }
  return <WaybillsContent />
}

function WaybillsContent() {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const { data: waybills, isLoading, isError, refetch } = useWaybills({ search, status })
  const canUpdate = usePermission('waybills.update')
  const canManage = usePermission('waybills.manage')
  const updateStatus = useUpdateWaybillStatus()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Waybills</h1>
        <p className="mt-1 text-sm text-muted-foreground">Physical dispatch records. Create a waybill from an order's detail page.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search waybill, order, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="CREATED">Created</SelectItem>
            <SelectItem value="READY">Ready</SelectItem>
            <SelectItem value="DISPATCHED">Dispatched</SelectItem>
            <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
            <SelectItem value="OUT_FOR_DELIVERY">Out for Delivery</SelectItem>
            <SelectItem value="DELIVERED">Delivered</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="RETURNED">Returned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load waybills." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading waybills…" />
            </div>
          ) : (waybills?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Truck} title="No waybills yet" description="Create one from an order's detail page once it's ready for dispatch." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Waybill</th>
                    <th className="px-5 py-3 font-semibold">Order</th>
                    <th className="px-5 py-3 font-semibold">Partner</th>
                    <th className="px-5 py-3 font-semibold">COD Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {waybills?.map((w) => (
                    <tr key={w.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3 font-mono text-xs">{w.waybill_number}</td>
                      <td className="px-5 py-3">
                        {w.order && (
                          <Link to={`/orders/${w.order_id}`} className="font-medium hover:text-primary">
                            {w.order.order_number}
                          </Link>
                        )}
                        {w.order && <p className="text-xs text-muted-foreground">{w.order.customer_name}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{w.delivery_partner?.name ?? '—'}</td>
                      <td className="px-5 py-3 font-semibold">{formatCurrency(w.cod_amount, null)}</td>
                      <td className="px-5 py-3">
                        <Badge variant={statusTone[w.status]}>{w.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {(canUpdate || canManage) && nextStatus[w.status]?.map((n) => (
                          <Button
                            key={n.status}
                            size="sm"
                            variant="outline"
                            className="ml-2"
                            onClick={() => updateStatus.mutate({ waybillId: w.id, status: n.status })}
                            disabled={updateStatus.isPending}
                          >
                            {n.label}
                          </Button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
