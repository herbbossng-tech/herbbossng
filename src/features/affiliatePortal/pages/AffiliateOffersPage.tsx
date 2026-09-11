import { Layers, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'
import type { AffiliateOfferType } from '@/types/database'

import { useCampaignProducts, useCreateMyOffer, useMyAvailableCampaigns, useMyOffers, useMyOrderForms } from '../hooks'

const OFFER_TYPE_LABEL: Record<AffiliateOfferType, string> = {
  ORDER_BUMP: 'Order Bump',
  UPSELL: 'Upsell',
  DOWNSELL: 'Downsell',
}

function CreateOfferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: campaigns } = useMyAvailableCampaigns()
  const { data: forms } = useMyOrderForms()
  const [campaignId, setCampaignId] = React.useState('')
  const { data: products } = useCampaignProducts(campaignId || null)
  const [formIds, setFormIds] = React.useState<string[]>([])
  const [offerType, setOfferType] = React.useState<AffiliateOfferType>('ORDER_BUMP')
  const [productId, setProductId] = React.useState('')
  const [internalName, setInternalName] = React.useState('')
  const [headline, setHeadline] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [imageUrl, setImageUrl] = React.useState('')
  const [ctaText, setCtaText] = React.useState('Yes, add this to my order!')
  const [declineText, setDeclineText] = React.useState('No thanks')
  const [quantity, setQuantity] = React.useState('1')
  const [price, setPrice] = React.useState('0')
  const [compareAtPrice, setCompareAtPrice] = React.useState('')
  const [maxQuantity, setMaxQuantity] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const createMutation = useCreateMyOffer()

  function resetForm() {
    setCampaignId('')
    setFormIds([])
    setOfferType('ORDER_BUMP')
    setProductId('')
    setInternalName('')
    setHeadline('')
    setDescription('')
    setImageUrl('')
    setCtaText('Yes, add this to my order!')
    setDeclineText('No thanks')
    setQuantity('1')
    setPrice('0')
    setCompareAtPrice('')
    setMaxQuantity('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (formIds.length === 0) {
      setError('Select at least one form to link this offer to.')
      return
    }
    if (!productId) {
      setError('Select a product.')
      return
    }
    if (!internalName.trim() || !headline.trim()) {
      setError('Internal name and customer-facing headline are required.')
      return
    }
    try {
      await createMutation.mutateAsync({
        offerType,
        productId,
        internalName: internalName.trim(),
        headline: headline.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        ctaText,
        declineText,
        quantity: Number(quantity) || 1,
        price: Number(price) || 0,
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
        maxQuantity: maxQuantity ? Number(maxQuantity) : undefined,
        formIds,
      })
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this offer')
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
          <DialogTitle>Create New Offer</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 p-6 pt-2" onSubmit={handleSubmit}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where it shows</p>
          <div className="flex flex-col gap-1.5">
            <Label>Linked Forms</Label>
            <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
              {(forms ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Create an order form first.</p>
              ) : (
                forms?.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={formIds.includes(f.id)}
                      onCheckedChange={(checked) =>
                        setFormIds((prev) => (checked === true ? [...prev, f.id] : prev.filter((id) => id !== f.id)))
                      }
                    />
                    {f.internal_title}
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">This offer will appear on all selected forms.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Offer Type</Label>
            <Select value={offerType} onValueChange={(v) => setOfferType(v as AffiliateOfferType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ORDER_BUMP">Order Bump</SelectItem>
                <SelectItem value="UPSELL">Upsell</SelectItem>
                <SelectItem value="DOWNSELL">Downsell</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {offerType === 'ORDER_BUMP'
                ? 'Shown on the order form before checkout.'
                : 'Manageable now — the post-checkout upsell/downsell flow is not built yet, so this will not show on live forms.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Internal Name</Label>
            <Input value={internalName} onChange={(e) => setInternalName(e.target.value)} placeholder="e.g., Extended Warranty Upsell" />
            <p className="text-xs text-muted-foreground">For internal reference only, not shown to customers.</p>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What customer sees</p>
          <div className="flex flex-col gap-1.5">
            <Label>Customer-Facing Headline</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g., Add This for a Special Price!" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (Optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the offer benefits…" rows={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Campaign (to pick a product from)</Label>
            <Select
              value={campaignId}
              onValueChange={(v) => {
                setCampaignId(v)
                setProductId('')
              }}
            >
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
          <div className="flex flex-col gap-1.5">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId} disabled={!campaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product" />
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
            <Label>CTA Button Text</Label>
            <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Decline Button Text</Label>
            <Input value={declineText} onChange={(e) => setDeclineText(e.target.value)} />
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing &amp; Limits</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Offer Price</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Compare At (optional)</Label>
              <Input type="number" min={0} value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="Auto-filled" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Max Quantity (optional)</Label>
              <Input type="number" min={1} value={maxQuantity} onChange={(e) => setMaxQuantity(e.target.value)} placeholder="Unlimited" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Leave max quantity empty for unlimited.</p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Offer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OfferList({ offerType }: { offerType: AffiliateOfferType }) {
  const { data: offers, isLoading, isError, refetch } = useMyOffers(offerType)

  if (isLoading) return <LoadingState label="Loading offers…" />
  if (isError) return <ErrorState message="Couldn't load offers." onRetry={() => refetch()} />
  if ((offers ?? []).length === 0) {
    return <EmptyState icon={Layers} title="No offers found" description="Create an offer for this section or adjust your filters." />
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {offers?.map((offer) => (
        <div key={offer.id} className="flex items-center justify-between gap-3 py-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{offer.internal_name}</p>
              <Badge variant={offer.status === 'ACTIVE' ? 'success' : 'secondary'}>{offer.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {offer.headline} · {formatCurrency(offer.price, 'NGN')}
              {offer.max_quantity ? ` · ${offer.redeemed_count}/${offer.max_quantity} redeemed` : ` · ${offer.redeemed_count} redeemed`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{formatCurrency(offer.revenue_generated, 'NGN')}</p>
            <p className="text-xs text-muted-foreground">{offer.conversion_rate.toFixed(1)}% conversion</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function AffiliateOffersPage() {
  const { data: allOffers } = useMyOffers(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const totalOffers = allOffers?.length ?? 0
  const activeOffers = (allOffers ?? []).filter((o) => o.status === 'ACTIVE').length
  const totalRevenue = (allOffers ?? []).reduce((sum, o) => sum + o.revenue_generated, 0)
  const overallConversion =
    (allOffers ?? []).length === 0 ? 0 : (allOffers ?? []).reduce((sum, o) => sum + o.conversion_rate, 0) / (allOffers ?? []).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Offers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage order bumps, upsells, and downsells for your forms.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Offer
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Offers</p>
            <p className="text-2xl font-bold text-foreground">{totalOffers}</p>
            <p className="text-xs text-muted-foreground">Across all offer types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-foreground">{activeOffers}</p>
            <p className="text-xs text-muted-foreground">Currently enabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Conversion Rate</p>
            <p className="text-2xl font-bold text-foreground">{overallConversion.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Overall acceptance rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Revenue</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRevenue, 'NGN')}</p>
            <p className="text-xs text-muted-foreground">Attributed offer revenue</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ORDER_BUMP">
        <TabsList>
          <TabsTrigger value="ORDER_BUMP">
            <Layers className="h-4 w-4" />
            Order Bumps
          </TabsTrigger>
          <TabsTrigger value="UPSELL">
            <TrendingUp className="h-4 w-4" />
            Upsells
          </TabsTrigger>
          <TabsTrigger value="DOWNSELL">
            <TrendingDown className="h-4 w-4" />
            Downsells
          </TabsTrigger>
        </TabsList>
        {(['ORDER_BUMP', 'UPSELL', 'DOWNSELL'] as const).map((type) => (
          <TabsContent key={type} value={type} className="pt-4">
            <Card>
              <CardContent className="p-4">
                <p className="mb-3 text-sm font-semibold text-foreground">{OFFER_TYPE_LABEL[type]}s</p>
                <OfferList offerType={type} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <CreateOfferDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
