import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type CustomerFormInput, type CustomerFormOutput, customerFormSchema } from '@/features/customers/validation'

interface CustomerFormProps {
  defaultValues: CustomerFormOutput
  onSubmit: (values: CustomerFormOutput) => Promise<void>
  isSubmitting: boolean
  submitError?: string | null
  submitLabel?: string
  /**
   * false in the edit context: the phone number is the canonical-match
   * identity key (see normalize_phone() in migration 0020), recomputed
   * only by create_order()/create_customer() server-side. A plain field
   * edit here would silently desync canonical_phone from phone — until
   * there's a dedicated re-normalize-on-change RPC, phone stays
   * read-only after creation rather than risk that.
   */
  phoneEditable?: boolean
}

export function CustomerForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitError,
  submitLabel = 'Save',
  phoneEditable = true,
}: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormInput, unknown, CustomerFormOutput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues,
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" {...register('fullName')} aria-invalid={!!errors.fullName} />
          {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" disabled={!phoneEditable} {...register('phone')} aria-invalid={!!errors.phone} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          {!phoneEditable && <p className="text-xs text-muted-foreground">Phone number can&apos;t be changed after creation.</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alternatePhone">Alternate phone (optional)</Label>
          <Input id="alternatePhone" {...register('alternatePhone')} aria-invalid={!!errors.alternatePhone} />
          {errors.alternatePhone && <p className="text-xs text-destructive">{errors.alternatePhone.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register('city')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="state">State / Region</Label>
          <Input id="state" {...register('state')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="postalCode">Postal code (optional)</Label>
          <Input id="postalCode" {...register('postalCode')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="landmark">Landmark (optional)</Label>
          <Input id="landmark" {...register('landmark')} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" rows={2} {...register('address')} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="addressLine2">Address line 2 (optional)</Label>
          <Input id="addressLine2" {...register('addressLine2')} />
        </div>
      </div>

      {submitError && <p className="text-xs text-destructive">{submitError}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
