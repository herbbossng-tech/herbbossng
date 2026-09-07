import { Check, Lock, Pencil, Plus, X } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import {
  useAllCryptoConfigs,
  useAllPaymentMethods,
  useAllPlans,
  useIsPlatformAdmin,
  usePendingPayments,
  usePlatformSetting,
  useReviewTenantPayment,
  useSetCryptoPaymentConfig,
  useSetPaymentMethodConfig,
  useSetPlanActive,
  useSetPlatformSetting,
  useUpsertPlan,
} from '@/features/billing/hooks'
import { formatCurrency } from '@/lib/currency'
import type { CryptoPaymentConfig, SubscriptionPlan } from '@/types/database'

export function BillingAdminPage() {
  const isPlatformAdmin = useIsPlatformAdmin()
  if (!isPlatformAdmin) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Platform administration is hidden" description="This area is restricted to GCOS platform administrators — a cross-workspace authority distinct from any workspace's Owner role." />
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Platform Billing Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Subscription plans, payment methods, crypto wallets, and pending tenant payments — visible only to GCOS platform administrators.</p>
      </div>
      <PendingPaymentsSection />
      <PlansSection />
      <PaymentMethodsSection />
      <CryptoConfigSection />
      <HomepageConfigSection />
    </div>
  )
}

const HOMEPAGE_MODULE_NAMES = [
  'Orders & COD',
  'Inventory & Warehouses',
  'Delivery Operations',
  'Finance & Reconciliation',
  'Landing Pages',
  'Marketing Intelligence',
  'Affiliates',
  'Customer Support',
  'Automation',
]

const HOMEPAGE_FIELD_LIMITS = {
  companyName: 80,
  tagline: 120,
  heroBadge: 80,
  heroTitle: 160,
  heroSubtitle: 400,
  primaryCtaLabel: 40,
  secondaryCtaLabel: 40,
  footerText: 160,
  moduleDescription: 300,
} as const

interface HomepageConfigForm {
  companyName: string
  tagline: string
  heroBadge: string
  heroTitle: string
  heroSubtitle: string
  primaryCtaLabel: string
  secondaryCtaLabel: string
  footerText: string
  moduleDescriptions: Record<string, string>
}

const emptyHomepageForm: HomepageConfigForm = {
  companyName: '',
  tagline: '',
  heroBadge: '',
  heroTitle: '',
  heroSubtitle: '',
  primaryCtaLabel: '',
  secondaryCtaLabel: '',
  footerText: '',
  moduleDescriptions: {},
}

/**
 * Editor for platform_settings('homepage') — the public marketing page
 * (src/pages/marketing/HomePage.tsx) reads this same row and falls back to
 * built-in copy for any field left blank. Every field here is plain text
 * rendered through JSX (never dangerouslySetInnerHTML) and no field ever
 * becomes a hyperlink target, so there is no way to inject markup, a
 * script, or an external redirect through this form. Length limits mirror
 * what the homepage layout can reasonably display.
 */
