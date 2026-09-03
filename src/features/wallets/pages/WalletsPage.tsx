import { Lock, Plus, Wallet } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useAffiliates } from '@/features/affiliates/hooks'
import { useAllWalletTransactions, useCreateManualWalletTransaction, useWorkspaceWallets } from '@/features/wallets/hooks'
import { formatCurrency } from '@/lib/currency'

export function WalletsPage() {
  const canView = usePermission('wallets.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Wallets is hidden" description="You don't have permission to view affiliate wallets. Ask a workspace admin for the wallets.view permission." />
      </Card>
    )
  }
  return <WalletsContent />
}

function WalletsContent() {
  const { data: wallets, isLoading, isError, refetch } = useWorkspaceWallets()
  const { data: transactions } = useAllWalletTransactions()
  const [creditOpen, setCreditOpen] = React.useState(false)

  const totalBalance = (wallets ?? []).reduce((sum, w) => sum + w.balance, 0)
  const totalReserved = (wallets ?? []).reduce((sum, w) => sum + w.reserved_balance, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Wallet & Credits</h1>
          <p className="mt-1 text-sm text-muted-foreground">Affiliate balances, ledger and manual credits.</p>
        </div>
        <PermissionGate permission="wallets.manage">
          <Button size="sm" onClick={() => setCreditOpen(true)}>
            <Plus className="h-4 w-4" />
            Manual Credit/Debit
          </Button>
        </PermissionGate>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Available Balance (all affiliates)</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalBalance, null)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Reserved (pending withdrawals)</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totalReserved, null)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Affiliate Balances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 pb-5">
              <ErrorState message="Couldn't load wallets." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 pb-5">
              <LoadingState label="Loading wallets…" />
            </div>
          ) : (wallets?.length ?? 0) === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={Wallet} title="No wallets yet" description="Wallets are created automatically the first time an affiliate earns a commission or receives a manual credit." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Affiliate</th>
                    <th className="px-5 py-3 font-semibold">Available</th>
                    <th className="px-5 py-3 font-semibold">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets?.map((w) => (
                    <tr key={w.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <Link to={`/affiliates/${w.affiliate.id}`} className="font-medium hover:text-primary">
                          {w.affiliate.full_name}
                        </Link>
                        <p className="text-xs font-mono text-muted-foreground">{w.affiliate.referral_code}</p>
                      </td>
                      <td className="px-5 py-3 font-medium">{formatCurrency(w.balance, w.currency_code)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatCurrency(w.reserved_balance, w.currency_code)}</td>
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
          <CardTitle className="text-base">Recent Ledger Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(transactions?.length ?? 0) === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={Wallet} title="No activity yet" description="Commission credits, manual adjustments and withdrawal movements will appear here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Affiliate</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions?.slice(0, 30).map((t) => (
                    <tr key={t.id} className="border-t border-border/60">
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3">{t.affiliate?.full_name ?? '—'}</td>
                      <td className="px-5 py-3 capitalize">{t.transaction_type.replace(/_/g, ' ').toLowerCase()}</td>
                      <td className={`px-5 py-3 font-medium ${t.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                        {t.amount >= 0 ? '+' : ''}
                        {formatCurrency(t.amount, null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ManualCreditDialog open={creditOpen} onOpenChange={setCreditOpen} />
    </div>
  )
}

function ManualCreditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: affiliates } = useAffiliates({ approvalStatus: 'approved' })
  const createTxn = useCreateManualWalletTransaction()
  const [affiliateId, setAffiliateId] = React.useState('')
  const [direction, setDirection] = React.useState<'credit' | 'debit'>('credit')
  const [amount, setAmount] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setAffiliateId('')
      setDirection('credit')
      setAmount('')
      setReason('')
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
    if (!reason.trim()) {
      setError('A reason is required.')
      return
    }
    try {
      await createTxn.mutateAsync({ affiliateId, amount: direction === 'credit' ? value : -value, reason })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record transaction')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Wallet Credit/Debit</DialogTitle>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as 'credit' | 'debit')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (add funds)</SelectItem>
                  <SelectItem value="debit">Debit (remove funds)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Required for the audit trail" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTxn.isPending}>
              {createTxn.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
