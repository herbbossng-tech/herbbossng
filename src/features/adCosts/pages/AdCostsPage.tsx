import { BarChart3, CheckCircle2, Lock, Plus, XCircle } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useApproveAdCost, useCreateAdCost, useRejectAdCost, useAdCosts } from '@/features/adCosts/hooks'
import { useCampaigns } from '@/features/campaigns/hooks'
import { formatCurrency } from '@/lib/currency'

const statusToneMap: Record<string, 'success' | 'warning' | 'destructive'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
}

export function AdCostsPage() {
  const canView = usePermission('ad_costs.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Ad Costs is hidden" description="You don't have permission to view ad costs. Ask a workspace admin for the ad_costs.view permission." />
      </Card>
    )
  }
  return <AdCostsContent />
}

function AdCostsContent() {
  const { activeBrand } = useWorkspace()
  const [status, setStatus] = React.useState('all')
  const { data: adCosts, isLoading, isError, refetch } = useAdCosts({ status })
  const [createOpen, setCreateOpen] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')

  const canApprove = usePermission('ad_costs.approve')
  const approve = useApproveAdCost()
  const reject = useRejectAdCost()

  if (!activeBrand) {
    return (
      <Card className="p-8">
        <EmptyState icon={BarChart3} title="Select a brand" description="Ad costs are scoped to a brand — pick one from the switcher to continue." />
      </Card>
    )
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectTarget) return
    setActionError(null)
    try {
      await reject.mutateAsync({ id: rejectTarget, reason: rejectReason })
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject ad cost')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Ad Costs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Initial Cost/Order and Delivered Cost/Order — only approved entries feed reports and analytics.
          </p>
        </div>
        <PermissionGate permission="ad_costs.create">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Entry
          </Button>
        </PermissionGate>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="APPROVED">Approved</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
        </SelectContent>
      </Select>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load ad costs." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading ad costs…" />
            </div>
          ) : (adCosts?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={BarChart3} title="No ad cost entries yet" description="Submit spend for a period to track cost per order." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Period</th>
                    <th className="px-5 py-3 font-semibold">Cost</th>
                    <th className="px-5 py-3 font-semibold">Initial Cost/Order</th>
                    <th className="px-5 py-3 font-semibold">Delivered Cost/Order</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {adCosts?.map((ac) => {
                    const initialPerOrder = ac.initial_orders_count > 0 ? ac.initial_cost_amount / ac.initial_orders_count : null
                    const deliveredPerOrder = (ac.delivered_orders_count ?? 0) > 0 ? ac.initial_cost_amount / (ac.delivered_orders_count as number) : null
                    return (
                      <tr key={ac.id} className="border-t border-border/60">
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {new Date(ac.period_start).toLocaleDateString()} – {new Date(ac.period_end).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 font-medium">{formatCurrency(ac.initial_cost_amount, ac.currency_code)}</td>
                        <td className="px-5 py-3">{initialPerOrder !== null ? formatCurrency(initialPerOrder, ac.currency_code) : '—'}</td>
                        <td className="px-5 py-3">{deliveredPerOrder !== null ? formatCurrency(deliveredPerOrder, ac.currency_code) : '—'}</td>
                        <td className="px-5 py-3">
                          <Badge variant={statusToneMap[ac.status]}>{ac.status}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {ac.status === 'PENDING' && canApprove && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => approve.mutate(ac.id)} disabled={approve.isPending}>
                                <CheckCircle2 className="h-4 w-4" />
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => setRejectTarget(ac.id)}>
                                <XCircle className="h-4 w-4" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAdCostDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject ad cost entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReject} className="flex flex-col gap-4 p-6 pt-2">
            <Textarea required placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={reject.isPending}>
                Reject
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateAdCostDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { activeWorkspace } = useWorkspace()
  const { data: campaigns } = useCampaigns()
  const createAdCost = useCreateAdCost()

  const [campaignId, setCampaignId] = React.useState('')
  const [periodStart, setPeriodStart] = React.useState('')
  const [periodEnd, setPeriodEnd] = React.useState('')
  const [costAmount, setCostAmount] = React.useState('')
  const [initialOrders, setInitialOrders] = React.useState('')
  const [deliveredOrders, setDeliveredOrders] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setCampaignId('')
      setPeriodStart('')
      setPeriodEnd('')
      setCostAmount('')
      setInitialOrders('')
      setDeliveredOrders('')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cost = Number(costAmount)
    const orders = Number(initialOrders)
    if (!periodStart || !periodEnd) {
      setError('Select a period.')
      return
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError('Enter a valid cost amount.')
      return
    }
    if (!Number.isFinite(orders) || orders < 0) {
      setError('Enter a valid initial orders count.')
      return
    }
    try {
      await createAdCost.mutateAsync({
        campaign_id: campaignId || null,
        period_start: periodStart,
        period_end: periodEnd,
        initial_cost_amount: cost,
        initial_orders_count: orders,
        delivered_orders_count: deliveredOrders ? Number(deliveredOrders) : null,
        currency_code: activeWorkspace.currency_code ?? 'NGN',
        notes: notes || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ad cost entry')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Ad Cost Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Campaign (optional)</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="No specific campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Period start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Period end</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Total spend</Label>
            <Input type="number" min="0" step="0.01" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Orders created</Label>
              <Input type="number" min="0" value={initialOrders} onChange={(e) => setInitialOrders(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Orders delivered (optional)</Label>
              <Input type="number" min="0" value={deliveredOrders} onChange={(e) => setDeliveredOrders(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAdCost.isPending}>
              {createAdCost.isPending ? 'Saving…' : 'Submit for approval'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
