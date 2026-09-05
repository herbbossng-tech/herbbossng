import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { fetchLandingPageBySlug, fetchPublicLandingPagePackages, fetchPublicLandingPageSections, trackLandingPageEvent } from '@/features/landingPages/api'
import { CodOrderForm } from '@/features/landingPages/public/CodOrderForm'
import { FloatingOrderCta, WhatsappCta } from '@/features/landingPages/public/FloatingCtas'
import { PackageSelectorSection } from '@/features/landingPages/public/PackageSelectorSection'
import {
  BenefitsSection,
  ComparisonSection,
  CtaBannerSection,
  FaqSection,
  GuaranteeSection,
  HeroSection,
  HowItWorksSection,
  ImageTextSection,
  IngredientsSection,
  ProblemAwarenessSection,
  TestimonialsSection,
  TextSection,
  TrustStripSection,
} from '@/features/landingPages/public/PublicSections'
import { getSessionId } from '@/features/landingPages/public/scroll'
import { firePixelOrderCreated, firePixelPageView, firePixelSelectPackage, firePixelViewContent, initTrackingRuntime } from '@/features/landingPages/public/tracking'
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
  OrderFormConfig,
  PackageSelectorConfig,
  ProblemAwarenessConfig,
  TestimonialsConfig,
  TextConfig,
  TrustStripConfig,
} from '@/features/landingPages/sectionTypes'
import type { LandingPageSection, Order } from '@/types/database'

export function PublicLandingPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [selectedPackageId, setSelectedPackageId] = React.useState<string | null>(null)

  const {
    data: page,
    isLoading: pageLoading,
    isError: pageError,
  } = useQuery({
    queryKey: ['public-landing-page', slug],
    queryFn: () => fetchLandingPageBySlug(slug as string),
    enabled: Boolean(slug),
    retry: false,
  })

  const { data: sections } = useQuery({
    queryKey: ['public-landing-page-sections', page?.id],
    queryFn: () => fetchPublicLandingPageSections(page!.id),
    enabled: Boolean(page?.id),
  })

  const { data: packages } = useQuery({
    queryKey: ['public-landing-page-packages', page?.id],
    queryFn: () => fetchPublicLandingPagePackages(page!.id),
    enabled: Boolean(page?.id),
  })

  React.useEffect(() => {
    if (page) {
      document.title = page.seo_config?.metaTitle || page.title || page.name
      trackLandingPageEvent(page.slug, 'page_view', getSessionId())
      initTrackingRuntime(page.slug).then(() => firePixelPageView())
    }
  }, [page])

  React.useEffect(() => {
    if (packages && packages.length > 0 && !selectedPackageId) {
      const preferred = packages.find((p) => p.is_default) ?? packages[0]
      setSelectedPackageId(preferred.id)
      firePixelViewContent({ productName: page?.name, currency: page?.market_currency_code, value: preferred.price })
    }
  }, [packages, selectedPackageId, page])

  function handleSelectPackage(packageId: string) {
    setSelectedPackageId(packageId)
    if (page) {
      trackLandingPageEvent(page.slug, 'package_selected', getSessionId(), { package_id: packageId })
      const pkg = (packages ?? []).find((p) => p.id === packageId)
      firePixelSelectPackage({ packageName: pkg?.name, currency: page.market_currency_code, value: pkg?.price })
    }
  }

  function handleOrderCreated(order: Order) {
    if (page) {
      trackLandingPageEvent(page.slug, 'thank_you_view', getSessionId())
      firePixelOrderCreated({ orderId: order.id, currency: order.currency_code, value: order.total_amount })
    }
    navigate(`/l/${slug}/thank-you`, { state: { order, packageName: selectedPackage?.name } })
  }

  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (pageError || !page) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center text-foreground">
        <p className="text-xl font-bold">This page isn&apos;t available</p>
        <p className="text-sm text-muted-foreground">It may have been unpublished or the link may be incorrect.</p>
      </div>
    )
  }

  const selectedPackage = (packages ?? []).find((p) => p.id === selectedPackageId) ?? null
  const orderedSections = [...(sections ?? [])].sort((a, b) => a.position - b.position)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {orderedSections.map((section) => (
        <RenderSection
          key={section.id}
          section={section}
          packages={packages ?? []}
          currencyCode={page.market_currency_code}
          selectedPackageId={selectedPackageId}
          onSelectPackage={handleSelectPackage}
          onCtaClick={() => trackLandingPageEvent(page.slug, 'cta_click', getSessionId())}
          renderOrderForm={(cfg) => (
            <CodOrderForm
              slug={page.slug}
              sectionConfig={cfg}
              formConfig={page.form_config}
              orderSummaryEnabled={page.order_summary_enabled}
              countryCode={page.market_country_code}
              currencyCode={page.market_currency_code}
              selectedPackage={selectedPackage}
              onOrderCreated={handleOrderCreated}
            />
          )}
        />
      ))}

      <FloatingOrderCta config={page.floating_cta_config} />
      <WhatsappCta config={page.whatsapp_config} />
    </div>
  )
}

function RenderSection({
  section,
  packages,
  currencyCode,
  selectedPackageId,
  onSelectPackage,
  onCtaClick,
  renderOrderForm,
}: {
  section: LandingPageSection
  packages: import('@/types/database').LandingPagePackage[]
  currencyCode: string | null
  selectedPackageId: string | null
  onSelectPackage: (id: string) => void
  onCtaClick: () => void
  renderOrderForm: (config: OrderFormConfig) => React.ReactNode
}) {
  const config = section.config as Record<string, unknown>
  switch (section.type) {
    case 'HERO':
      return <HeroSection config={config as unknown as HeroConfig} onCtaClick={onCtaClick} />
    case 'TRUST_STRIP':
      return <TrustStripSection config={config as unknown as TrustStripConfig} />
    case 'TEXT':
      return <TextSection config={config as unknown as TextConfig} />
    case 'IMAGE_TEXT':
      return <ImageTextSection config={config as unknown as ImageTextConfig} />
    case 'BENEFITS':
      return <BenefitsSection config={config as unknown as BenefitsConfig} />
    case 'HOW_IT_WORKS':
      return <HowItWorksSection config={config as unknown as HowItWorksConfig} />
    case 'TESTIMONIALS':
      return <TestimonialsSection config={config as unknown as TestimonialsConfig} />
    case 'FAQ':
      return <FaqSection config={config as unknown as FaqConfig} />
    case 'CTA_BANNER':
      return <CtaBannerSection config={config as unknown as CtaBannerConfig} onCtaClick={onCtaClick} />
    case 'PACKAGE_SELECTOR':
      return (
        <PackageSelectorSection
          config={config as unknown as PackageSelectorConfig}
          packages={packages}
          currencyCode={currencyCode}
          selectedPackageId={selectedPackageId}
          onSelect={onSelectPackage}
        />
      )
    case 'ORDER_FORM':
      return <>{renderOrderForm(config as unknown as OrderFormConfig)}</>
    case 'PROBLEM_AWARENESS':
      return <ProblemAwarenessSection config={config as unknown as ProblemAwarenessConfig} />
    case 'INGREDIENTS':
      return <IngredientsSection config={config as unknown as IngredientsConfig} />
    case 'COMPARISON':
      return <ComparisonSection config={config as unknown as ComparisonConfig} />
    case 'GUARANTEE':
      return <GuaranteeSection config={config as unknown as GuaranteeConfig} />
    default:
      return null
  }
}
