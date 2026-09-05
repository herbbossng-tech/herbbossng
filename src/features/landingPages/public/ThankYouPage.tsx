import { CheckCircle2 } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import type { Order } from '@/types/database'

interface ThankYouLocationState {
  order?: Order
  packageName?: string
}

export function ThankYouPage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const state = (location.state ?? {}) as ThankYouLocationState
  const order = state.order

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-12 text-center text-foreground">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold">Your order has been received!</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        You will pay when your order is delivered — no payment has been taken online.
      </p>

      {order ? (
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
          <p className="mt-3 text-xs text-muted-foreground">
            Our team will contact you at <span className="font-medium text-foreground">{order.customer_phone}</span> to confirm your order.
          </p>
        </Card>
      ) : (
        <Card className="mt-6 w-full max-w-sm p-5 text-sm text-muted-foreground">
          Your order was submitted successfully. Our team will contact you shortly to confirm delivery details.
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
