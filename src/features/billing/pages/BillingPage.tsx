import { AlertTriangle, Banknote, Check, Clock, CreditCard, Landmark, Lock, Wallet } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import {
  useActiveCryptoConfigs,
  useActivePaymentMethods,
  useCancelSubscription,
  usePublicPlans,
  useSubmitTenantPayment,
  useSubscribeToPlan,
  useWorkspaceEntitlements,
  useWorkspacePayments,
  useWorkspaceSubscription,
} from '@/features/billing/hooks'
import { formatCurrency } from '@/lib/currency'
import type { BillingInterval, PaymentMethodType, SubscriptionPlan, TenantPaymentStatus } from '@/types/database'

const statusTone: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  TRIALING: 'info',
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  GRACE_PERIOD: 'warning',
  SUSPENDED: 'destructive',
  CANCELLED: 'secondary',
  EXPIRED: 'destructive',
  NONE: 'secondary',
}

const paymentStatusTone: Record<TenantPaymentStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  PENDING: 'secondary',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  FAILED: 'destructive',
  REFUNDED: 'secondary',
}

const methodIcon: Record<PaymentMethodType, typeof CreditCard> = {
  card: CreditCard,
  bank_transfer: Landmark,
  gateway: Landmark,
  crypto: Wallet,
  manual: Banknote,
}

export function BillingPage() {
  const canView = usePermission('billing.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Billing is hidden" description="You don't have permission to view billing in this workspace. Ask a workspace admin for the billing.view permission." />
      </Card>
    )
  }
  return <BillingContent />
}

