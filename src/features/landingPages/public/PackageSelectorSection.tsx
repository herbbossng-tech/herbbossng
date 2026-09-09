import { Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { PackageSelectorConfig } from '@/features/landingPages/sectionTypes'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { LandingPagePackage } from '@/types/database'

interface PackageSelectorSectionProps {
  config: PackageSelectorConfig
  packages: LandingPagePackage[]
  currencyCode: string | null
  selectedPackageId: string | null
  onSelect: (packageId: string) => void
}

export function PackageSelectorSection({ config, packages, currencyCode, selectedPackageId, onSelect }: PackageSelectorSectionProps) {
  if (packages.length === 0) return null

  return (
    <section id="packages" className="px-5 pb-4 pt-12 sm:px-8 sm:pb-6 sm:pt-16">
      <div className="mx-auto max-w-2xl">
        {config.title && <h2 className="text-center text-2xl font-extrabold text-foreground sm:text-3xl">{config.title}</h2>}
        {config.subtitle && <p className="mt-1 text-center text-sm text-muted-foreground">{config.subtitle}</p>}
        <div className="mt-8 flex flex-col gap-4">
          {packages.map((pkg) => {
            const selected = pkg.id === selectedPackageId
            return (
              <Card
                key={pkg.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(pkg.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(pkg.id)}
                className={cn(
                  'relative flex cursor-pointer items-center justify-between gap-3 overflow-visible rounded-2xl p-4 transition-all',
                  selected ? 'border-2 border-primary shadow-md' : 'border border-border hover:border-primary/40',
                )}
              >
                {pkg.badge && (
                  <Badge className="absolute -top-3 right-4 rounded-full border-transparent bg-primary px-3 py-1 text-[11px] text-primary-foreground shadow-sm">
                    {pkg.badge}
                  </Badge>
                )}
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <div>
                    <p className="font-bold text-foreground">{pkg.name}</p>
                    {pkg.savings_text && (
                      <Badge variant="success" className="mt-1 rounded-full">
                        {pkg.savings_text}
                      </Badge>
                    )}
                    {pkg.offer_text && <p className="mt-1 text-xs text-muted-foreground">{pkg.offer_text}</p>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {pkg.compare_at_price && <p className="text-xs text-muted-foreground line-through">{formatCurrency(pkg.compare_at_price, currencyCode)}</p>}
                  <p className="text-lg font-extrabold text-foreground">{formatCurrency(pkg.price, currencyCode)}</p>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
