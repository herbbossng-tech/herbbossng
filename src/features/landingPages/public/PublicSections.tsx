import { Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type {
  BenefitsConfig,
  CtaBannerConfig,
  FaqConfig,
  HeroConfig,
  HowItWorksConfig,
  ImageTextConfig,
  TestimonialsConfig,
  TextConfig,
  TrustStripConfig,
} from '@/features/landingPages/sectionTypes'
import { scrollToOrderArea } from '@/features/landingPages/public/scroll'
import { cn } from '@/lib/utils'

const SECTION_PADDING = 'px-5 py-10 sm:px-8 sm:py-14'

export function HeroSection({ config, onCtaClick }: { config: HeroConfig; onCtaClick?: () => void }) {
  return (
    <section className={cn(SECTION_PADDING, 'text-center')}>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
        {config.imageUrl && (
          <img src={config.imageUrl} alt="" className="mb-2 w-full max-w-sm rounded-2xl border border-border object-cover" />
        )}
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{config.headline || 'Your Headline Here'}</h1>
        {config.subheadline && <p className="text-base text-muted-foreground sm:text-lg">{config.subheadline}</p>}
        {config.ctaLabel && (
          <Button
            size="lg"
            className="mt-2 w-full max-w-xs sm:w-auto"
            onClick={() => {
              onCtaClick?.()
              scrollToOrderArea()
            }}
          >
            {config.ctaLabel}
          </Button>
        )}
      </div>
    </section>
  )
}

export function TrustStripSection({ config }: { config: TrustStripConfig }) {
  if (!config.items?.length) return null
  return (
    <section className="border-y border-border bg-secondary/20 px-5 py-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {config.items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {item.icon && <span>{item.icon}</span>}
            {item.text}
          </span>
        ))}
      </div>
    </section>
  )
}

export function TextSection({ config }: { config: TextConfig }) {
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-2xl">
        {config.title && <h2 className="mb-3 text-2xl font-bold text-foreground">{config.title}</h2>}
        <p className="whitespace-pre-line text-muted-foreground">{config.body}</p>
      </div>
    </section>
  )
}

export function ImageTextSection({ config }: { config: ImageTextConfig }) {
  const reversed = config.imagePosition === 'right'
  return (
    <section className={SECTION_PADDING}>
      <div className={cn('mx-auto flex max-w-4xl flex-col items-center gap-6 sm:flex-row', reversed && 'sm:flex-row-reverse')}>
        {config.imageUrl && <img src={config.imageUrl} alt="" className="w-full max-w-sm shrink-0 rounded-2xl border border-border object-cover sm:w-1/2" />}
        <div>
          {config.title && <h2 className="mb-3 text-2xl font-bold text-foreground">{config.title}</h2>}
          <p className="whitespace-pre-line text-muted-foreground">{config.body}</p>
        </div>
      </div>
    </section>
  )
}

export function BenefitsSection({ config }: { config: BenefitsConfig }) {
  if (!config.items?.length) return null
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-4xl">
        {config.title && <h2 className="mb-6 text-center text-2xl font-bold text-foreground">{config.title}</h2>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {config.items.map((item, i) => (
            <Card key={i} className="p-4">
              {item.icon && <span className="text-2xl">{item.icon}</span>}
              <p className="mt-2 font-semibold text-foreground">{item.title}</p>
              {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HowItWorksSection({ config }: { config: HowItWorksConfig }) {
  if (!config.steps?.length) return null
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-3xl">
        {config.title && <h2 className="mb-6 text-center text-2xl font-bold text-foreground">{config.title}</h2>}
        <div className="flex flex-col gap-4">
          {config.steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">{i + 1}</span>
              <div>
                <p className="font-semibold text-foreground">{step.title}</p>
                {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function TestimonialsSection({ config }: { config: TestimonialsConfig }) {
  if (!config.items?.length) return null
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-4xl">
        {config.title && <h2 className="mb-6 text-center text-2xl font-bold text-foreground">{config.title}</h2>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {config.items.map((item, i) => (
            <Card key={i} className="p-4">
              {item.rating && (
                <div className="mb-2 flex gap-0.5 text-warning">
                  {Array.from({ length: item.rating }).map((_, s) => (
                    <Star key={s} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
              )}
              <p className="text-sm text-foreground">&ldquo;{item.quote}&rdquo;</p>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {item.name}
                {item.location ? ` · ${item.location}` : ''}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FaqSection({ config }: { config: FaqConfig }) {
  if (!config.items?.length) return null
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-2xl">
        {config.title && <h2 className="mb-6 text-center text-2xl font-bold text-foreground">{config.title}</h2>}
        <div className="flex flex-col gap-3">
          {config.items.map((item, i) => (
            <details key={i} className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer font-semibold text-foreground">{item.question}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaBannerSection({ config, onCtaClick }: { config: CtaBannerConfig; onCtaClick?: () => void }) {
  return (
    <section className={cn(SECTION_PADDING, 'bg-primary/10 text-center')}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
        <h2 className="text-2xl font-bold text-foreground">{config.headline}</h2>
        <Button
          size="lg"
          className="w-full max-w-xs sm:w-auto"
          onClick={() => {
            onCtaClick?.()
            scrollToOrderArea()
          }}
        >
          {config.buttonLabel || 'Order Now'}
        </Button>
      </div>
    </section>
  )
}
