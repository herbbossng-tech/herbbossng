import { MessageCircle } from 'lucide-react'

import { scrollToOrderArea } from '@/features/landingPages/public/scroll'
import { formatCurrency } from '@/lib/currency'
import type { FloatingCtaConfig, WhatsappCtaConfig } from '@/types/database'

interface FloatingOrderCtaProps {
  config: FloatingCtaConfig
  /** Currently-selected package price, when one is selected — shown as a running total alongside the button. */
  price?: number | null
  currencyCode?: string | null
}

export function FloatingOrderCta({ config, price, currencyCode }: FloatingOrderCtaProps) {
  if (!config?.enabled) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur sm:hidden">
      <div className="flex items-center justify-between gap-3">
        {price != null && (
          <div className="text-sm leading-tight">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="font-bold text-foreground">{formatCurrency(price, currencyCode ?? null)}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => scrollToOrderArea()}
          className="ml-auto flex-1 rounded-xl bg-primary py-3 text-center text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          {config.label || 'Order Now'}
        </button>
      </div>
    </div>
  )
}

export function WhatsappCta({ config }: { config: WhatsappCtaConfig }) {
  if (!config?.enabled || !config.phone) return null
  const digits = config.phone.replace(/[^0-9]/g, '')
  const href = `https://wa.me/${digits}${config.message ? `?text=${encodeURIComponent(config.message)}` : ''}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-success px-4 py-3 text-sm font-bold text-white shadow-2xl transition-transform active:scale-[0.98]"
    >
      <MessageCircle className="h-4 w-4" />
      {config.label || 'Chat With Us'}
    </a>
  )
}
