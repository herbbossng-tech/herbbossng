import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, Loader2, Package, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCreateOrder } from '@/features/orders/hooks'
import { orderSourceLabels } from '@/features/orders/statusMeta'
import { type CreateOrderInput, type CreateOrderOutput, createOrderSchema } from '@/features/orders/validation'
import { useProducts } from '@/features/products/hooks'
import { formatCurrency } from '@/lib/currency'

const defaultFormValues: CreateOrderInput = {
  source: 'manual',
  sourceDetail: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerCountryCode: '',
  customerState: '',
  customerCity: '',
  customerAddress: '',
  customerAddress2: '',
  customerPostalCode: '',
  items: [],
  shippingFee: 0,
  discountAmount: 0,
  priority: 'normal',
  internalNotes: '',
  affiliateReferralCode: '',
}

export function CreateOrderPage() {
  const navigate = useNavigate()
  const { activeWorkspace } = useWorkspace()
  const createOrder = useCreateOrder()
  const { data: products } = useProducts({ status: 'active' })
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateOrderInput, unknown, CreateOrderOutput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: { ...defaultFormValues, customerCountryCode: activeWorkspace.country_code ?? '' },
  })

  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' })
  const items = watch('items')
  const shippingFee = Number(watch('shippingFee')) || 0
  const discountAmount = Number(watch('discountAmount')) || 0

  function productById(id: string) {
    return products?.find((p) => p.id === id)
  }

  function addProduct(productId: string) {
    const existingIndex = fields.findIndex((f) => f.productId === productId)
    if (existingIndex >= 0) {
      update(existingIndex, { productId, quantity: (Number(items[existingIndex]?.quantity) || 0) + 1 })
    } else {
      append({ productId, quantity: 1 })
    }
    setPickerOpen(false)
  }

  const subtotal = items.reduce((sum, item) => {
    const product = productById(item.productId)
    return sum + (product ? product.selling_price * (Number(item.quantity) || 0) : 0)
  }, 0)
  const estimatedTotal = Math.max(0, subtotal + shippingFee - discountAmount)

  async function submit(values: CreateOrderOutput) {
    const order = await createOrder.mutateAsync(values)
    navigate(`/orders/${order.id}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Create Order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prices are always taken from the current product catalogue at submission time.
        </p>
      </div>

      <form onSubmit={handleSubmit(submit)} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerName">Full name</Label>
                <Input id="customerName" {...register('customerName')} aria-invalid={!!errors.customerName} />
                {errors.customerName && <p className="text-xs text-destructive">{errors.customerName.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerPhone">Phone number</Label>
                <Input id="customerPhone" {...register('customerPhone')} aria-invalid={!!errors.customerPhone} />
                {errors.customerPhone && <p className="text-xs text-destructive">{errors.customerPhone.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerEmail">Email (optional)</Label>
                <Input id="customerEmail" type="email" {...register('customerEmail')} aria-invalid={!!errors.customerEmail} />
                {errors.customerEmail && <p className="text-xs text-destructive">{errors.customerEmail.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerCity">City</Label>
                <Input id="customerCity" {...register('customerCity')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerState">State / Region</Label>
                <Input id="customerState" {...register('customerState')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerPostalCode">Postal code</Label>
                <Input id="customerPostalCode" {...register('customerPostalCode')} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="customerAddress">Delivery address</Label>
                <Textarea id="customerAddress" rows={2} {...register('customerAddress')} aria-invalid={!!errors.customerAddress} />
                {errors.customerAddress && <p className="text-xs text-destructive">{errors.customerAddress.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="customerAddress2">Address line 2 (optional)</Label>
                <Input id="customerAddress2" {...register('customerAddress2')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Items</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Product
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {errors.items && !Array.isArray(errors.items) && (
                <p className="text-xs text-destructive">{errors.items.message}</p>
              )}
              {fields.length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  <Package className="h-6 w-6" />
                  No products added yet.
                </div>
              )}
              {fields.map((field, index) => {
                const product = productById(field.productId)
                return (
                  <div key={field.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{product?.name ?? 'Unknown product'}</p>
                      <p className="text-xs text-muted-foreground">
                        {product ? formatCurrency(product.selling_price, activeWorkspace.currency_code) : '—'}
                        {product?.track_inventory && (product.available_quantity ?? 0) <= 0 && (
                          <span className="ml-2 text-destructive">Out of stock</span>
                        )}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      className="w-20"
                      {...register(`items.${index}.quantity` as const)}
                    />
                    <p className="w-24 shrink-0 text-right text-sm font-semibold">
                      {product ? formatCurrency(product.selling_price * (Number(items[index]?.quantity) || 0), activeWorkspace.currency_code) : '—'}
                    </p>
                    <Button type="button" size="icon" variant="ghost" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea placeholder="Internal notes visible to your team only…" rows={3} {...register('internalNotes')} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Source</Label>
                <Controller
                  control={control}
                  name="source"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(orderSourceLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sourceDetail">Source detail (optional)</Label>
                <Input id="sourceDetail" placeholder="e.g. campaign name, landing page" {...register('sourceDetail')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="affiliateReferralCode">Affiliate referral code (optional)</Label>
                <Input
                  id="affiliateReferralCode"
                  placeholder="e.g. AFF-4F2A9C"
                  className="font-mono uppercase"
                  {...register('affiliateReferralCode')}
                />
                <p className="text-xs text-muted-foreground">
                  If this order came through an affiliate, enter their referral code to attribute it and calculate commission automatically.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Priority</Label>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shippingFee">Shipping fee</Label>
                <Input id="shippingFee" type="number" step="0.01" min={0} {...register('shippingFee')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discountAmount">Discount</Label>
                <Input id="discountAmount" type="number" step="0.01" min={0} {...register('discountAmount')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal, activeWorkspace.currency_code)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span>{formatCurrency(shippingFee, activeWorkspace.currency_code)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount, activeWorkspace.currency_code)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
                <span>Estimated total</span>
                <span>{formatCurrency(estimatedTotal, activeWorkspace.currency_code)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Final pricing is recalculated from the live product catalogue when the order is submitted.
              </p>
              <Button type="submit" className="mt-2" disabled={createOrder.isPending || fields.length === 0}>
                {createOrder.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Order
              </Button>
              {createOrder.isError && (
                <p className="text-xs text-destructive">
                  {(createOrder.error as Error)?.message ?? 'Could not create order. Please try again.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </form>

      <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <CommandInput placeholder="Search products by name or SKU…" />
        <CommandList>
          <CommandEmpty>No products found.</CommandEmpty>
          <CommandGroup heading="Products">
            {(products ?? []).map((product) => (
              <CommandItem
                key={product.id}
                value={`${product.name} ${product.sku ?? ''}`}
                onSelect={() => addProduct(product.id)}
              >
                <Package className="h-4 w-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{product.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatCurrency(product.selling_price, activeWorkspace.currency_code)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
