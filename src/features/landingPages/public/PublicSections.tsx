import { Check, ChevronDown, Image as ImageIcon, ShieldCheck, Star, X } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type {
  BenefitsConfig,
  ComparisonConfig,
  CtaBannerConfig,
  FaqConfig,
  GuaranteeConfig,
  HeroConfig,
  HowItWorksConfig,
  ImageTextConfig,
  IngredientsConfig,
  ProblemAwarenessConfig,
  TestimonialsConfig,
  TextConfig,
  TrustStripConfig,
} from '@/features/landingPages/sectionTypes'
import { scrollToOrderArea } from '@/features/landingPages/public/scroll'
import { cn } from '@/lib/utils'

const SECTION_PADDING = 'px-5 py-12 sm:px-8 sm:py-16'

/**
 * Dark, theme-tinted "apothecary" surface used for the sections that should
 * read as premium/high-contrast breaks in the page rhythm (hero, final CTA,
 * guarantee, ritual/formula blocks) — computed from the page's own
 * --primary theme color via color-mix so every template/brand gets a
 * thematically appropriate dark section for free, with zero hardcoded
 * product colors. Falls back gracefully wherever color-mix isn't supported
 * (background simply stays the browser default black).
 */
function darkSurfaceStyle(): React.CSSProperties {
  return {
    background: 'color-mix(in oklch, var(--primary) 32%, black)',
    color: 'color-mix(in oklch, white 92%, var(--primary))',
  } as React.CSSProperties
}

function Eyebrow({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'inverted' }) {
  return (
    <div
      className={cn(
        'mb-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em]',
        tone === 'inverted' ? 'text-white/70' : 'text-primary',
      )}
    >
      <span className={cn('h-px w-6', tone === 'inverted' ? 'bg-white/40' : 'bg-primary/50')} />
      {children}
    </div>
  )
}

function SectionCta({
  label,
  target,
  onCtaClick,
  variant = 'default',
  enabled = true,
}: {
  label?: string
  target?: string
  onCtaClick?: () => void
  variant?: 'default' | 'inverted'
  /** Lets an editor hide the button without clearing the label text — defaults to shown when omitted, so existing pages with no explicit value are unaffected. */
  enabled?: boolean
}) {
  if (!label || !enabled) return null
  return (
    <Button
      size="lg"
      variant={variant === 'inverted' ? 'secondary' : 'default'}
      className="w-full max-w-xs rounded-xl text-sm font-bold tracking-wide sm:w-auto sm:px-8"
      onClick={() => {
        onCtaClick?.()
        scrollToOrderArea(target)
      }}
    >
      {label}
    </Button>
  )
}

export function HeroSection({ config, onCtaClick }: { config: HeroConfig; onCtaClick?: () => void }) {
  const hasImage = !!config.imageUrl
  return (
    <section className={SECTION_PADDING} style={darkSurfaceStyle()}>
      <div
        className={cn(
          'mx-auto flex max-w-5xl flex-col items-center gap-8 text-center',
          hasImage && 'sm:flex-row sm:items-center sm:text-left',
        )}
      >
        <div className={cn('flex flex-col items-center gap-4', hasImage && 'sm:items-start sm:flex-1')}>
          {config.eyebrow && <Eyebrow tone="inverted">{config.eyebrow}</Eyebrow>}
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{config.headline || 'Your Headline Here'}</h1>
          {config.subheadline && <p className="max-w-lg text-base opacity-80 sm:text-lg">{config.subheadline}</p>}
          <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} variant="inverted" enabled={config.ctaEnabled} />
          {config.priceLabel && (
            <span className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-bold text-foreground shadow-sm">{config.priceLabel}</span>
          )}
        </div>
        {hasImage && (
          <div className="w-full max-w-md shrink-0 sm:flex-1">
            <img src={config.imageUrl} alt="" className="w-full rounded-2xl border border-white/10 object-cover shadow-2xl" />
          </div>
        )}
      </div>
    </section>
  )
}

export function TrustStripSection({ config }: { config: TrustStripConfig }) {
  if (!config.items?.length) return null

  if (config.style === 'ticker') {
    const loop = [...config.items, ...config.items]
    return (
      <div className="overflow-hidden border-y border-border bg-secondary/40 py-2.5">
        <div className="animate-lp-ticker flex w-max items-center gap-8 whitespace-nowrap text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {loop.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-primary">✦</span>
              {item.icon && <span>{item.icon}</span>}
              {item.text}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <section className="border-y border-border bg-secondary/30 px-5 py-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-foreground">
        {config.items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {item.icon ? <span>{item.icon}</span> : <Check className="h-3.5 w-3.5 text-primary" />}
            {item.text}
          </span>
        ))}
      </div>
    </section>
  )
}