function HomepageConfigSection() {
  const { data, isLoading } = usePlatformSetting('homepage')
  const setSetting = useSetPlatformSetting()
  const [form, setForm] = React.useState<HomepageConfigForm>(emptyHomepageForm)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    if (!data) return
    const raw = data as Partial<{
      companyName: string
      tagline: string
      heroBadge: string
      heroTitle: string
      heroSubtitle: string
      primaryCtaLabel: string
      secondaryCtaLabel: string
      footerText: string
      modules: { name: string; description: string }[]
    }>
    const moduleDescriptions: Record<string, string> = {}
    for (const m of raw.modules ?? []) {
      if (HOMEPAGE_MODULE_NAMES.includes(m.name)) moduleDescriptions[m.name] = m.description
    }
    setForm({
      companyName: raw.companyName ?? '',
      tagline: raw.tagline ?? '',
      heroBadge: raw.heroBadge ?? '',
      heroTitle: raw.heroTitle ?? '',
      heroSubtitle: raw.heroSubtitle ?? '',
      primaryCtaLabel: raw.primaryCtaLabel ?? '',
      secondaryCtaLabel: raw.secondaryCtaLabel ?? '',
      footerText: raw.footerText ?? '',
      moduleDescriptions,
    })
  }, [data])

  if (isLoading) return <LoadingState label="Loading homepage configuration…" />

  function field(key: keyof typeof HOMEPAGE_FIELD_LIMITS): string {
    if (key === 'moduleDescription') return ''
    return form[key]
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    for (const key of Object.keys(HOMEPAGE_FIELD_LIMITS) as (keyof typeof HOMEPAGE_FIELD_LIMITS)[]) {
      if (key === 'moduleDescription') continue
      if (field(key).length > HOMEPAGE_FIELD_LIMITS[key]) {
        setError(`"${key}" is too long (max ${HOMEPAGE_FIELD_LIMITS[key]} characters).`)
        return
      }
    }
    for (const [name, desc] of Object.entries(form.moduleDescriptions)) {
      if (desc.length > HOMEPAGE_FIELD_LIMITS.moduleDescription) {
        setError(`Module description for "${name}" is too long (max ${HOMEPAGE_FIELD_LIMITS.moduleDescription} characters).`)
        return
      }
    }
    try {
      await setSetting.mutateAsync({
        key: 'homepage',
        value: {
          companyName: form.companyName.trim() || undefined,
          tagline: form.tagline.trim() || undefined,
          heroBadge: form.heroBadge.trim() || undefined,
          heroTitle: form.heroTitle.trim() || undefined,
          heroSubtitle: form.heroSubtitle.trim() || undefined,
          primaryCtaLabel: form.primaryCtaLabel.trim() || undefined,
          secondaryCtaLabel: form.secondaryCtaLabel.trim() || undefined,
          footerText: form.footerText.trim() || undefined,
          modules: Object.entries(form.moduleDescriptions)
            .filter(([, desc]) => desc.trim().length > 0)
            .map(([name, description]) => ({ name, description: description.trim() })),
        },
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save homepage configuration')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Homepage Configuration</CardTitle>
        <CardDescription>
          Overrides the public marketing page's hero, CTAs, module descriptions and footer. Leave any field blank to keep the built-in
          default copy. Pricing is not edited here — it always reads live from Subscription Plans above.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Company name</Label>
          <Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.companyName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tagline</Label>
          <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.tagline} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Hero badge</Label>
          <Input value={form.heroBadge} onChange={(e) => setForm((f) => ({ ...f, heroBadge: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.heroBadge} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Hero title</Label>
          <Input value={form.heroTitle} onChange={(e) => setForm((f) => ({ ...f, heroTitle: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.heroTitle} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Hero subtitle</Label>
          <Textarea rows={2} value={form.heroSubtitle} onChange={(e) => setForm((f) => ({ ...f, heroSubtitle: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.heroSubtitle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Primary CTA label</Label>
          <Input value={form.primaryCtaLabel} onChange={(e) => setForm((f) => ({ ...f, primaryCtaLabel: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.primaryCtaLabel} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Secondary CTA label</Label>
          <Input value={form.secondaryCtaLabel} onChange={(e) => setForm((f) => ({ ...f, secondaryCtaLabel: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.secondaryCtaLabel} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Footer text</Label>
          <Input value={form.footerText} onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))} maxLength={HOMEPAGE_FIELD_LIMITS.footerText} />
        </div>

        <div className="col-span-2 mt-2 flex flex-col gap-3 border-t border-border pt-4">
          <Label>Module descriptions (blank keeps the default)</Label>
          {HOMEPAGE_MODULE_NAMES.map((name) => (
            <div key={name} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{name}</p>
              <Textarea
                rows={2}
                value={form.moduleDescriptions[name] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, moduleDescriptions: { ...f.moduleDescriptions, [name]: e.target.value } }))}
                maxLength={HOMEPAGE_FIELD_LIMITS.moduleDescription}
              />
            </div>
          ))}
        </div>

        {error && <p className="col-span-2 text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="col-span-2 text-sm text-emerald-600">Saved — the homepage reflects this immediately, no deploy needed.</p>}
        <Button className="col-span-2" onClick={handleSave} disabled={setSetting.isPending}>
          {setSetting.isPending ? 'Saving…' : 'Save Homepage Configuration'}
        </Button>
      </CardContent>
    </Card>
  )
}

function PendingPaymentsSection() {
  const { data: payments, isLoading } = usePendingPayments()
  const review = useReviewTenantPayment()
  const [rejectingId, setRejectingId] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')

  if (isLoading) return <LoadingState label="Loading pending payments…" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pending Payments</CardTitle>
        <CardDescription>Every payment here is awaiting confirmation — none has been treated as paid on a tenant's say-so alone.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {(payments ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payments awaiting review.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Workspace</th>
                  <th className="px-4 py-2.5 font-semibold">Plan</th>
                  <th className="px-4 py-2.5 font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Method</th>
                  <th className="px-4 py-2.5 font-semibold">Reference</th>
                  <th className="px-4 py-2.5 font-semibold">Submitted</th>
                  <th className="px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-foreground">{p.workspace?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.plan?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 font-semibold">{formatCurrency(p.amount, p.currency_code)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">{p.payment_method_type}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.crypto_tx_reference ?? p.provider_reference ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.submitted_at ? new Date(p.submitted_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ paymentId: p.id, decision: 'approve' })}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => setRejectingId(p.id)}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={rejectingId !== null} onOpenChange={(v) => !v && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payment</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label>Reason (shown to the tenant)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            <Button
              variant="destructive"
              disabled={review.isPending}
              onClick={async () => {
                if (!rejectingId) return
                await review.mutateAsync({ paymentId: rejectingId, decision: 'reject', reason: reason || undefined })
                setRejectingId(null)
                setReason('')
              }}
            >
              Reject Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function PlansSection() {
  const { data: plans, isLoading } = useAllPlans()
  const setActive = useSetPlanActive()
  const [editing, setEditing] = React.useState<SubscriptionPlan | 'new' | null>(null)

  if (isLoading) return <LoadingState label="Loading plans…" />

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Subscription Plans</CardTitle>
          <CardDescription>Starter/Growth/Scale are default seed data — fully editable, and you can add more.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-3.5 w-3.5" /> New Plan
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(plans ?? []).map((plan) => (
          <div key={plan.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">{plan.name}</p>
              <Badge variant={plan.is_active ? 'success' : 'secondary'}>{plan.is_active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="text-lg font-bold text-foreground">{formatCurrency(plan.monthly_price, plan.currency_code)}<span className="text-xs font-normal text-muted-foreground"> /mo</span></p>
            <p className="text-xs text-muted-foreground">
              Staff: {plan.max_staff ?? '∞'} · Brands: {plan.max_brands ?? '∞'} · Landing pages: {plan.max_landing_pages ?? '∞'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(plan)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActive.mutate({ id: plan.id, isActive: !plan.is_active })}>
                {plan.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
      <PlanFormDialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} plan={editing === 'new' ? null : editing} />
    </Card>
  )
}

function PlanFormDialog({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (v: boolean) => void; plan: SubscriptionPlan | null }) {
  const upsert = useUpsertPlan()
  const [form, setForm] = React.useState({
    slug: '', name: '', description: '', monthlyPrice: '0', annualPrice: '', currencyCode: 'USD', trialDays: '14',
    maxStaff: '', maxBrands: '', maxLandingPages: '', maxOrders: '', maxWarehouses: '', isPublic: true, isPopular: false,
  })
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setForm({
        slug: plan?.slug ?? '',
        name: plan?.name ?? '',
        description: plan?.description ?? '',
        monthlyPrice: String(plan?.monthly_price ?? 0),
        annualPrice: plan?.annual_price != null ? String(plan.annual_price) : '',
        currencyCode: plan?.currency_code ?? 'USD',
        trialDays: String(plan?.trial_days ?? 14),
        maxStaff: plan?.max_staff != null ? String(plan.max_staff) : '',
        maxBrands: plan?.max_brands != null ? String(plan.max_brands) : '',
        maxLandingPages: plan?.max_landing_pages != null ? String(plan.max_landing_pages) : '',
        maxOrders: plan?.max_orders != null ? String(plan.max_orders) : '',
        maxWarehouses: plan?.max_warehouses != null ? String(plan.max_warehouses) : '',
        isPublic: plan?.is_public ?? true,
        isPopular: plan?.is_popular ?? false,
      })
      setError(null)
    }
  }, [open, plan])

  async function handleSave() {
    setError(null)
    if (!form.slug.trim() || !form.name.trim()) {
      setError('Slug and name are required.')
      return
    }
    try {
      await upsert.mutateAsync({
        id: plan?.id,
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description || null,
        monthlyPrice: Number(form.monthlyPrice) || 0,
        annualPrice: form.annualPrice ? Number(form.annualPrice) : null,
        currencyCode: form.currencyCode.trim().toUpperCase(),
        trialDays: Number(form.trialDays) || 0,
        maxStaff: form.maxStaff ? Number(form.maxStaff) : null,
        maxBrands: form.maxBrands ? Number(form.maxBrands) : null,
        maxLandingPages: form.maxLandingPages ? Number(form.maxLandingPages) : null,
        maxOrders: form.maxOrders ? Number(form.maxOrders) : null,
        maxWarehouses: form.maxWarehouses ? Number(form.maxWarehouses) : null,
        entitlements: Object.fromEntries(Object.entries(plan?.entitlements ?? {}).filter(([, v]) => v !== undefined)) as Record<string, boolean>,
        isPublic: form.isPublic,
        isPopular: form.isPopular,
        isCustomPricing: plan?.is_custom_pricing ?? false,
        sortOrder: plan?.sort_order ?? 0,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : 'New Plan'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Slug</Label>
            <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} disabled={Boolean(plan)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Monthly price</Label>
            <Input type="number" min={0} value={form.monthlyPrice} onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Annual price (optional)</Label>
            <Input type="number" min={0} value={form.annualPrice} onChange={(e) => setForm((f) => ({ ...f, annualPrice: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Currency</Label>
            <Input value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))} maxLength={3} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Trial days</Label>
            <Input type="number" min={0} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max staff (blank = unlimited)</Label>
            <Input type="number" min={1} value={form.maxStaff} onChange={(e) => setForm((f) => ({ ...f, maxStaff: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max brands</Label>
            <Input type="number" min={1} value={form.maxBrands} onChange={(e) => setForm((f) => ({ ...f, maxBrands: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max landing pages</Label>
            <Input type="number" min={1} value={form.maxLandingPages} onChange={(e) => setForm((f) => ({ ...f, maxLandingPages: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max orders</Label>
            <Input type="number" min={1} value={form.maxOrders} onChange={(e) => setForm((f) => ({ ...f, maxOrders: e.target.value }))} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>Public (shown on homepage)</Label>
            <Switch checked={form.isPublic} onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>Most popular</Label>
            <Switch checked={form.isPopular} onCheckedChange={(v) => setForm((f) => ({ ...f, isPopular: v }))} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? 'Saving…' : 'Save Plan'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function PaymentMethodsSection() {
  const { data: methods, isLoading } = useAllPaymentMethods()
  const setConfig = useSetPaymentMethodConfig()

  if (isLoading) return <LoadingState label="Loading payment methods…" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment Methods</CardTitle>
        <CardDescription>Card/bank transfer/gateway ship inactive — no provider integration exists yet; activating one without real credentials would fabricate a payment path. Manual and crypto are ready to use.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {(methods ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-foreground">{m.display_label}</p>
              <p className="text-xs text-muted-foreground capitalize">{m.method_type}</p>
            </div>
            <Switch checked={m.is_active} onCheckedChange={(v) => setConfig.mutate({ id: m.id, isActive: v })} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function CryptoConfigSection() {
  const { data: configs, isLoading } = useAllCryptoConfigs()
  const setConfig = useSetCryptoPaymentConfig()
  const [editing, setEditing] = React.useState<CryptoPaymentConfig | 'new' | null>(null)

  if (isLoading) return <LoadingState label="Loading crypto wallets…" />

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Crypto Payment Wallets</CardTitle>
          <CardDescription>Manual, admin-confirmed crypto payments. Multiple networks are supported — add as many as you need (TRC20, ERC20, BEP20, ...).</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-3.5 w-3.5" /> New Wallet
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {(configs ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No crypto wallets configured yet.</p>}
        {(configs ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-foreground">{c.display_label ?? `${c.currency_code} (${c.network})`}</p>
              <p className="font-mono text-xs text-muted-foreground">{c.wallet_address}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Switch checked={c.is_active} onCheckedChange={(v) => setConfig.mutate({ id: c.id, isActive: v })} />
            </div>
          </div>
        ))}
      </CardContent>
      <CryptoFormDialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)} config={editing === 'new' ? null : editing} />
    </Card>
  )
}

function CryptoFormDialog({ open, onOpenChange, config }: { open: boolean; onOpenChange: (v: boolean) => void; config: CryptoPaymentConfig | null }) {
  const setConfig = useSetCryptoPaymentConfig()
  const [form, setForm] = React.useState({ currencyCode: '', network: '', walletAddress: '', displayLabel: '', paymentInstructions: '', confirmationRequirements: '' })
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setForm({
        currencyCode: config?.currency_code ?? '',
        network: config?.network ?? '',
        walletAddress: config?.wallet_address ?? '',
        displayLabel: config?.display_label ?? '',
        paymentInstructions: config?.payment_instructions ?? '',
        confirmationRequirements: config?.confirmation_requirements ?? '',
      })
      setError(null)
    }
  }, [open, config])

  async function handleSave() {
    setError(null)
    if (!form.currencyCode.trim() || !form.network.trim() || !form.walletAddress.trim()) {
      setError('Currency, network, and wallet address are required.')
      return
    }
    try {
      await setConfig.mutateAsync({
        id: config?.id,
        currencyCode: form.currencyCode,
        network: form.network,
        walletAddress: form.walletAddress,
        displayLabel: form.displayLabel || null,
        paymentInstructions: form.paymentInstructions || null,
        confirmationRequirements: form.confirmationRequirements || null,
        isActive: config?.is_active ?? false,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save wallet')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config ? 'Edit Crypto Wallet' : 'New Crypto Wallet'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Currency (e.g. USDT)</Label>
              <Input value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))} disabled={Boolean(config)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Network (e.g. TRC20)</Label>
              <Input value={form.network} onChange={(e) => setForm((f) => ({ ...f, network: e.target.value }))} disabled={Boolean(config)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Wallet address</Label>
            <Input value={form.walletAddress} onChange={(e) => setForm((f) => ({ ...f, walletAddress: e.target.value }))} className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Display label</Label>
            <Input value={form.displayLabel} onChange={(e) => setForm((f) => ({ ...f, displayLabel: e.target.value }))} placeholder="e.g. USDT (TRC20)" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Payment instructions</Label>
            <Textarea rows={2} value={form.paymentInstructions} onChange={(e) => setForm((f) => ({ ...f, paymentInstructions: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Confirmation requirements</Label>
            <Input value={form.confirmationRequirements} onChange={(e) => setForm((f) => ({ ...f, confirmationRequirements: e.target.value }))} placeholder="e.g. Requires 20 confirmations" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={setConfig.isPending}>
            {setConfig.isPending ? 'Saving…' : 'Save Wallet'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
