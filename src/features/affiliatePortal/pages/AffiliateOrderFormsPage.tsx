import { Archive, Check, Code2, Copy, Eye, MoreHorizontal, Pencil, Plus, Receipt, SquareStack, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'
import type { AffiliateOrderFormWithStats } from '@/types/database'

import type { OrderFormAddonInput, OrderFormPackageInput } from '../api'
import {
  useArchiveMyOrderForm,
  useCampaignProducts,
  useCreateMyOrderForm,
  useMyAvailableCampaigns,
  useMyOrderForms,
  useOrderFormAddons,
  useOrderFormPackages,
  useOrderFormSubmissions,
  useUpdateMyOrderForm,
} from '../hooks'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

function EmbedCodeDialog({ form, open, onOpenChange }: { form: AffiliateOrderFormWithStats | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!form) return null
  const origin = window.location.origin
  const directUrl = `${origin}/order/${form.id}`
  const embedSnippet = `<div data-gcos-form="${form.id}" data-origin="${origin}"></div>\n<script src="${origin}/embed/gcos-forms.js" defer></script>`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.internal_title} — Embed</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 p-6 pt-2">
          <CopyField label="Direct link" value={directUrl} />
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Embed snippet</Label>
            <div className="flex gap-2">
              <textarea
                readOnly
                value={embedSnippet}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
              />
              <Button type="button" size="icon" variant="outline" className="shrink-0" onClick={() => void navigator.clipboard.writeText(embedSnippet)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Paste both lines anywhere on your own site to embed this order form.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SubmissionsDialog({ form, open, onOpenChange }: { form: AffiliateOrderFormWithStats | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: submissions, isLoading } = useOrderFormSubmissions(open ? (form?.id ?? null) : null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form?.internal_title} — Submissions</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 p-6 pt-2">
          {isLoading ? (
            <LoadingState label="Loading submissions…" />
          ) : (submissions ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No orders through this form yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {submissions?.map((s) => (
                <div key={s.order_number} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.order_number}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{s.status}</Badge>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(s.total_amount, s.currency_code)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PackageRow extends OrderFormPackageInput {
  key: number
}
interface AddonRow extends OrderFormAddonInput {
  key: number
}

function emptyPackageRow(key: number): PackageRow {
  return { key, name: '', quantity: 1, price: 0, compare_at_price: null, badge: '', shipping_rule: { type: 'free' } }
}

function OrderFormEditorDialog({
  open,
  onOpenChange,
  editingForm,
  initialCampaignId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingForm: AffiliateOrderFormWithStats | null
  initialCampaignId?: string | null
}) {
  const isEditing = Boolean(editingForm)
  const { data: campaigns, isLoading: campaignsLoading } = useMyAvailableCampaigns()
  const [campaignId, setCampaignId] = React.useState<string>('')
  const { data: products, isLoading: productsLoading } = useCampaignProducts(campaignId || null)
  const [productId, setProductId] = React.useState<string>('')
  const [title, setTitle] = React.useState('')
  const [packages, setPackages] = React.useState<PackageRow[]>([emptyPackageRow(0)])
  const [addons, setAddons] = React.useState<AddonRow[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [showPreview, setShowPreview] = React.useState(false)
  const createMutation = useCreateMyOrderForm()
  const updateMutation = useUpdateMyOrderForm()
  const nextPkgKey = React.useRef(1)
  const nextAddonKey = React.useRef(1)

  const { data: existingPackages } = useOrderFormPackages(editingForm?.id ?? null)
  const { data: existingAddons } = useOrderFormAddons(editingForm?.id ?? null)

  React.useEffect(() => {
    if (!open) return
    if (editingForm) {
      setCampaignId(editingForm.campaign_id)
      setProductId(editingForm.product_id)
      setTitle(editingForm.internal_title)
    } else {
      resetForm()
      if (initialCampaignId) setCampaignId(initialCampaignId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingForm, initialCampaignId])

  React.useEffect(() => {
    if (editingForm && existingPackages && existingPackages.length > 0) {
      setPackages(
        existingPackages.map((p, i) => ({
          key: i,
          name: p.name,
          quantity: p.quantity,
          price: p.price,
          compare_at_price: p.compare_at_price,
          badge: p.badge ?? '',
          shipping_rule: (p.shipping_rule as { type: 'free' } | { type: 'fixed'; amount: number }) ?? { type: 'free' },
        })),
      )
      nextPkgKey.current = existingPackages.length
    }
  }, [editingForm, existingPackages])

  React.useEffect(() => {
    if (editingForm && existingAddons) {
      setAddons(existingAddons.map((a, i) => ({ key: i, name: a.name, price: a.price })))
      nextAddonKey.current = existingAddons.length
    }
  }, [editingForm, existingAddons])

  function resetForm() {
    setCampaignId('')
    setProductId('')
    setTitle('')
    setPackages([emptyPackageRow(0)])
    setAddons([])
    setError(null)
    nextPkgKey.current = 1
    nextAddonKey.current = 1
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEditing && (!campaignId || !productId)) {
      setError('Pick a campaign and a product.')
      return
    }
    if (!title.trim()) {
      setError('Give this form a title.')
      return
    }
    if (packages.some((p) => !p.name.trim() || p.quantity <= 0 || p.price < 0)) {
      setError('Every price option needs a name, a positive quantity, and a non-negative price.')
      return
    }
    if (addons.some((a) => !a.name.trim() || a.price < 0)) {
      setError('Every add-on needs a name and a non-negative price.')
      return
    }
    const packagePayload = packages.map(({ key: _key, badge, ...rest }) => ({ ...rest, badge: badge || null }))
    const addonPayload = addons.map(({ key: _key, ...rest }) => rest)
    try {
      if (isEditing && editingForm) {
        await updateMutation.mutateAsync({
          formId: editingForm.id,
          internalTitle: title.trim(),
          packages: packagePayload,
          addons: addonPayload,
        })
      } else {
        await createMutation.mutateAsync({
          campaignId,
          productId,
          internalTitle: title.trim(),
          packages: packagePayload,
          addons: addonPayload,
        })
      }
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this order form')
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const previewCurrency = 'NGN'

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) resetForm()
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Order Form' : 'Create Order Form'}</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4 p-6 pt-2" onSubmit={handleSubmit}>
            {!isEditing && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>Campaign</Label>
                  <Select
                    value={campaignId}
                    onValueChange={(value) => {
                      setCampaignId(value)
                      setProductId('')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={campaignsLoading ? 'Loading…' : 'Select a campaign'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(campaigns ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {campaigns?.length === 0 && !campaignsLoading && (
                    <p className="text-xs text-muted-foreground">No campaigns currently let you create order forms.</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Product</Label>
                  <Select value={productId} onValueChange={setProductId} disabled={!campaignId}>
                    <SelectTrigger>
                      <SelectValue placeholder={productsLoading ? 'Loading…' : 'Select a product'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(products ?? []).map((p) => (
                        <SelectItem key={p.id as string} value={p.id as string}>
                          {p.name as string}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Internal title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My Instagram bio link" />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Offer tiers</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPackages((prev) => [...prev, emptyPackageRow(nextPkgKey.current++)])}
                >
                  <Plus className="h-4 w-4" />
                  Add tier
                </Button>
              </div>
              {packages.map((pkg, i) => (
                <div key={pkg.key} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={pkg.name}
                        onChange={(e) => setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))}
                        placeholder="Buy 1"
                      />
                    </div>
                    <div className="flex w-16 flex-col gap-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={pkg.quantity}
                        onChange={(e) => setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, quantity: Number(e.target.value) } : p)))}
                      />
                    </div>
                    <div className="flex w-24 flex-col gap-1">
                      <Label className="text-xs">Price</Label>
                      <Input
                        type="number"
                        min={0}
                        value={pkg.price}
                        onChange={(e) => setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, price: Number(e.target.value) } : p)))}
                      />
                    </div>
                    {packages.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => setPackages((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label className="text-xs">Compare-at price (optional)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={pkg.compare_at_price ?? ''}
                        onChange={(e) =>
                          setPackages((prev) =>
                            prev.map((p, idx) => (idx === i ? { ...p, compare_at_price: e.target.value === '' ? null : Number(e.target.value) } : p)),
                          )
                        }
                        placeholder="Shown struck-through"
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <Label className="text-xs">Badge (optional)</Label>
                      <Input
                        value={pkg.badge ?? ''}
                        onChange={(e) => setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, badge: e.target.value } : p)))}
                        placeholder="Most Popular"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Shipping</Label>
                    <Select
                      value={pkg.shipping_rule?.type ?? 'free'}
                      onValueChange={(value) =>
                        setPackages((prev) =>
                          prev.map((p, idx) =>
                            idx === i
                              ? { ...p, shipping_rule: value === 'fixed' ? { type: 'fixed', amount: 0 } : { type: 'free' } }
                              : p,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free shipping</SelectItem>
                        <SelectItem value="fixed">Flat fee</SelectItem>
                      </SelectContent>
                    </Select>
                    {pkg.shipping_rule?.type === 'fixed' && (
                      <Input
                        type="number"
                        min={0}
                        className="mt-1"
                        value={pkg.shipping_rule.amount}
                        onChange={(e) =>
                          setPackages((prev) =>
                            prev.map((p, idx) => (idx === i ? { ...p, shipping_rule: { type: 'fixed', amount: Number(e.target.value) } } : p)),
                          )
                        }
                        placeholder="Shipping fee"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Add-ons (optional)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAddons((prev) => [...prev, { key: nextAddonKey.current++, name: '', price: 0 }])}
                >
                  <Plus className="h-4 w-4" />
                  Add add-on
                </Button>
              </div>
              {addons.map((addon, i) => (
                <div key={addon.key} className="flex items-end gap-2 rounded-md border border-border p-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={addon.name}
                      onChange={(e) => setAddons((prev) => prev.map((a, idx) => (idx === i ? { ...a, name: e.target.value } : a)))}
                      placeholder="Gift wrap"
                    />
                  </div>
                  <div className="flex w-28 flex-col gap-1">
                    <Label className="text-xs">Price</Label>
                    <Input
                      type="number"
                      min={0}
                      value={addon.price}
                      onChange={(e) => setAddons((prev) => prev.map((a, idx) => (idx === i ? { ...a, price: Number(e.target.value) } : a)))}
                    />
                  </div>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setAddons((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4" />
                Preview
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Order Form'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Live preview</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 p-6 pt-2">
            <p className="text-center text-sm font-semibold text-foreground">{title || 'Untitled form'}</p>
            <div className="flex flex-col gap-2">
              {packages.map((pkg) => (
                <div key={pkg.key} className="relative flex items-center justify-between rounded-xl border-2 border-primary bg-primary/5 px-4 py-3">
                  {pkg.badge && (
                    <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                      {pkg.badge}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-foreground">{pkg.name || 'Untitled tier'}</span>
                  <span className="flex items-baseline gap-2">
                    {pkg.compare_at_price && pkg.compare_at_price > pkg.price && (
                      <span className="text-xs text-muted-foreground line-through">{formatCurrency(pkg.compare_at_price, previewCurrency)}</span>
                    )}
                    <span className="text-sm font-bold text-foreground">{formatCurrency(pkg.price, previewCurrency)}</span>
                  </span>
                </div>
              ))}
            </div>
            {addons.length > 0 && (
              <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add-ons</p>
                {addons.map((addon) => (
                  <div key={addon.key} className="flex items-center justify-between text-sm text-foreground">
                    <span>{addon.name || 'Untitled add-on'}</span>
                    <span>+{formatCurrency(addon.price, previewCurrency)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">Approximate preview — currency shown is illustrative only.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AffiliateOrderFormsPage() {
  const { data: forms, isLoading, isError, refetch } = useMyOrderForms()
  const archiveMutation = useArchiveMyOrderForm()
  const [searchParams, setSearchParams] = useSearchParams()
  const campaignFromUrl = searchParams.get('campaign')
  const [editorOpen, setEditorOpen] = React.useState(Boolean(campaignFromUrl))
  const [editingForm, setEditingForm] = React.useState<AffiliateOrderFormWithStats | null>(null)
  const [embedForm, setEmbedForm] = React.useState<AffiliateOrderFormWithStats | null>(null)
  const [submissionsForm, setSubmissionsForm] = React.useState<AffiliateOrderFormWithStats | null>(null)
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'ACTIVE' | 'ARCHIVED'>('all')

  function closeEditor(open: boolean) {
    setEditorOpen(open)
    if (!open && campaignFromUrl) {
      searchParams.delete('campaign')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const filtered = (forms ?? []).filter((f) => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false
    if (search && !f.internal_title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const activeCount = (forms ?? []).filter((f) => f.status === 'ACTIVE').length
  const inactiveCount = (forms ?? []).filter((f) => f.status === 'ARCHIVED').length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Forms</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage your order forms. Share links to collect orders.</p>
        </div>
        <Button
          onClick={() => {
            setEditingForm(null)
            setEditorOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Create Form
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Forms</p>
            <p className="text-2xl font-bold text-foreground">{(forms ?? []).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-foreground">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inactive</p>
            <p className="text-2xl font-bold text-foreground">{inactiveCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input placeholder="Search by form name" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Forms</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState label="Loading your order forms…" />
          ) : isError ? (
            <ErrorState message="Couldn't load your order forms." onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={SquareStack} title="No order forms yet" description="Create one to get an embeddable checkout for your own page." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Form</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Orders</th>
                    <th className="pb-2 pr-3 font-medium">Views</th>
                    <th className="pb-2 pr-3 font-medium">Conversion</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((form) => (
                    <tr key={form.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-foreground">{form.internal_title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(form.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge variant={form.status === 'ACTIVE' ? 'success' : 'secondary'}>{form.status}</Badge>
                      </td>
                      <td className="py-3 pr-3">{form.orders_count}</td>
                      <td className="py-3 pr-3">{form.views_count}</td>
                      <td className="py-3 pr-3">{form.conversion_rate.toFixed(1)}%</td>
                      <td className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingForm(form)
                                setEditorOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEmbedForm(form)}>
                              <Code2 className="h-4 w-4" />
                              Get Embed Code
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSubmissionsForm(form)}>
                              <Receipt className="h-4 w-4" />
                              View Submissions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(`/order/${form.id}`, '_blank')}>
                              <Eye className="h-4 w-4" />
                              Preview
                            </DropdownMenuItem>
                            {form.status === 'ACTIVE' && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => archiveMutation.mutate({ formId: form.id, internalTitle: form.internal_title })}
                              >
                                <Archive className="h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <OrderFormEditorDialog open={editorOpen} onOpenChange={closeEditor} editingForm={editingForm} initialCampaignId={campaignFromUrl} />
      <EmbedCodeDialog form={embedForm} open={Boolean(embedForm)} onOpenChange={(open) => !open && setEmbedForm(null)} />
      <SubmissionsDialog form={submissionsForm} open={Boolean(submissionsForm)} onOpenChange={(open) => !open && setSubmissionsForm(null)} />
    </div>
  )
}
