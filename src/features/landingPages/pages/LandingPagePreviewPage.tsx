import { AlertTriangle, ChevronLeft } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { useLandingPage, useLandingPagePackages, useLandingPageSections } from '@/features/landingPages/hooks'
import { PackageSelectorSection } from '@/features/landingPages/public/PackageSelectorSection'
import {
  BenefitsSection,
  CtaBannerSection,
  FaqSection,
  HeroSection,
  HowItWorksSection,
  ImageTextSection,
  TestimonialsSection,
  TextSection,
  TrustStripSection,
} from '@/features/landingPages/public/PublicSections'
import type {
  BenefitsConfig,
  CtaBannerConfig,
  FaqConfig,
  HeroConfig,
  HowItWorksConfig,
  ImageTextConfig,
  OrderFormConfig,
  PackageSelectorConfig,
  TestimonialsConfig,
  TextConfig,
  TrustStripConfig,
} from '@/features/landingPages/sectionTypes'
import { formatCurrency } from '@/lib/currency'

export function LandingPagePreviewPage() {
  const { id } = useParams<{ id: string }>()
  const { data: page, isLoading, isError, refetch } = useLandingPage(id)
  const { data: sections } = useLandingPageSections(id)
  const { data: packages } = useLandingPagePackages(id)
  const [selectedPackageId, setSelectedPackageId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (packages && packages.length > 0 && !selectedPackageId) {
      setSelectedPackageId((packages.find((p) => p.is_default) ?? packages[0]).id)
    }
  }, [packages, selectedPackageId])

  if (isLoading) return <LoadingState label="Loading preview…" />
  if (isError || !page) return <ErrorState message="We couldn't load this landing page." onRetry={() => refetch()} />

  const selectedPackage = (packages ?? []).find((p) => p.id === selectedPackageId) ?? null
  const orderedSections = [...(sections ?? [])].sort((a, b) => a.position - b.position)

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/15 px-5 py-2.5 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="font-medium">Preview Mode</span>
          <span className="text-muted-foreground">— orders are disabled. Disabled sections/packages are still shown here, dimmed.</span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/landing-pages/${id}/edit`}>
            <ChevronLeft className="h-4 w-4" />
            Back to editor
          </Link>
        </Button>
      </div>

      <div className="text-foreground">
        {orderedSections.map((section) => {
          const config = section.config as Record<string, unknown>
          const wrapperClass = section.enabled ? undefined : 'opacity-40'
          switch (section.type) {
            case 'HERO':
              return (
                <div key={section.id} className={wrapperClass}>
                  <HeroSection config={config as unknown as HeroConfig} />
                </div>
              )
            case 'TRUST_STRIP':
              return (
                <div key={section.id} className={wrapperClass}>
                  <TrustStripSection config={config as unknown as TrustStripConfig} />
                </div>
              )
            case 'TEXT':
              return (
                <div key={section.id} className={wrapperClass}>
                  <TextSection config={config as unknown as TextConfig} />
                </div>
              )
            case 'IMAGE_TEXT':
              return (
                <div key={section.id} className={wrapperClass}>
                  <ImageTextSection config={config as unknown as ImageTextConfig} />
                </div>
              )
            case 'BENEFITS':
              return (
                <div key={section.id} className={wrapperClass}>
                  <BenefitsSection config={config as unknown as BenefitsConfig} />
                </div>
              )
            case 'HOW_IT_WORKS':
              return (
                <div key={section.id} className={wrapperClass}>
                  <HowItWorksSection config={config as unknown as HowItWorksConfig} />
                </div>
              )
            case 'TESTIMONIALS':
              return (
                <div key={section.id} className={wrapperClass}>
                  <TestimonialsSection config={config as unknown as TestimonialsConfig} />
                </div>
              )
            case 'FAQ':
              return (
                <div key={section.id} className={wrapperClass}>
                  <FaqSection config={config as unknown as FaqConfig} />
                </div>
              )
            case 'CTA_BANNER':
              return (
                <div key={section.id} className={wrapperClass}>
                  <CtaBannerSection config={config as unknown as CtaBannerConfig} />
                </div>
              )
            case 'PACKAGE_SELECTOR':
              return (
                <div key={section.id} className={wrapperClass}>
                  <PackageSelectorSection
                    config={config as unknown as PackageSelectorConfig}
                    packages={packages ?? []}
                    currencyCode={page.market_currency_code}
                    selectedPackageId={selectedPackageId}
                    onSelect={setSelectedPackageId}
                  />
                </div>
              )
            case 'ORDER_FORM':
              return (
                <div key={section.id} className={wrapperClass}>
                  <PreviewOrderForm
                    sectionConfig={config as unknown as OrderFormConfig}
                    selectedPackagePrice={selectedPackage?.price ?? null}
                    currencyCode={page.market_currency_code}
                  />
                </div>
              )
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}

function PreviewOrderForm({
  sectionConfig,
  selectedPackagePrice,
  currencyCode,
}: {
  sectionConfig: OrderFormConfig
  selectedPackagePrice: number | null
  currencyCode: string | null
}) {
  return (
    <section className="px-5 py-10 sm:px-8 sm:py-14">
      <Card className="mx-auto max-w-lg p-5 sm:p-6">
        {sectionConfig.title && <h2 className="mb-4 text-xl font-bold text-foreground">{sectionConfig.title}</h2>}
        <div className="flex flex-col gap-3 opacity-60">
          <div className="flex flex-col gap-1.5">
            <Label>Full name</Label>
            <Input disabled placeholder="Preview only" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Phone number</Label>
            <Input disabled placeholder="Preview only" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Delivery address</Label>
            <Textarea disabled rows={2} placeholder="Preview only" />
          </div>
        </div>
        <Button className="mt-4 w-full" disabled>
          {selectedPackagePrice !== null ? `Place Order — ${formatCurrency(selectedPackagePrice, currencyCode)}` : 'Select a package above'}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Preview mode — this form does not submit real orders.</p>
      </Card>
    </section>
  )
}
