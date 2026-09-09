import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import * as React from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { fetchLandingPageBySlug, fetchPublicOrderConfirmation } from '@/features/landingPages/api'
import { firePixelPurchase } from '@/features/landingPages/public/tracking'
import { formatCurrency } from '@/lib/currency'
import type { Order } from '@/types/database'

interface ThankYouLocationState {
  order?: Order
  packageName?: string
}

interface ConfirmedOrder {
  order_number: string
  total_amount: number
  currency_code: string
  customer_phone: string | null
}

/** Guards against a refresh (or React strict-mode double-invoke) firing Purchase more than once for the same order in this browser. */
function hasFiredPurchase(orderId: string): boolean {
  try {
    return sessionStorage.getItem(`gcos.purchaseFired.${orderId}`) === '1'
  } catch {
    return false
  }
}

function markPurchaseFired(orderId: string): void {
  try {
    sessionStorage.setItem(`gcos.purchaseFired.${orderId}`, '1')
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — tracking is never allowed to break the page.
  }
}

export function ThankYouPage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const state = (location.state ?? {}) as ThankYouLocationState
  const orderId = searchParams.get('order') ?? state.order?.id ?? null

  // Thank-you content is editable per page (thank_you_config, added in
  // 0044) — fetched here rather than carried in navigate() state so a
  // refresh/direct/bookmarked visit renders identically to the "just
  // ordered" path.
  const { data: page } = useQuery({
    queryKey: ['public-landing-page', slug],
    queryFn: () => fetchLandingPageBySlug(slug as string),
    enabled: Boolean(slug),
    retry: false,
  })
  const config = page?.thank_you_config ?? {}

  // Fast path: navigate() state is already the full order (the common
  // case — no refresh happened). Only fall back to a fetch (refresh, or
  // a direct/bookmarked visit) when state is missing but an order id is
  // present in the URL.
  const { data: fetchedOrder } = useQuery({
    queryKey: ['public-order-confirmation', orderId],
    queryFn: () => fetchPublicOrderConfirmation(orderId as string),
    enabled: !state.order && !!orderId,
  })

  const order: ConfirmedOrder | undefined = state.order ?? fetchedOrder ?? undefined
  const showOrderSummary = config.showOrderSummary ?? true

  React.useEffect(() => {
    if (!orderId || !order) return
    if (hasFiredPurchase(orderId)) return
    markPurchaseFired(orderId)
    firePixelPurchase({ orderId, currency: order.currency_code, value: order.total_amount })
  }, [orderId, order])

  return (
    <div className="lp-storefront flex min-h-screen flex-col items-center justify-center bg-background px-5 py-12 text-center text-foreground">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold">{config.headline || 'Your order has been received!'}</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {config.message || 'You will pay when your order is delivered — no payment has been taken online.'}
      </p>

      {showOrderSummary && order ? (
        <Card className="mt-6 w-full max-w-sm p-5 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Order number</span>
            <span className="font-mono font-semibold text-foreground">{order.order_number}</span>
          </div>
          {state.packageName && (
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Package</span>
              <span className="font-medium text-foreground">{state.packageName}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>Amount to pay on delivery</span>
            <span>{formatCurrency(order.total_amount, order.currency_code)}</span>
          </div>
          {order.customer_phone && (
            <p className="mt-3 text-xs text-muted-foreground">
              Our team will contact you at <span className="font-medium text-foreground">{order.customer_phone}</span> to confirm your order.
            </p>
          )}
        </Card>
      ) : !showOrderSummary && order ? null : (
        <Card className="mt-6 w-full max-w-sm p-5 text-sm text-muted-foreground">
          Your order was submitted successfully. Our team will contact you shortly to confirm delivery details.
        </Card>
      )}

      {config.ctaLabel && (
        <Button asChild size="lg" className="mt-6 rounded-xl font-bold">
          <a href={config.ctaTarget || '#'}>{config.ctaLabel}</a>
        </Button>
      )}

      {config.upsell?.enabled && (
        <Card className="mt-8 w-full max-w-sm overflow-hidden p-5 text-left">
          {config.upsell.imageUrl && <img src={config.upsell.imageUrl} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" />}
          {config.upsell.title && <p className="font-bold text-foreground">{config.upsell.title}</p>}
          {config.upsell.body && <p className="mt-1 text-sm text-muted-foreground">{config.upsell.body}</p>}
          {config.upsell.ctaLabel && (
            <Button asChild className="mt-3 w-full rounded-xl font-bold">
              <a href={config.upsell.ctaTarget || '#'}>{config.upsell.ctaLabel}</a>
            </Button>
          )}
        </Card>
      )}

      {slug && (
        <Link to={`/l/${slug}`} className="mt-8 text-xs text-muted-foreground hover:text-primary">
          Back to page
        </Link>
      )}
    </div>
  )
}