function BillingContent() {
  const canManage = usePermission('billing.manage')
  const { data: subscription, isLoading, isError, refetch } = useWorkspaceSubscription()
  const { data: entitlements } = useWorkspaceEntitlements()
  const { data: plans } = usePublicPlans()
  const { data: payments } = useWorkspacePayments()
  const [payOpen, setPayOpen] = React.useState(false)
  const [payPlan, setPayPlan] = React.useState<SubscriptionPlan | null>(null)
  const cancelSub = useCancelSubscription()

  if (isLoading) return <LoadingState label="Loading billing…" />
  if (isError) return <ErrorState message="We couldn't load billing information." onRetry={() => refetch()} />

  const currentPlan = plans?.find((p) => p.id === subscription?.plan_id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your GCOS subscription, plan, and payment history.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!subscription ? (
            <EmptyState icon={Wallet} title="No subscription yet" description="Choose a plan below to get started." />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xl font-bold text-foreground">{currentPlan?.name ?? 'Unknown plan'}</span>
                <Badge variant={statusTone[subscription.status] ?? 'secondary'}>{subscription.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-semibold text-foreground">
                    {formatCurrency(subscription.amount, subscription.currency_code)} / {subscription.billing_interval}
                  </p>
                </div>
                {subscription.status === 'TRIALING' && subscription.trial_ends_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Trial ends</p>
                    <p className="font-semibold text-foreground">{new Date(subscription.trial_ends_at).toLocaleDateString()}</p>
                  </div>
                )}
                {subscription.current_period_end && (
                  <div>
                    <p className="text-xs text-muted-foreground">Current period ends</p>
                    <p className="font-semibold text-foreground">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
                  </div>
                )}
                {subscription.renewal_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Renews</p>
                    <p className="font-semibold text-foreground">{new Date(subscription.renewal_at).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              {(subscription.status === 'PAST_DUE' || subscription.status === 'TRIALING' || subscription.status === 'GRACE_PERIOD') && canManage && currentPlan && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Payment required to activate/continue this subscription.</span>
                  <Button size="sm" onClick={() => { setPayPlan(currentPlan); setPayOpen(true) }}>
                    Submit Payment
                  </Button>
                </div>
              )}
              {canManage && subscription.status === 'ACTIVE' && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancelSub.isPending}
                    onClick={() => {
                      if (confirm('Cancel this subscription? You will lose access to plan features at the end of the current period.')) {
                        cancelSub.mutate(undefined)
                      }
                    }}
                  >
                    Cancel Subscription
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {entitlements && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan Limits</CardTitle>
            <CardDescription>Blank means unlimited.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
            {([
              ['Staff seats', entitlements.max_staff],
              ['Orders', entitlements.max_orders],
              ['Warehouses', entitlements.max_warehouses],
              ['Brands', entitlements.max_brands],
              ['Landing pages', entitlements.max_landing_pages],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold text-foreground">{value ?? '—'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Plans</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(plans ?? []).map((plan) => (
            <div key={plan.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">{plan.name}</p>
                {plan.is_popular && <Badge>Popular</Badge>}
              </div>
              <p className="text-2xl font-extrabold text-foreground">
                {plan.is_custom_pricing ? 'Custom' : formatCurrency(plan.monthly_price, plan.currency_code)}
                {!plan.is_custom_pricing && <span className="text-sm font-normal text-muted-foreground"> /mo</span>}
              </p>
              <p className="text-xs text-muted-foreground">{plan.description}</p>
              {canManage && (
                <Button
                  size="sm"
                  variant={subscription?.plan_id === plan.id ? 'secondary' : 'default'}
                  disabled={subscription?.plan_id === plan.id}
                  onClick={() => { setPayPlan(plan); setPayOpen(true) }}
                >
                  {subscription?.plan_id === plan.id ? 'Current Plan' : 'Choose Plan'}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(payments ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 font-semibold">Amount</th>
                    <th className="px-4 py-2.5 font-semibold">Method</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-semibold">{formatCurrency(p.amount, p.currency_code)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{p.payment_method_type}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={paymentStatusTone[p.status]}>{p.status}</Badge>
                        {p.status === 'REJECTED' && p.rejection_reason && (
                          <p className="mt-1 text-xs text-destructive">{p.rejection_reason}</p>
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

      <SubmitPaymentDialog open={payOpen} onOpenChange={setPayOpen} plan={payPlan} />
    </div>
  )
}

function SubmitPaymentDialog({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (v: boolean) => void; plan: SubscriptionPlan | null }) {
  const { activeWorkspace } = useWorkspace()
  const { data: methods } = useActivePaymentMethods()
  const { data: cryptoConfigs } = useActiveCryptoConfigs()
  const subscribe = useSubscribeToPlan()
  const submitPayment = useSubmitTenantPayment()
  const [interval, setInterval_] = React.useState<BillingInterval>('monthly')
  const [methodType, setMethodType] = React.useState<PaymentMethodType | ''>('')
  const [cryptoConfigId, setCryptoConfigId] = React.useState('')
  const [txReference, setTxReference] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setMethodType('')
      setCryptoConfigId('')
      setTxReference('')
      setError(null)
      setSuccess(false)
      setInterval_('monthly')
    }
  }, [open])

  const selectedCrypto = cryptoConfigs?.find((c) => c.id === cryptoConfigId)

  async function handleSubmit() {
    if (!plan || !methodType) return
    setError(null)
    try {
      await subscribe.mutateAsync({ planId: plan.id, billingInterval: interval })
      await submitPayment.mutateAsync({
        workspaceId: activeWorkspace.id,
        planId: plan.id,
        billingInterval: interval,
        paymentMethodType: methodType,
        idempotencyKey: `${plan.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        cryptoConfigId: methodType === 'crypto' ? cryptoConfigId : null,
        cryptoTxReference: methodType === 'crypto' ? txReference : null,
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit payment')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Subscribe to {plan?.name}</DialogTitle>
        </DialogHeader>
        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-6 w-6" />
            </span>
            <p className="font-semibold text-foreground">Payment submitted for review</p>
            <p className="text-sm text-muted-foreground">A platform administrator will review and confirm your payment. Your plan activates automatically once confirmed.</p>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Billing interval</Label>
              <Select value={interval} onValueChange={(v) => setInterval_(v as BillingInterval)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly {plan && `(${formatCurrency(plan.monthly_price, plan.currency_code)})`}</SelectItem>
                  {plan?.annual_price != null && <SelectItem value="annual">Annual ({formatCurrency(plan.annual_price, plan.currency_code)})</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Payment method</Label>
              <Select value={methodType} onValueChange={(v) => setMethodType(v as PaymentMethodType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a payment method" />
                </SelectTrigger>
                <SelectContent>
                  {(methods ?? []).map((m) => {
                    const Icon = methodIcon[m.method_type]
                    return (
                      <SelectItem key={m.id} value={m.method_type}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {m.display_label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {methodType === 'crypto' && (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Pay to</Label>
                  <Select value={cryptoConfigId} onValueChange={setCryptoConfigId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a currency/network" />
                    </SelectTrigger>
                    <SelectContent>
                      {(cryptoConfigs ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.display_label ?? `${c.currency_code} (${c.network})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedCrypto && (
                  <div className="rounded-md bg-muted p-3 text-xs">
                    <p>
                      <span className="text-muted-foreground">Wallet address: </span>
                      <span className="font-mono font-semibold text-foreground">{selectedCrypto.wallet_address}</span>
                    </p>
                    {selectedCrypto.payment_instructions && <p className="mt-1 text-muted-foreground">{selectedCrypto.payment_instructions}</p>}
                    {selectedCrypto.confirmation_requirements && (
                      <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" /> {selectedCrypto.confirmation_requirements}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label>Transaction reference (required)</Label>
                  <Input value={txReference} onChange={(e) => setTxReference(e.target.value)} placeholder="Transaction hash or reference" />
                </div>
              </div>
            )}

            {methodType && methodType !== 'crypto' && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Submitting will notify a platform administrator to confirm this payment out-of-band and activate your subscription.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              onClick={handleSubmit}
              disabled={!methodType || (methodType === 'crypto' && (!cryptoConfigId || !txReference.trim())) || subscribe.isPending || submitPayment.isPending}
            >
              {subscribe.isPending || submitPayment.isPending ? 'Submitting…' : 'Submit Payment'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
