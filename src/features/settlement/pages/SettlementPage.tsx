import { AlertTriangle, Lock, Search, Wallet } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { usePermission } from '@/contexts/PermissionsContext'
import { useMarkSettlementDisputed, useSettlements } from '@/features/settlement/hooks'
import { formatCurrency } from '@/lib/currency'

const statusTone: Record<string, 'secondary' | 'info' | 'success' | 'destructive' | 'warning'> = {
  PENDING: 'secondary',
  PARTIALLY_SETTLED: 'warning',
  SETTLED: 'success',
  DISPUTED: 'destructive',
}

export function SettlementPage() {
  const canView = usePermission('settlement.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="COD Settlement is hidden" description="You don't have permission to view settlements. Ask a workspace admin for the settlement.view permission." />
      </Card>
    )
  }
  return <SettlementContent />
}

function SettlementContent() {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const { data: settlements, isLoading, isError, refetch } = useSettlements({ search, status })
  const canManage = usePermission('settlement.manage')
  const markDisputed = useMarkSettlementDisputed()
  const [disputeId, setDisputeId] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">COD Settlement</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cash-reconciliation ledger — collected cash vs. what's been remitted. Record a settlement from an order's detail page.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search order, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="PARTIALLY_SETTLED">Partially Settled</SelectItem>
            <SelectItem value="SETTLED">Settled</SelectItem>
            <SelectItem value="DISPUTED">Disputed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load settlements." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading settlements…" />
            </div>
          ) : (settlements?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Wallet} title="No settlements yet" description="Record a settlement from a delivered order's detail page once cash has been collected." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Order</th>
                    <th className="px-5 py-3 font-semibold">Collected</th>
                    <th className="px-5 py-3 font-semibold">Fee</th>
                    <th className="px-5 py-3 font-semibold">Remitted</th>
                    <th className="px-5 py-3 font-semibold">Discrepancy</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {settlements?.map((s) => (
                    <tr key={s.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3">
                        {s.order && (
                          <Link to={`/orders/${s.order_id}`} className="font-medium hover:text-primary">
                            {s.order.order_number}
                          </Link>
                        )}
                        {s.order && <p className="text-xs text-muted-foreground">{s.order.customer_name}</p>}
                      </td>
                      <td className="px-5 py-3">{formatCurrency(s.collected_amount, null)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatCurrency(s.delivery_fee, null)}</td>
                      <td className="px-5 py-3">{formatCurrency(s.remitted_amount, null)}</td>
                      <td className="px-5 py-3">
                        {s.discrepancy !== 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {formatCurrency(s.discrepancy, null)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusTone[s.status]}>{s.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canManage && s.status !== 'DISPUTED' && s.status !== 'SETTLED' && (
                          <Button size="sm" variant="outline" onClick={() => setDisputeId(s.id)}>
                            Mark Disputed
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DisputeDialog
        settlementId={disputeId}
        onOpenChange={(open) => !open && setDisputeId(null)}
        onSubmit={async (reason) => {
          if (!disputeId) return
          await markDisputed.mutateAsync({ settlementId: disputeId, reason })
          setDisputeId(null)
        }}
        isPending={markDisputed.isPending}
      />
    </div>
  )
}

function DisputeDialog({
  settlementId,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  settlementId: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (reason: string) => Promise<void>
  isPending: boolean
}) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!settlementId) {
      setReason('')
      setError(null)
    }
  }, [settlementId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setError('A dispute reason is required.')
      return
    }
    setError(null)
    try {
      await onSubmit(reason.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark disputed')
    }
  }

  return (
    <Dialog open={Boolean(settlementId)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Settlement Disputed</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Dispute reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Saving…' : 'Mark Disputed'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
