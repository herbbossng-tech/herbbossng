import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, X } from 'lucide-react'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useCategories } from '@/features/categories/hooks'
import { ProductImageUploader } from '@/features/products/components/ProductImageUploader'
import type { ProductFormValues } from '@/features/products/types'
import { type ProductFormInput, productFormSchema } from '@/features/products/validation'
import { formatCurrency } from '@/lib/currency'
import { useWorkspace } from '@/contexts/WorkspaceContext'

interface ProductFormProps {
  mode: 'create' | 'edit'
  productId?: string
  defaultValues: ProductFormValues
  onSubmit: (values: ProductFormValues) => Promise<{ id: string } | undefined>
  isSubmitting: boolean
}

export function ProductForm({ mode, productId, defaultValues, onSubmit, isSubmitting }: ProductFormProps) {
  const navigate = useNavigate()
  const { activeWorkspace } = useWorkspace()
  const { data: categories } = useCategories()
  const [tagInput, setTagInput] = React.useState('')

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues,
  })

  const trackInventory = watch('trackInventory')
  const tags = watch('tags')
  const sellingPrice = watch('sellingPrice')

  const submit = async (values: ProductFormValues) => {
    const result = await onSubmit(values)
    if (mode === 'create' && result?.id) {
      navigate(`/products/${result.id}/edit`, { replace: true })
    }
  }

  const addTag = () => {
    const value = tagInput.trim()
    if (value && !tags.includes(value)) {
      setValue('tags', [...tags, value])
    }
    setTagInput('')
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-5">
      <Tabs defaultValue="basic">
        <TabsList className="flex-wrap">
          <TabsTrigger value="basic">Basic Information</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="shipping">Shipping</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="affiliate">Affiliate</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Name, SKU, category and description.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="name">Product name</Label>
                <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" placeholder="e.g. GH-DETOX-001" {...register('sku')} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {(categories ?? []).map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="shortDescription">Short description</Label>
                <Textarea id="shortDescription" rows={2} {...register('shortDescription')} />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="description">Full description</Label>
                <Textarea id="description" rows={5} {...register('description')} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>Selling, cost and compare-at prices in {activeWorkspace.currency_code}.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sellingPrice">Selling price</Label>
                <Input id="sellingPrice" type="number" step="0.01" min={0} {...register('sellingPrice')} aria-invalid={!!errors.sellingPrice} />
                {errors.sellingPrice && <p className="text-xs text-destructive">{errors.sellingPrice.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="costPrice">Cost price</Label>
                <Input id="costPrice" type="number" step="0.01" min={0} {...register('costPrice')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="comparePrice">Compare-at price</Label>
                <Input id="comparePrice" type="number" step="0.01" min={0} {...register('comparePrice')} aria-invalid={!!errors.comparePrice} />
                {errors.comparePrice && <p className="text-xs text-destructive">{errors.comparePrice.message}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>Starting stock and low-stock alerting.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Track inventory</p>
                  <p className="text-xs text-muted-foreground">Disable for services or unlimited digital goods.</p>
                </div>
                <Controller
                  control={control}
                  name="trackInventory"
                  render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                />
              </div>

              {trackInventory && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="stockQuantity">
                      {mode === 'create' ? 'Starting stock quantity' : 'Stock quantity'}
                    </Label>
                    <Input id="stockQuantity" type="number" min={0} disabled={mode === 'edit'} {...register('stockQuantity')} />
                    {mode === 'edit' && (
                      <p className="text-xs text-muted-foreground">
                        Adjust stock from the Inventory page so every change is logged.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="lowStockThreshold">Low stock threshold</Label>
                    <Input id="lowStockThreshold" type="number" min={0} {...register('lowStockThreshold')} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media">
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
              <CardDescription>Product images and videos. The first upload is set as primary.</CardDescription>
            </CardHeader>
            <CardContent>
              {productId ? (
                <ProductImageUploader productId={productId} />
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Save the product first, then come back here to upload images.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shipping">
          <Card>
            <CardHeader>
              <CardTitle>Shipping</CardTitle>
              <CardDescription>Weight and delivery information shown at checkout.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input id="weight" type="number" step="0.01" min={0} {...register('weight')} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="deliveryInformation">Delivery information</Label>
                <Textarea id="deliveryInformation" rows={3} {...register('deliveryInformation')} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="returnPolicy">Return policy</Label>
                <Textarea id="returnPolicy" rows={3} {...register('returnPolicy')} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketing">
          <Card>
            <CardHeader>
              <CardTitle>Marketing</CardTitle>
              <CardDescription>Tags and SEO metadata.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tagInput">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="tagInput"
                    placeholder="Add a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    Add
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => setValue('tags', tags.filter((t) => t !== tag))}
                          className="ml-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="seoTitle">SEO title</Label>
                <Input id="seoTitle" {...register('seoTitle')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="seoDescription">SEO description</Label>
                <Textarea id="seoDescription" rows={2} {...register('seoDescription')} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="affiliate">
          <Card>
            <CardHeader>
              <CardTitle>Affiliate</CardTitle>
              <CardDescription>Commission paid to affiliates who sell this product.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Commission type</Label>
                <Controller
                  control={control}
                  name="affiliateCommissionType"
                  render={({ field }) => (
                    <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="No commission" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No commission</SelectItem>
                        <SelectItem value="fixed">Fixed amount</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="affiliateCommissionValue">Commission value</Label>
                <Input id="affiliateCommissionValue" type="number" step="0.01" min={0} {...register('affiliateCommissionValue')} />
                <p className="text-xs text-muted-foreground">
                  {watch('affiliateCommissionType') === 'percentage' && sellingPrice
                    ? `≈ ${formatCurrency((Number(sellingPrice) * (Number(watch('affiliateCommissionValue')) || 0)) / 100, activeWorkspace.currency_code)} per sale`
                    : ' '}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button type="button" variant="outline" onClick={() => navigate('/products')}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === 'create' ? 'Create Product' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
