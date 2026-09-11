import { Banknote, CheckCircle2, Lock, Plus, XCircle } from 'lucide-react'
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
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useAffiliates } from '@/features/affiliates/hooks'
import {
  useApproveWithdrawal,
  useMarkWithdrawalPaid,
  useRejectWithdrawal,
  useRequestWithdrawal,
  useWithdrawals,
} from '@/features/withdrawals/hooks'
import { formatCurrency } from '@/lib/currency'

const statusToneMap: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'info'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  REJECTED: 'destructive',
  PAID: 'success',
}

export function WithdrawalsPage() {
  const canView = usePermission('withdrawals.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Withdrawals is hidden" description="You don't have permission to view withdrawals. Ask a workspace admin for the withdrawals.view permission." />
      </Card>
    )
  }
  return <WithdrawalsContent />
}

function WithdrawalsContent() {
  const [status, setStatus] = React.useState('all')
  const { data: withdrawals, isLoading, isError, refetch } = useWithdrawals({ status })
  const [requestOpen, setRequestOpen] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')

  const canApprove = usePermission('withdrawals.approve')
  const canManage = usePermission('withdrawals.manage')
  const approve = useApproveWithdrawal()
  const reject = useRejectWithdrawal()
  const markPaid = useMarkWithdrawalPaid()

  async function handleReject(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectTarget) return
    setActionError(null)
    try {
      await reject.mutateAsync({ id: rejectTarget, reason: rejectReason })
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject withdrawal')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Withdrawals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Affiliate payout requests — reserved from balance the moment they're requested.</p>
        </div>
        <PermissionGate permission="withdrawals.create">
          <Button size="sm" onClick={() => setRequestOpen(true)}>
            <Plus className="h-4 w-4" />
            Request Withdrawal
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
          <SelectItem value="PAID">Paid</SelectItem>
        </SelectContent>
      </Select>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load withdrawals." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading withdrawals…" />
            </div>
          ) : (withdrawals?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Banknote} title="No withdrawal requests yet" description="Requests will appear here for approval and payout." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Affiliate</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Requested</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {withdrawals?.map((w) => (
                    <tr key={w.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <Link to={`/affiliates/${w.affiliate.id}`} className="font-medium hover:text-primary">
                          {w.affiliate.full_name}
                        </Link>
                        <p className="text-xs font-mono text-muted-foreground">{w.affiliate.referral_code}</p>
                      </td>
                      <td className="px-5 py-3 font-medium">{formatCurrency(w.amount, w.currency_code)}</td>
                      <td className="px-5 py-3">
                        <Badge variant={statusToneMap[w.status] ?? 'secondary'}>{w.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(w.requested_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {w.status === 'PENDING' && canApprove && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => approve.mutate(w.id)} disabled={approve.isPending}>
                                <CheckCircle2 className="h-4 w-4" />
                                Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => setRejectTarget(w.id)}>
                                <XCircle className="h-4 w-4" />
                                Reject
                              </Button>
                            </>
                          )}
                          {w.status === 'APPROVED' && canManage && (
                            <Button size="sm" onClick={() => markPaid.mutate({ id: w.id })} disabled={markPaid.isPending}>
                              Mark Paid
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RequestWithdrawalDialog open={requestOpen} onOpenChange={setRequestOpen} />

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject withdrawal</DialogTitle>
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

function RequestWithdrawalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: affiliates } = useAffiliates({ approvalStatus: 'approved' })
  const requestWithdrawal = useRequestWithdrawal()
  const [affiliateId, setAffiliateId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setAffiliateId('')
      setAmount('')
      setNote('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!affiliateId) {
      setError('Select an affiliate.')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a positive amount.')
      return
    }
    try {
      await requestWithdrawal.mutateAsync({ affiliateId, amount: value, note: note || undefined })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request withdrawal')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Withdrawal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Affiliate</Label>
            <Select value={affiliateId} onValueChange={setAffiliateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an affiliate" />
              </SelectTrigger>
              <SelectContent>
                {affiliates?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name} ({a.referral_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Amount</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">This immediately reserves the amount from the affiliate's available balance. The request fails if the balance is insufficient.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={requestWithdrawal.isPending}>
              {requestWithdrawal.isPending ? 'Requesting…' : 'Request'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
