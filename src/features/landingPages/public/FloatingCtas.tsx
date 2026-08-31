import { MessageCircle } from 'lucide-react'

import { scrollToOrderArea } from '@/features/landingPages/public/scroll'
import type { FloatingCtaConfig, WhatsappCtaConfig } from '@/types/database'

export function FloatingOrderCta({ config }: { config: FloatingCtaConfig }) {
  if (!config?.enabled) return null
  return (
    <button
      type="button"
      onClick={scrollToOrderArea}
      className="fixed inset-x-4 bottom-4 z-40 rounded-xl bg-primary py-3.5 text-center text-sm font-bold text-primary-foreground shadow-2xl transition-transform active:scale-[0.98] sm:hidden"
    >
      {config.label || 'Order Now'}
    </button>
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
