import { CreditCard, TrendingUp, Wallet } from 'lucide-react'
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

import { useMyBankAccounts, useMyWalletSummary, useMyWalletTransactions, useMyWithdrawals, useRequestMyWithdrawal } from '../hooks'

function StatCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function RequestWithdrawalDialog({ open, onOpenChange, maxAmount }: { open: boolean; onOpenChange: (open: boolean) => void; maxAmount: number }) {
  const { data: accounts } = useMyBankAccounts()
  const [amount, setAmount] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const requestMutation = useRequestMyWithdrawal()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Enter a valid amount.')
      return
    }
    if (numAmount > maxAmount) {
      setError(`You can withdraw at most ${formatCurrency(maxAmount, 'NGN')}.`)
      return
    }
    if (!accountId) {
      setError('Select a bank account.')
      return
    }
    try {
      await requestMutation.mutateAsync({ amount: numAmount, bankAccountId: accountId, note: note || undefined })
      setAmount('')
      setAccountId('')
      setNote('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit this withdrawal request')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Request Withdrawal</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 p-6 pt-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Amount</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">Available: {formatCurrency(maxAmount, 'NGN')}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Bank account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder={(accounts ?? []).length === 0 ? 'Add a bank account first' : 'Select an account'} />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.bank_name} — {a.account_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={requestMutation.isPending}>
              {requestMutation.isPending ? 'Submitting…' : 'Request Withdrawal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AffiliateWalletPage() {
  const { data: summary, isLoading, isError, refetch } = useMyWalletSummary()
  const { data: transactions } = useMyWalletTransactions()
  const { data: withdrawals } = useMyWithdrawals()
  const { data: accounts } = useMyBankAccounts()
  const [requestOpen, setRequestOpen] = React.useState(false)

  if (isLoading) return <LoadingState label="Loading your wallet…" />
  if (isError || !summary) return <ErrorState message="Couldn't load your wallet." onRetry={() => refetch()} />

  const currency = summary.wallet_currency_code ?? 'NGN'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your earnings and withdrawals.</p>
        </div>
        <Button onClick={() => setRequestOpen(true)} disabled={(accounts ?? []).length === 0 || summary.wallet_balance <= 0}>
          Request Withdrawal
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Wallet} label="Available Balance" value={formatCurrency(summary.wallet_balance, currency)} />
        <StatCard icon={TrendingUp} label="Total Earned" value={formatCurrency(summary.lifetime_earned, currency)} />
        <StatCard icon={CreditCard} label="Total Paid" value={formatCurrency(summary.lifetime_paid, currency)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Withdrawal Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {(withdrawals ?? []).length === 0 ? (
            <EmptyState icon={CreditCard} title="No withdrawal requests yet" description="Request a withdrawal once you have a wallet balance." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {withdrawals?.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatCurrency(w.amount, w.currency_code)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(w.requested_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={w.status === 'PAID' ? 'success' : w.status === 'REJECTED' ? 'destructive' : 'secondary'}>{w.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {(transactions ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {transactions?.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.description ?? t.transaction_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-sm font-semibold ${t.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {t.amount >= 0 ? '+' : ''}
                    {formatCurrency(t.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RequestWithdrawalDialog open={requestOpen} onOpenChange={setRequestOpen} maxAmount={summary.wallet_balance} />
    </div>
  )
}
