import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createPublicOrder, trackLandingPageEvent } from '@/features/landingPages/api'
import type { OrderFormConfig } from '@/features/landingPages/sectionTypes'
import { getSessionId } from '@/features/landingPages/public/scroll'
import { getMarketConfig, validateMarketPhone } from '@/lib/validation/market'
import { formatCurrency } from '@/lib/currency'
import type { LandingPageFormConfig, LandingPagePackage, Order } from '@/types/database'

function computeShippingFeeClient(rule: LandingPagePackage['shipping_rule'], state: string): number {
  if (!rule || rule.type === 'free') return 0
  if (rule.type === 'fixed') return rule.amount ?? 0
  if (rule.type === 'by_state') {
    const rates = rule.rates ?? {}
    if (state && rates[state] !== undefined) return rates[state]
    return rule.default ?? 0
  }
  return 0
}

interface CodOrderFormProps {
  slug: string
  sectionConfig: OrderFormConfig
  formConfig: LandingPageFormConfig
  orderSummaryEnabled: boolean
  countryCode: string | null
  currencyCode: string | null
  selectedPackage: LandingPagePackage | null
  onOrderCreated: (order: Order) => void
}

export function CodOrderForm({
  slug,
  sectionConfig,
  formConfig,
  orderSummaryEnabled,
  countryCode,
  currencyCode,
  selectedPackage,
  onOrderCreated,
}: CodOrderFormProps) {
  const [searchParams] = useSearchParams()
  const market = React.useMemo(() => getMarketConfig(countryCode), [countryCode])
  const submissionToken = React.useRef(crypto.randomUUID())
  const startedTracked = React.useRef(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const schema = React.useMemo(
    () =>
      z.object({
        fullName: z.string().min(2, 'Enter your full name'),
        phone: z.string().refine((v) => validateMarketPhone(v, market), `Please enter a valid ${market.name} phone number.`),
        email: z.string().refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address'),
        alternatePhone: z.string(),
        state: z.string().min(1, 'Enter your state/region'),
        city: z.string().min(1, 'Enter your city'),
        address: z
          .string()
          .min(5, 'Enter your full delivery address')
          .regex(/[a-zA-Z]/, 'Enter a valid delivery address'),
        landmark: z.string(),
        notes: z.string(),
      }),
    [market],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', email: '', alternatePhone: '', state: '', city: '', address: '', landmark: '', notes: '' },
  })

  const state = watch('state')
  const shippingFee = selectedPackage ? computeShippingFeeClient(selectedPackage.shipping_rule, state) : 0
  const total = (selectedPackage?.price ?? 0) + shippingFee

  function trackFormStarted() {
    if (!startedTracked.current) {
      startedTracked.current = true
      trackLandingPageEvent(slug, 'form_started', getSessionId())
    }
  }

  async function submit(values: FormValues) {
    if (!selectedPackage) {
      setSubmitError('Please select a package above first.')
      return
    }
    setSubmitError(null)
    setSubmitting(true)
    try {
      await trackLandingPageEvent(slug, 'form_submitted', getSessionId())
      const order = await createPublicOrder(slug, {
        packageId: selectedPackage.id,
        customerName: values.fullName,
        customerPhone: values.phone,
        customerAddress: values.address,
        customerState: values.state,
        customerCity: values.city,
        customerEmail: values.email || undefined,
        landmark: values.landmark || undefined,
        customerNotes: values.notes || undefined,
        submissionToken: submissionToken.current,
        utmSource: searchParams.get('utm_source') ?? undefined,
        utmMedium: searchParams.get('utm_medium') ?? undefined,
        utmCampaign: searchParams.get('utm_campaign') ?? undefined,
        utmContent: searchParams.get('utm_content') ?? undefined,
        utmTerm: searchParams.get('utm_term') ?? undefined,
      })
      await trackLandingPageEvent(slug, 'order_created', getSessionId(), { order_id: order.id })
      onOrderCreated(order)
    } catch (err) {
      setSubmitError((err as Error)?.message?.includes('package_unavailable')
        ? 'This package is no longer available. Please choose another.'
        : 'We could not submit your order. Please check your details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="order-form" className="px-5 py-10 sm:px-8 sm:py-14">
      <Card className="mx-auto max-w-lg p-5 sm:p-6">
        {sectionConfig.title && <h2 className="mb-4 text-xl font-bold text-foreground">{sectionConfig.title}</h2>}
        <form onSubmit={handleSubmit(submit)} onChangeCapture={trackFormStarted} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lp-fullName">Full name</Label>
            <Input id="lp-fullName" {...register('fullName')} aria-invalid={!!errors.fullName} />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lp-phone">Phone number</Label>
            <Input id="lp-phone" placeholder={market.phonePlaceholder} {...register('phone')} aria-invalid={!!errors.phone} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          {formConfig.collectAlternatePhone && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-altPhone">Alternate phone (optional)</Label>
              <Input id="lp-altPhone" placeholder={market.phonePlaceholder} {...register('alternatePhone')} />
            </div>
          )}
          {formConfig.collectEmail && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-email">Email (optional)</Label>
              <Input id="lp-email" type="email" {...register('email')} aria-invalid={!!errors.email} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-state">State/Region</Label>
              <Input id="lp-state" {...register('state')} aria-invalid={!!errors.state} />
              {errors.state && <p className="text-xs text-destructive">{errors.state.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-city">City</Label>
              <Input id="lp-city" {...register('city')} aria-invalid={!!errors.city} />
              {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lp-address">Delivery address</Label>
            <Textarea id="lp-address" rows={2} {...register('address')} aria-invalid={!!errors.address} />
            {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
          </div>
          {formConfig.collectLandmark && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-landmark">Landmark (optional)</Label>
              <Input id="lp-landmark" placeholder="e.g. Near the market" {...register('landmark')} />
            </div>
          )}
          {formConfig.collectNotes && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lp-notes">Notes (optional)</Label>
              <Textarea id="lp-notes" rows={2} {...register('notes')} />
            </div>
          )}

          {orderSummaryEnabled && selectedPackage && (
            <div className="mt-2 rounded-lg border border-border bg-secondary/20 p-4 text-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Order Summary</p>
              <p className="font-medium text-foreground">{selectedPackage.name}</p>
              <div className="mt-2 flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(selectedPackage.price, currencyCode)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span>{shippingFee === 0 ? 'Free' : formatCurrency(shippingFee, currencyCode)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
                <span>Total</span>
                <span>{formatCurrency(total, currencyCode)}</span>
              </div>
            </div>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <Button type="submit" size="lg" className="mt-2" disabled={submitting || !selectedPackage}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {selectedPackage ? `Place Order — ${formatCurrency(total, currencyCode)}` : 'Select a package above'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Pay on Delivery — you only pay when your order arrives.</p>
        </form>
      </Card>
    </section>
  )
}
