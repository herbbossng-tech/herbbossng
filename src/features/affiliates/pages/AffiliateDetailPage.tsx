import { ArrowLeft, Banknote, CheckCircle2, Lock, PauseCircle, PlayCircle, Wallet, XCircle } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { usePermission } from '@/contexts/PermissionsContext'
import {
  useAffiliate,
  useAffiliateCommissions,
  useAffiliateOrders,
  useAffiliateWallet,
  useAffiliateWalletTransactions,
  useApproveAffiliate,
  useReactivateAffiliate,
  useRejectAffiliate,
  useSuspendAffiliate,
} from '@/features/affiliates/hooks'
import { formatCurrency } from '@/lib/currency'

const commissionToneMap: Record<string, 'success' | 'secondary' | 'destructive'> = {
  ELIGIBLE: 'success',
  EXEMPT: 'secondary',
  REVERSED: 'destructive',
}

export function AffiliateDetailPage() {
  const canView = usePermission('affiliates.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Affiliates is hidden" description="You don't have permission to view affiliate details." />
      </Card>
    )
  }
  return <AffiliateDetailContent />
}

function AffiliateDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: affiliate, isLoading, isError, refetch } = useAffiliate(id)
  const { data: wallet } = useAffiliateWallet(id)
  const { data: transactions } = useAffiliateWalletTransactions(id)
  const { data: commissions } = useAffiliateCommissions(id)
  const { data: orders } = useAffiliateOrders(id)
  const canApprove = usePermission('affiliates.approve')

  const approve = useApproveAffiliate(id ?? '')
  const reject = useRejectAffiliate(id ?? '')
  const suspend = useSuspendAffiliate(id ?? '')
  const reactivate = useReactivateAffiliate(id ?? '')

  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectReason, setRejectReason] = React.useState('')
  const [suspendOpen, setSuspendOpen] = React.useState(false)
  const [suspendReason, setSuspendReason] = React.useState('')
  const [actionError, setActionError] = React.useState<string | null>(null)

  if (isLoading) return <LoadingState label="Loading affiliate…" />
  if (isError) return <ErrorState message="Couldn't load affiliate." onRetry={() => refetch()} />
  if (!affiliate) return <ErrorState title="Affiliate not found" message="This affiliate may have been removed." />

  async function handleReject(e: React.FormEvent) {
    e.preventDefault()
    setActionError(null)
    try {
      await reject.mutateAsync(rejectReason)
      setRejectOpen(false)
      setRejectReason('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject affiliate')
    }
  }

  async function handleSuspend(e: React.FormEvent) {
    e.preventDefault()
    setActionError(null)
    try {
      await suspend.mutateAsync(suspendReason || undefined)
      setSuspendOpen(false)
      setSuspendReason('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to suspend affiliate')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/affiliates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Affiliates
        </Link>
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{affiliate.full_name}</h1>
            <Badge variant={affiliate.approval_status === 'approved' ? 'success' : affiliate.approval_status === 'rejected' ? 'destructive' : 'warning'} className="capitalize">
              {affiliate.approval_status}
            </Badge>
            {affiliate.approval_status === 'approved' && (
              <Badge variant={affiliate.status === 'active' ? 'success' : 'destructive'} className="capitalize">
                {affiliate.status}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {affiliate.email ?? 'No email'} · {affiliate.phone ?? 'No phone'} · Referral code <span className="font-mono">{affiliate.referral_code}</span>
          </p>
        </div>

        {canApprove && (
          <div className="flex flex-wrap gap-2">
            {affiliate.approval_status === 'pending' && (
              <>
                <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
            {affiliate.approval_status === 'approved' && affiliate.status === 'active' && (
              <Button size="sm" variant="outline" onClick={() => setSuspendOpen(true)}>
                <PauseCircle className="h-4 w-4" />
                Suspend
              </Button>
            )}
            {affiliate.approval_status === 'approved' && affiliate.status === 'suspended' && (
              <Button size="sm" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}>
                <PlayCircle className="h-4 w-4" />
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>

      {affiliate.rejection_reason && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm">
          <span className="font-medium text-destructive">Rejected:</span> {affiliate.rejection_reason}
        </Card>
      )}
      {affiliate.suspension_reason && (
        <Card className="border-warning/40 bg-warning/5 p-4 text-sm">
          <span className="font-medium">Suspended:</span> {affiliate.suspension_reason}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Available Balance</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(wallet?.balance ?? 0, wallet?.currency_code)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reserved (pending withdrawal)</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(wallet?.reserved_balance ?? 0, wallet?.currency_code)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Attributed Orders</p>
          <p className="mt-1 text-2xl font-bold">{orders?.length ?? 0}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Commissions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(commissions?.length ?? 0) === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={Banknote} title="No commissions yet" description="Commissions appear once an attributed order qualifies." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Base</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions?.map((c) => (
                    <tr key={c.id} className="border-t border-border/60">
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3">{formatCurrency(c.commission_base_amount, c.currency_code)}</td>
                      <td className="px-5 py-3 font-medium">{formatCurrency(c.commission_amount, c.currency_code)}</td>
                      <td className="px-5 py-3">
                        <Badge variant={commissionToneMap[c.status] ?? 'secondary'} className="capitalize">
                          {c.status.toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wallet Ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(transactions?.length ?? 0) === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={Wallet} title="No wallet activity yet" description="Credits, debits and withdrawals will appear here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions?.map((t) => (
                    <tr key={t.id} className="border-t border-border/60">
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3 capitalize">{t.transaction_type.replace(/_/g, ' ').toLowerCase()}</td>
                      <td className={`px-5 py-3 font-medium ${t.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                        {t.amount >= 0 ? '+' : ''}
                        {formatCurrency(t.amount, null)}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{t.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this affiliate?</AlertDialogTitle>
          </AlertDialogHeader>
          <form onSubmit={handleReject} className="mt-4 flex flex-col gap-3">
            <Textarea required placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <AlertDialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={reject.isPending}>
                Reject
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend this affiliate?</AlertDialogTitle>
          </AlertDialogHeader>
          <form onSubmit={handleSuspend} className="mt-4 flex flex-col gap-3">
            <Textarea placeholder="Reason (optional)" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} />
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            <AlertDialogFooter>
              <Button type="button" variant="outline" onClick={() => setSuspendOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={suspend.isPending}>
                Suspend
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
