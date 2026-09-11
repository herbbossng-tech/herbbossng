import { Download, Package, Plus } from 'lucide-react'
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
import { formatCurrency } from '@/lib/currency'

import { useCampaignProducts, useCreateManualOrder, useMyAffiliateOrders, useMyAvailableCampaigns } from '../hooks'

const STATUS_OPTIONS = [
  'all',
  'NEW',
  'PENDING',
  'CONFIRMED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
] as const

function CreateManualOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: campaigns, isLoading: campaignsLoading } = useMyAvailableCampaigns()
  const [campaignId, setCampaignId] = React.useState('')
  const { data: products, isLoading: productsLoading } = useCampaignProducts(campaignId || null)
  const [productId, setProductId] = React.useState('')
  const [quantity, setQuantity] = React.useState('1')
  const [customerName, setCustomerName] = React.useState('')
  const [customerPhone, setCustomerPhone] = React.useState('')
  const [customerAddress, setCustomerAddress] = React.useState('')
  const [customerState, setCustomerState] = React.useState('')
  const [customerCity, setCustomerCity] = React.useState('')
  const [customerEmail, setCustomerEmail] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const createMutation = useCreateManualOrder()

  function resetForm() {
    setCampaignId('')
    setProductId('')
    setQuantity('1')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setCustomerState('')
    setCustomerCity('')
    setCustomerEmail('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!campaignId || !productId) {
      setError('Pick a campaign and a product.')
      return
    }
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim() || !customerState.trim() || !customerCity.trim()) {
      setError('Full name, phone, address, city, and state are all required.')
      return
    }
    try {
      await createMutation.mutateAsync({
        campaignId,
        productId,
        quantity: Number(quantity) || 1,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerState: customerState.trim(),
        customerCity: customerCity.trim(),
        customerEmail: customerEmail.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      })
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit this order — the campaign may not allow manual order entry.')
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
          <DialogTitle>Affiliate Order Portal</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 p-6 pt-2" onSubmit={handleSubmit}>
          <p className="text-xs text-muted-foreground">Submit orders for confirmation by the operations team.</p>

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
          </div>

          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
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
            <div className="flex w-24 flex-col gap-1.5">
              <Label>Qty</Label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer Information</p>
          <div className="flex flex-col gap-1.5">
            <Label>Full Customer Name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Adebayo Benson" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contact Phone</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="080XXXXXXXX" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email (Optional)</Label>
            <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery Address</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>State</Label>
              <Input value={customerState} onChange={(e) => setCustomerState(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>City</Label>
              <Input value={customerCity} onChange={(e) => setCustomerCity(e.target.value)} placeholder="Ikeja" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Full Street Address</Label>
            <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="No. 4, Sample Street, Landmark…" />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <p className="text-xs italic text-muted-foreground">
            Delivery fees and discounts will be calculated by the operations team after review. Order will start as Pending Confirmation.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Discard
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Submitting…' : 'Submit Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AffiliateMyOrdersPage() {
  const [status, setStatus] = React.useState<string>('all')
  const { data: orders, isLoading, isError, refetch } = useMyAffiliateOrders(status === 'all' ? null : status)
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track your orders, commissions, and performance metrics.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Order
          </Button>
          <Button asChild variant="outline">
            <Link to="/affiliate/orders/import">
              <Download className="h-4 w-4" />
              Quick Import
            </Link>
          </Button>
        </div>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState label="Loading your orders…" />
            </div>
          ) : isError ? (
            <div className="p-4">
              <ErrorState message="Couldn't load your orders." onRetry={() => refetch()} />
            </div>
          ) : (orders ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Package} title="No orders yet" description="Orders placed through your forms will show up here." />
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {orders?.map((order) => (
                <div key={order.order_number} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.source_detail ?? 'Order form'} · {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{order.status}</Badge>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(order.total_amount, order.currency_code)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateManualOrderDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
