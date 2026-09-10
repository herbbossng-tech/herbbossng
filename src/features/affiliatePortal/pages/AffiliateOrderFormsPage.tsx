import { Archive, Check, Copy, Plus, SquareStack, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import type { AffiliateOrderForm } from '@/types/database'

import type { OrderFormPackageInput } from '../api'
import { useArchiveMyOrderForm, useCampaignProducts, useCreateMyOrderForm, useMyAvailableCampaigns, useMyOrderForms } from '../hooks'

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

function OrderFormCard({ form }: { form: AffiliateOrderForm }) {
  const archiveMutation = useArchiveMyOrderForm()
  const origin = window.location.origin
  const directUrl = `${origin}/order/${form.id}`
  const embedSnippet = `<div data-gcos-form="${form.id}" data-origin="${origin}"></div>\n<script src="${origin}/embed/gcos-forms.js" defer></script>`

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{form.internal_title}</CardTitle>
          <Badge variant={form.status === 'ACTIVE' ? 'success' : 'secondary'}>{form.status}</Badge>
        </div>
        {form.status === 'ACTIVE' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => archiveMutation.mutate({ formId: form.id, internalTitle: form.internal_title })}
            disabled={archiveMutation.isPending}
          >
            <Archive className="h-4 w-4" />
            Archive
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={() => void navigator.clipboard.writeText(embedSnippet)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Paste both lines anywhere on your own site to embed this order form.</p>
        </div>
      </CardContent>
    </Card>
  )
}

interface PackageRow extends OrderFormPackageInput {
  key: number
}

function CreateOrderFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: campaigns, isLoading: campaignsLoading } = useMyAvailableCampaigns()
  const [campaignId, setCampaignId] = React.useState<string>('')
  const { data: products, isLoading: productsLoading } = useCampaignProducts(campaignId || null)
  const [productId, setProductId] = React.useState<string>('')
  const [title, setTitle] = React.useState('')
  const [packages, setPackages] = React.useState<PackageRow[]>([{ key: 0, name: '', quantity: 1, price: 0 }])
  const [error, setError] = React.useState<string | null>(null)
  const createMutation = useCreateMyOrderForm()
  const nextKey = React.useRef(1)

  function resetForm() {
    setCampaignId('')
    setProductId('')
    setTitle('')
    setPackages([{ key: 0, name: '', quantity: 1, price: 0 }])
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!campaignId || !productId) {
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
    try {
      await createMutation.mutateAsync({
        campaignId,
        productId,
        internalTitle: title.trim(),
        packages: packages.map(({ key: _key, ...rest }) => rest),
      })
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this order form')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Order Form</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 p-6 pt-2" onSubmit={handleSubmit}>
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

          <div className="flex flex-col gap-1.5">
            <Label>Internal title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My Instagram bio link" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Price options</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setPackages((prev) => [...prev, { key: nextKey.current++, name: '', quantity: 1, price: 0 }])
                }}
              >
                <Plus className="h-4 w-4" />
                Add option
              </Button>
            </div>
            {packages.map((pkg, i) => (
              <div key={pkg.key} className="flex items-end gap-2 rounded-md border border-border p-3">
                <div className="flex flex-1 flex-col gap-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={pkg.name}
                    onChange={(e) =>
                      setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))
                    }
                    placeholder="Buy 1"
                  />
                </div>
                <div className="flex w-20 flex-col gap-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={pkg.quantity}
                    onChange={(e) =>
                      setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, quantity: Number(e.target.value) } : p)))
                    }
                  />
                </div>
                <div className="flex w-28 flex-col gap-1">
                  <Label className="text-xs">Price</Label>
                  <Input
                    type="number"
                    min={0}
                    value={pkg.price}
                    onChange={(e) =>
                      setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, price: Number(e.target.value) } : p)))
                    }
                  />
                </div>
                {packages.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setPackages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Order Form'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AffiliateOrderFormsPage() {
  const { data: forms, isLoading, isError, refetch } = useMyOrderForms()
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order Forms</h1>
          <p className="mt-1 text-sm text-muted-foreground">Embed these on your own pages — orders placed through them are yours automatically.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Order Form
        </Button>
      </div>

      {isLoading ? (
        <LoadingState label="Loading your order forms…" />
      ) : isError ? (
        <ErrorState message="Couldn't load your order forms." onRetry={() => refetch()} />
      ) : (forms ?? []).length === 0 ? (
        <EmptyState icon={SquareStack} title="No order forms yet" description="Create one to get an embeddable checkout for your own page." />
      ) : (
        <div className="flex flex-col gap-4">
          {forms?.map((form) => <OrderFormCard key={form.id} form={form} />)}
        </div>
      )}

      <CreateOrderFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
