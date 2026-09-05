import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAdjustInventory } from '@/features/inventory/hooks'
import type { Product } from '@/types/database'

const schema = z.object({
  transactionType: z.enum(['STOCK_IN', 'STOCK_OUT', 'DAMAGED', 'RETURNED', 'ADJUSTMENT']),
  quantity: z.coerce.number().refine((v) => v !== 0, 'Quantity must not be zero'),
  reason: z.string(),
})

type FormInput = z.input<typeof schema>
type FormValues = z.infer<typeof schema>

export function StockAdjustmentDialog({
  product,
  onOpenChange,
}: {
  product: Product | null
  onOpenChange: (open: boolean) => void
}) {
  const adjustInventory = useAdjustInventory()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { transactionType: 'STOCK_IN', quantity: 1, reason: '' },
  })

  const submit = async (values: FormValues) => {
    if (!product) return
    await adjustInventory.mutateAsync({
      productId: product.id,
      transactionType: values.transactionType,
      quantity: Math.abs(values.quantity),
      reason: values.reason || undefined,
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock — {product?.name}</DialogTitle>
          <DialogDescription>
            Current available: {product?.available_quantity ?? 0}. Every change is recorded in the inventory ledger.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4 px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label>Transaction type</Label>
            <Controller
              control={control}
              name="transactionType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STOCK_IN">Stock In (new delivery)</SelectItem>
                    <SelectItem value="STOCK_OUT">Stock Out (manual removal)</SelectItem>
                    <SelectItem value="RETURNED">Returned (back into stock)</SelectItem>
                    <SelectItem value="DAMAGED">Damaged</SelectItem>
                    <SelectItem value="ADJUSTMENT">Correction (+/-)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" {...register('quantity')} aria-invalid={!!errors.quantity} />
            {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea id="reason" rows={2} {...register('reason')} />
          </div>

          {adjustInventory.isError && (
            <p className="text-xs text-destructive">{(adjustInventory.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjustInventory.isPending}>
              {adjustInventory.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
