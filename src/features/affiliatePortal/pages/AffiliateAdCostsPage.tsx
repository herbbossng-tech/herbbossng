import { CheckCircle2, Clock, Plus, TrendingUp, XCircle } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'

import { useMyAdCosts, useMyAvailableCampaigns, useSubmitMyAdCost } from '../hooks'

function SubmitAdCostDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: campaigns } = useMyAvailableCampaigns()
  const [campaignId, setCampaignId] = React.useState('')
  const [periodStart, setPeriodStart] = React.useState('')
  const [periodEnd, setPeriodEnd] = React.useState('')
  const [costAmount, setCostAmount] = React.useState('')
  const [ordersCount, setOrdersCount] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const submitMutation = useSubmitMyAdCost()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!campaignId || !periodStart || !periodEnd || !costAmount || !ordersCount) {
      setError('All fields except notes are required.')
      return
    }
    try {
      await submitMutation.mutateAsync({
        campaignId,
        periodStart,
        periodEnd,
        costAmount: Number(costAmount),
        ordersCount: Number(ordersCount),
        notes: notes || undefined,
      })
      setCampaignId('')
      setPeriodStart('')
      setPeriodEnd('')
      setCostAmount('')
      setOrdersCount('')
      setNotes('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit this ad cost')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Submit Ad Cost</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 p-6 pt-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a campaign" />
              </SelectTrigger>
              <SelectContent>
                {(campaigns ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Period start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Period end</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Amount spent</Label>
              <Input type="number" min={0} value={costAmount} onChange={(e) => setCostAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Orders generated</Label>
              <Input type="number" min={0} value={ordersCount} onChange={(e) => setOrdersCount(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Facebook ads" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? 'Submitting…' : 'Submit Ad Cost'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AffiliateAdCostsPage() {
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all')
  const { data: allAdCosts } = useMyAdCosts(null)
  const {
    data: filteredAdCosts,
    isLoading,
    isError,
    refetch,
  } = useMyAdCosts(statusFilter === 'all' ? null : statusFilter)
  const adCosts = statusFilter === 'all' ? allAdCosts : filteredAdCosts
  const [submitOpen, setSubmitOpen] = React.useState(false)

  const pending = (allAdCosts ?? []).filter((a) => a.status === 'PENDING')
  const approved = (allAdCosts ?? []).filter((a) => a.status === 'APPROVED')
  const rejected = (allAdCosts ?? []).filter((a) => a.status === 'REJECTED')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Ad Costs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track and manage your advertising expenses.</p>
        </div>
        <Button onClick={() => setSubmitOpen(true)}>
          <Plus className="h-4 w-4" />
          Submit Ad Cost
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-warning" />
            <div>
              <p className="text-xs text-muted-foreground">Pending Approval</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(pending.reduce((s, a) => s + a.initial_cost_amount, 0), 'NGN')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(approved.reduce((s, a) => s + a.initial_cost_amount, 0), 'NGN')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Rejected</p>
              <p className="text-lg font-bold text-foreground">{rejected.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total Reviewed</p>
              <p className="text-lg font-bold text-foreground">{approved.length + rejected.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <SelectTrigger className="sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="APPROVED">Approved</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Loading ad costs…" />
          ) : isError ? (
            <ErrorState message="Couldn't load your ad costs." onRetry={() => refetch()} />
          ) : (adCosts ?? []).length === 0 ? (
            <EmptyState icon={TrendingUp} title="No ad costs yet" description="You haven't submitted any ad costs yet. Click 'Submit Ad Cost' to get started." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {adCosts?.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(a.period_start).toLocaleDateString()} – {new Date(a.period_end).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.initial_orders_count} orders{a.notes ? ` · ${a.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={a.status === 'APPROVED' ? 'success' : a.status === 'REJECTED' ? 'destructive' : 'secondary'}>{a.status}</Badge>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(a.initial_cost_amount, a.currency_code)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SubmitAdCostDialog open={submitOpen} onOpenChange={setSubmitOpen} />
    </div>
  )
}