export function TextSection({ config, onCtaClick }: { config: TextConfig; onCtaClick?: () => void }) {
  if (!config.title && !config.body) return null
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        {config.eyebrow && <Eyebrow>{config.eyebrow}</Eyebrow>}
        {config.title && <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">{config.title}</h2>}
        {config.body && <p className="whitespace-pre-line text-muted-foreground">{config.body}</p>}
        <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
      </div>
    </section>
  )
}

export function ImageTextSection({ config, onCtaClick }: { config: ImageTextConfig; onCtaClick?: () => void }) {
  if (config.layout === 'banner') {
    if (!config.imageUrl) return null
    return (
      <section className="px-5 py-6 sm:px-8">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl">
          <img src={config.imageUrl} alt={config.title ?? ''} className="w-full object-cover" />
          {(config.title || config.ctaLabel) && (
            <div className="flex flex-col items-center gap-3 bg-black/60 p-5 text-center text-white">
              {config.title && <p className="text-lg font-bold">{config.title}</p>}
              <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} variant="inverted" enabled={config.ctaEnabled} />
            </div>
          )}
        </div>
      </section>
    )
  }

  const reversed = config.imagePosition === 'right'
  return (
    <section className={SECTION_PADDING}>
      <div className={cn('mx-auto flex max-w-4xl flex-col items-center gap-8 sm:flex-row', reversed && 'sm:flex-row-reverse')}>
        {config.imageUrl && <img src={config.imageUrl} alt="" className="w-full max-w-sm shrink-0 rounded-2xl border border-border object-cover shadow-sm sm:w-1/2" />}
        <div className="text-center sm:text-left">
          {config.eyebrow && (
            <div className="mb-2 flex justify-center sm:justify-start">
              <Eyebrow>{config.eyebrow}</Eyebrow>
            </div>
          )}
          {config.title && <h2 className="mb-3 text-2xl font-extrabold text-foreground sm:text-3xl">{config.title}</h2>}
          {config.body && <p className="whitespace-pre-line text-muted-foreground">{config.body}</p>}
          {config.ctaLabel && config.ctaEnabled !== false && (
            <div className="mt-4 flex justify-center sm:justify-start">
              <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function BenefitsSection({ config, onCtaClick }: { config: BenefitsConfig; onCtaClick?: () => void }) {
  if (!config.items?.length) return null
  const isWarning = config.tone === 'warning'
  const isPhoto = config.layout === 'photo'
  return (
    <section className={cn(SECTION_PADDING, isWarning && 'bg-secondary/20')}>
      <div className="mx-auto max-w-4xl">
        {config.eyebrow && <Eyebrow>{config.eyebrow}</Eyebrow>}
        {config.title && <h2 className="mb-8 text-center text-2xl font-extrabold text-foreground sm:text-3xl">{config.title}</h2>}
        <div className={cn('grid grid-cols-1 gap-4', isPhoto ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-2')}>
          {config.items.map((item, i) =>
            isPhoto ? (
              <div key={i} className="flex flex-col items-center gap-2 text-center">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="aspect-square w-full rounded-xl object-cover shadow-sm" />
                ) : (
                  <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-secondary/20 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-[10px] font-medium uppercase tracking-wide">Add Photo</span>
                  </div>
                )}
                <p className="text-xs font-semibold text-foreground sm:text-sm">{item.title}</p>
              </div>
            ) : (
              <Card
                key={i}
                className={cn(
                  'overflow-hidden p-5 transition-shadow hover:shadow-md',
                  isWarning ? 'border-l-4 border-l-destructive/60' : 'border-l-4 border-l-primary',
                )}
              >
                {item.imageUrl && <img src={item.imageUrl} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" />}
                <div className="flex items-start gap-3">
                  {item.icon && (
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg',
                        isWarning ? 'bg-destructive/10' : 'bg-primary/10',
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <div>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
        {config.ctaLabel && config.ctaEnabled !== false && (
          <div className="mt-8 flex justify-center">
            <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
          </div>
        )}
      </div>
    </section>
  )
}

export function HowItWorksSection({ config, onCtaClick }: { config: HowItWorksConfig; onCtaClick?: () => void }) {
  if (!config.steps?.length) return null
  const hasStepEyebrows = config.steps.some((s) => s.eyebrow)
  const layout = config.layout ?? (hasStepEyebrows ? 'timeline' : 'numbered')
  const cta = config.ctaLabel && config.ctaEnabled !== false ? (
    <div className="mt-8 flex justify-center">
      <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
    </div>
  ) : null

  if (layout === 'cards') {
    return (
      <section className={SECTION_PADDING}>
        <div className="mx-auto max-w-4xl">
          {config.eyebrow && <Eyebrow>{config.eyebrow}</Eyebrow>}
          {config.title && <h2 className="mb-8 text-center text-2xl font-extrabold text-foreground sm:text-3xl">{config.title}</h2>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {config.steps.map((step, i) => (
              <Card key={i} className="rounded-2xl border-t-4 border-t-primary p-5">
                <p className="font-serif text-lg italic text-primary">{toRoman(i + 1)}</p>
                <p className="mt-3 font-semibold text-foreground">{step.title}</p>
                {step.description && <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>}
              </Card>
            ))}
          </div>
          {cta}
        </div>
      </section>
    )
  }

  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-2xl">
        {config.eyebrow && <Eyebrow>{config.eyebrow}</Eyebrow>}
        {config.title && <h2 className="mb-8 text-center text-2xl font-extrabold text-foreground sm:text-3xl">{config.title}</h2>}
        <div className={cn('flex flex-col', layout === 'timeline' ? 'gap-0 border-l-2 border-primary/30 pl-6' : 'gap-5')}>
          {config.steps.map((step, i) => (
            <div key={i} className={cn('relative flex gap-4', layout === 'timeline' && 'pb-8 last:pb-0')}>
              {layout === 'timeline' ? (
                <span className="absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
              )}
              <div>
                {step.eyebrow && <p className="text-xs font-bold uppercase tracking-widest text-primary">{step.eyebrow}</p>}
                <p className="font-semibold text-foreground">{step.title}</p>
                {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
              </div>
            </div>
          ))}
        </div>
        {cta}
      </div>
    </section>
  )
}

export function TestimonialsSection({ config, onCtaClick }: { config: TestimonialsConfig; onCtaClick?: () => void }) {
  if (!config.items?.length) return null
  return (
    <section className={cn(SECTION_PADDING, 'bg-secondary/20')}>
      <div className="mx-auto max-w-4xl">
        <Eyebrow>What Buyers Are Saying</Eyebrow>
        {config.title && <h2 className="mb-6 text-center text-2xl font-extrabold text-foreground sm:text-3xl">{config.title}</h2>}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {config.items.map((item, i) => (
            <Card key={i} className="p-5">
              {!!item.rating && (
                <div className="mb-2 flex gap-0.5 text-warning">
                  {Array.from({ length: item.rating }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" />
                  ))}
                </div>
              )}
              <p className="text-sm italic text-foreground">&ldquo;{item.quote}&rdquo;</p>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {item.name}
                  {item.location ? `, ${item.location}` : ''}
                </p>
                {item.verified && (
                  <Badge variant="success" className="shrink-0">
                    <Check className="h-3 w-3" /> Verified
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
        {config.ctaLabel && config.ctaEnabled !== false && (
          <div className="mt-8 flex justify-center">
            <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
          </div>
        )}
      </div>
    </section>
  )
}

export function FaqSection({ config, onCtaClick }: { config: FaqConfig; onCtaClick?: () => void }) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0)
  if (!config.items?.length) return null
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-2xl">
        <Eyebrow>Questions</Eyebrow>
        <h2 className="mb-6 text-center text-2xl font-extrabold text-foreground sm:text-3xl">{config.title || 'Frequently Asked'}</h2>
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {config.items.map((item, i) => {
            const open = openIndex === i
            return (
              <div key={i} className="bg-card">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left font-semibold text-foreground"
                >
                  {item.question}
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                </button>
                {open && <p className="px-4 pb-4 text-sm text-muted-foreground">{item.answer}</p>}
              </div>
            )
          })}
        </div>
        {config.ctaLabel && config.ctaEnabled !== false && (
          <div className="mt-8 flex justify-center">
            <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
          </div>
        )}
      </div>
    </section>
  )
}

export function ProblemAwarenessSection({ config, onCtaClick }: { config: ProblemAwarenessConfig; onCtaClick?: () => void }) {
  if (!config.headline && !config.body) return null
  return (
    <section className={cn(SECTION_PADDING, 'bg-secondary/20 text-center')}>
      <div className="mx-auto max-w-2xl">
        {config.headline && <h2 className="mb-3 text-2xl font-extrabold text-foreground sm:text-3xl">{config.headline}</h2>}
        {config.body && <p className="whitespace-pre-line text-muted-foreground">{config.body}</p>}
        {config.ctaLabel && config.ctaEnabled !== false && (
          <div className="mt-4 flex justify-center">
            <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
          </div>
        )}
      </div>
    </section>
  )
}

export function IngredientsSection({ config, onCtaClick }: { config: IngredientsConfig; onCtaClick?: () => void }) {
  if (!config.items?.length) return null
  return (
    <section className={SECTION_PADDING} style={darkSurfaceStyle()}>
      <div className="mx-auto max-w-4xl">
        <Eyebrow tone="inverted">The Formula</Eyebrow>
        {config.headline && <h2 className="mb-8 text-center text-2xl font-extrabold sm:text-3xl">{config.headline}</h2>}
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-nowrap sm:justify-center">
          {config.items.map((item, i) => (
            <div key={i} className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-4 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/40 font-serif text-sm italic">
                {toRoman(i + 1)}
              </span>
              <p className="text-sm font-bold">{item.name}</p>
              {item.description && <p className="text-xs opacity-75">{item.description}</p>}
            </div>
          ))}
        </div>
        {config.ctaLabel && config.ctaEnabled !== false && (
          <div className="mt-8 flex justify-center">
            <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} variant="inverted" enabled={config.ctaEnabled} />
          </div>
        )}
      </div>
    </section>
  )
}

function toRoman(n: number): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
  return numerals[n - 1] ?? String(n)
}

export function ComparisonSection({ config, onCtaClick }: { config: ComparisonConfig; onCtaClick?: () => void }) {
  if (!config.rows?.length) return null
  return (
    <section className={SECTION_PADDING}>
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Why It&apos;s Different</Eyebrow>
        {config.headline && <h2 className="mb-8 text-center text-2xl font-extrabold text-foreground sm:text-3xl">{config.headline}</h2>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-2 border-primary/40 bg-primary/5 p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">This Blend</p>
            <ul className="flex flex-col gap-3">
              {config.rows.map((row, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {row.us}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="bg-secondary/30 p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Typical Products</p>
            <ul className="flex flex-col gap-3">
              {config.rows.map((row, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  {row.them}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        {config.ctaLabel && config.ctaEnabled !== false && (
          <div className="mt-8 flex justify-center">
            <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} enabled={config.ctaEnabled} />
          </div>
        )}
      </div>
    </section>
  )
}

export function GuaranteeSection({ config, onCtaClick }: { config: GuaranteeConfig; onCtaClick?: () => void }) {
  if (!config.headline && !config.body) return null
  return (
    <section className={cn(SECTION_PADDING, 'text-center')} style={darkSurfaceStyle()}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <ShieldCheck className="h-9 w-9" />
        {config.headline && <h2 className="text-xl font-extrabold sm:text-2xl">{config.headline}</h2>}
        {config.body && <p className="text-sm opacity-80">{config.body}</p>}
        {config.ctaLabel && config.ctaEnabled !== false && (
          <SectionCta label={config.ctaLabel} target={config.ctaTarget} onCtaClick={onCtaClick} variant="inverted" enabled={config.ctaEnabled} />
        )}
      </div>
    </section>
  )
}

export function CtaBannerSection({ config, onCtaClick }: { config: CtaBannerConfig; onCtaClick?: () => void }) {
  if (config.style === 'urgency') {
    return (
      <div className="px-5 py-2.5 text-center text-xs font-bold uppercase tracking-wide" style={darkSurfaceStyle()}>
        <button
          type="button"
          onClick={() => {
            onCtaClick?.()
            scrollToOrderArea(config.ctaTarget)
          }}
          className="underline-offset-2 hover:underline"
        >
          {config.headline ? `${config.headline} — ${config.buttonLabel}` : config.buttonLabel}
        </button>
      </div>
    )
  }
  return (
    <section className={cn(SECTION_PADDING, 'bg-primary/10 text-center')}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
        {config.headline && <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">{config.headline}</h2>}
        <SectionCta label={config.buttonLabel || 'Order Now'} target={config.ctaTarget} onCtaClick={onCtaClick} />
      </div>
    </section>
  )
}

/** Closing band for the public page/thank-you page — uses only the page's own name/description (already fetched, nothing fabricated) so every landing page gets a real footer with zero extra config. */
export function PublicFooter({ pageName, tagline }: { pageName: string; tagline?: string | null }) {
  return (
    <footer className="px-5 py-8 text-center sm:px-8" style={darkSurfaceStyle()}>
      <p className="text-sm font-semibold">
        {pageName}
        {tagline ? <span className="font-normal opacity-70"> — {tagline}</span> : null}
      </p>
      <p className="mt-2 text-xs opacity-60">© {new Date().getFullYear()} {pageName}. All rights reserved.</p>
    </footer>
  )
}
