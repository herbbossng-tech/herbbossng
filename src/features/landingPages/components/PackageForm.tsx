import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { type PackageFormInput, type PackageFormOutput, packageFormSchema } from '@/features/landingPages/validation'

interface PackageFormProps {
  defaultValues: PackageFormOutput
  onSubmit: (values: PackageFormOutput) => Promise<void>
  isSubmitting: boolean
  submitLabel?: string
}

export function PackageForm({ defaultValues, onSubmit, isSubmitting, submitLabel = 'Save Package' }: PackageFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<PackageFormInput, unknown, PackageFormOutput>({
    resolver: zodResolver(packageFormSchema),
    defaultValues,
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'shippingRates' })
  const shippingType = watch('shippingType')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="pkgName">Package name</Label>
          <Input id="pkgName" placeholder="e.g. Buy 3 Get 1 Free" {...register('name')} aria-invalid={!!errors.name} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pkgQuantity">Total units shipped</Label>
          <Input id="pkgQuantity" type="number" min={1} {...register('quantity')} aria-invalid={!!errors.quantity} />
          {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pkgPrice">Price (charged to customer)</Label>
          <Input id="pkgPrice" type="number" step="0.01" min={0} {...register('price')} aria-invalid={!!errors.price} />
          {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pkgCompareAt">Compare-at price (optional)</Label>
          <Input id="pkgCompareAt" type="number" step="0.01" min={0} {...register('compareAtPrice')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pkgBadge">Badge (optional)</Label>
          <Input id="pkgBadge" placeholder="e.g. Best Value" {...register('badge')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pkgSavings">Savings text (optional)</Label>
          <Input id="pkgSavings" placeholder="e.g. Save ₦12,000" {...register('savingsText')} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="pkgOffer">Offer text (optional)</Label>
          <Input id="pkgOffer" placeholder="e.g. Most customers choose this pack" {...register('offerText')} />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <Label>Shipping</Label>
        <Controller
          control={control}
          name="shippingType"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free delivery</SelectItem>
                <SelectItem value="fixed">Fixed fee</SelectItem>
                <SelectItem value="by_state">By state/region</SelectItem>
              </SelectContent>
            </Select>
          )}
        />

        {shippingType === 'fixed' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shipAmount">Delivery fee</Label>
            <Input id="shipAmount" type="number" step="0.01" min={0} className="w-40" {...register('shippingAmount')} />
          </div>
        )}

        {shippingType === 'by_state' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shipDefault">Default fee (states not listed below)</Label>
              <Input id="shipDefault" type="number" step="0.01" min={0} className="w-40" {...register('shippingDefault')} />
            </div>
            <div className="flex flex-col gap-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input placeholder="State" {...register(`shippingRates.${index}.state` as const)} />
                  <Input type="number" step="0.01" min={0} className="w-32" placeholder="Fee" {...register(`shippingRates.${index}.amount` as const)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => append({ state: '', amount: 0 })}>
                <Plus className="h-3.5 w-3.5" />
                Add state rate
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              Enabled (visible on the public page)
            </label>
          )}
        />
        <Controller
          control={control}
          name="isDefault"
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              Pre-selected by default
            </label>
          )}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
