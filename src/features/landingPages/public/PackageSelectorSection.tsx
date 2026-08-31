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
    <section id="packages" className="px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {config.title && <h2 className="text-center text-2xl font-bold text-foreground">{config.title}</h2>}
        {config.subtitle && <p className="mt-1 text-center text-sm text-muted-foreground">{config.subtitle}</p>}
        <div className="mt-6 flex flex-col gap-3">
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
                  'flex cursor-pointer items-center justify-between gap-3 p-4 transition-colors',
                  selected ? 'border-primary bg-primary/10' : 'hover:border-primary/50',
                )}
              >
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
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{pkg.name}</p>
                      {pkg.badge && <Badge variant="warning">{pkg.badge}</Badge>}
                    </div>
                    {pkg.savings_text && <p className="text-xs text-success">{pkg.savings_text}</p>}
                    {pkg.offer_text && <p className="text-xs text-muted-foreground">{pkg.offer_text}</p>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-foreground">{formatCurrency(pkg.price, currencyCode)}</p>
                  {pkg.compare_at_price && <p className="text-xs text-muted-foreground line-through">{formatCurrency(pkg.compare_at_price, currencyCode)}</p>}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
