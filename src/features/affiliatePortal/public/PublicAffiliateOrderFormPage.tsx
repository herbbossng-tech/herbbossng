import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/currency'
import { getMarketConfig, validateMarketPhone } from '@/lib/validation/market'
import { cn } from '@/lib/utils'
import type { LandingPageFormConfig } from '@/types/database'

import { getProductImageUrl, submitPublicAffiliateOrder } from '../api'
import { usePublicAffiliateOrderForm } from '../hooks'

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  phone: z.string().min(1, 'Enter your phone number'),
  email: z.string().refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address'),
  state: z.string().min(1, 'Enter your state/region'),
  city: z.string().min(1, 'Enter your city'),
  address: z.string().min(5, 'Enter your full delivery address').regex(/[a-zA-Z]/, 'Enter a valid delivery address'),
  landmark: z.string(),
  notes: z.string(),
})
type FormValues = z.infer<typeof schema>

function useEmbedAutoResize(embed: boolean) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!embed || !ref.current) return
    const el = ref.current
    const post = () => window.parent.postMessage({ type: 'gcos-form-height', height: el.scrollHeight }, '*')
    const observer = new ResizeObserver(post)
    observer.observe(el)
    post()
    return () => observer.disconnect()
  }, [embed])
  return ref
}

export function PublicAffiliateOrderFormPage() {
  const { formId } = useParams<{ formId: string }>()
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === '1'
  const containerRef = useEmbedAutoResize(embed)

  const { data: form, isLoading, isError } = usePublicAffiliateOrderForm(formId)
  const [selectedPackageId, setSelectedPackageId] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [orderNumber, setOrderNumber] = React.useState<string | null>(null)
  const submissionToken = React.useRef(crypto.randomUUID())

  const market = React.useMemo(() => getMarketConfig(form?.workspace_country_code), [form?.workspace_country_code])
  const formConfig = (form?.form_config ?? {}) as LandingPageFormConfig

  React.useEffect(() => {
    if (form && !selectedPackageId) {
      const defaultPkg = form.packages.find((p) => p.is_default) ?? form.packages[0]
      if (defaultPkg) setSelectedPackageId(defaultPkg.id)
    }
  }, [form, selectedPackageId])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', email: '', state: '', city: '', address: '', landmark: '', notes: '' },
  })

  async function onSubmit(values: FormValues) {
    if (!form || !selectedPackageId) {
      setSubmitError('Please select a price option above first.')
      return
    }
    if (!validateMarketPhone(values.phone, market)) {
      setSubmitError(`Please enter a valid ${market.name} phone number.`)
      return
    }
    setSubmitError(null)
    setSubmitting(true)
    try {
      const order = await submitPublicAffiliateOrder({
        formId: form.id,
        packageId: selectedPackageId,
        customerName: values.fullName,
        customerPhone: values.phone,
        customerAddress: values.address,
        customerState: values.state,
        customerCity: values.city,
        customerEmail: values.email || undefined,
        landmark: values.landmark || undefined,
        customerNotes: values.notes || undefined,
        submissionToken: submissionToken.current,
      })
      setOrderNumber((order as { order_number: string }).order_number)
    } catch {
      setSubmitError('We could not submit your order. Please check your details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (isError || !form) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">This order form is not available.</p>
      </div>
    )
  }

  if (orderNumber) {
    return (
      <div ref={containerRef} className="flex flex-col items-center gap-3 px-5 py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <h1 className="text-xl font-bold text-foreground">Order received!</h1>
        <p className="text-sm text-muted-foreground">Your order {orderNumber} has been placed. You'll be contacted to confirm delivery.</p>
      </div>
    )
  }

  const selectedPackage = form.packages.find((p) => p.id === selectedPackageId) ?? null
  const inputClass = 'bg-secondary/30 border-transparent focus-visible:border-primary focus-visible:bg-background'

  return (
    <div ref={containerRef} className="mx-auto max-w-md px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col items-center gap-3 text-center">
        {form.product_image_path && (
          <img src={getProductImageUrl(form.product_image_path)} alt={form.product_name} className="h-32 w-32 rounded-xl object-cover shadow-sm" />
        )}
        <h1 className="text-lg font-bold text-foreground">{form.product_name}</h1>
      </div>

      <div className="mb-5 flex flex-col gap-2">
        {form.packages.map((pkg) => (
          <button
            key={pkg.id}
            type="button"
            onClick={() => setSelectedPackageId(pkg.id)}
            className={cn(
              'flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors',
              selectedPackageId === pkg.id ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <span className="text-sm font-semibold text-foreground">{pkg.name}</span>
            <span className="flex items-baseline gap-2">
              {pkg.compare_at_price && pkg.compare_at_price > pkg.price && (
                <span className="text-xs text-muted-foreground line-through">{formatCurrency(pkg.compare_at_price, form.workspace_currency_code)}</span>
              )}
              <span className="text-sm font-bold text-foreground">{formatCurrency(pkg.price, form.workspace_currency_code)}</span>
            </span>
          </button>
        ))}
      </div>

      <Card className="rounded-2xl p-5 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aff-fullName">Full Name *</Label>
            <Input id="aff-fullName" required className={inputClass} {...register('fullName')} aria-invalid={!!errors.fullName} />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aff-address">Delivery Address *</Label>
            <Textarea id="aff-address" required rows={2} className={inputClass} {...register('address')} aria-invalid={!!errors.address} />
            {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aff-phone">Phone Number *</Label>
            <Input id="aff-phone" required placeholder={market.phonePlaceholder} className={inputClass} {...register('phone')} aria-invalid={!!errors.phone} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          {formConfig.collectEmail && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="aff-email">Email (optional)</Label>
              <Input id="aff-email" type="email" className={inputClass} {...register('email')} aria-invalid={!!errors.email} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aff-city">City *</Label>
            <Input id="aff-city" required className={inputClass} {...register('city')} aria-invalid={!!errors.city} />
            {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aff-state">State *</Label>
            <Input id="aff-state" required className={inputClass} {...register('state')} aria-invalid={!!errors.state} />
            {errors.state && <p className="text-xs text-destructive">{errors.state.message}</p>}
          </div>
          {formConfig.collectLandmark && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="aff-landmark">Landmark (optional)</Label>
              <Input id="aff-landmark" className={inputClass} {...register('landmark')} />
            </div>
          )}
          {formConfig.collectNotes && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="aff-notes">Notes (optional)</Label>
              <Textarea id="aff-notes" rows={2} className={inputClass} {...register('notes')} />
            </div>
          )}

          {submitError && <p className="text-xs text-destructive">{submitError}</p>}

          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            {submitting ? 'Placing order…' : `Order Now${selectedPackage ? ` — ${formatCurrency(selectedPackage.price, form.workspace_currency_code)}` : ''}`}
          </Button>
        </form>
      </Card>
    </div>
  )
}
