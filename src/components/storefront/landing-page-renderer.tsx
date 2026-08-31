import type { LandingPageSection, Office } from '@prisma/client';
import { AnnouncementBar } from '@/components/storefront/sections/announcement-bar';
import { Hero } from '@/components/storefront/sections/hero';
import { TrustBadges } from '@/components/storefront/sections/trust-badges';
import { Problem } from '@/components/storefront/sections/problem';
import { Formula } from '@/components/storefront/sections/formula';
import { HowItWorks } from '@/components/storefront/sections/how-it-works';
import { Benefits } from '@/components/storefront/sections/benefits';
import { Comparison } from '@/components/storefront/sections/comparison';
import { Testimonials } from '@/components/storefront/sections/testimonials';
import { Guarantee } from '@/components/storefront/sections/guarantee';
import { Faq } from '@/components/storefront/sections/faq';
import { Footer } from '@/components/storefront/sections/footer';
import { OrderSection } from '@/components/storefront/sections/order';
import type {
  AnnouncementBarData,
  HeroData,
  TrustBadgesData,
  ProblemData,
  FormulaData,
  HowItWorksData,
  BenefitsData,
  ComparisonData,
  TestimonialsData,
  GuaranteeData,
  FaqData,
  FooterData,
  OrderData,
} from '@/types/landing-sections';

export async function LandingPageRenderer({
  sections,
  productId,
  landingPageId,
  office,
}: {
  sections: LandingPageSection[];
  productId: string;
  landingPageId: string;
  office: Office;
}) {
  return (
    <>
      {sections
        .filter((s) => s.isEnabled)
        .map((section) => {
          switch (section.type) {
            case 'ANNOUNCEMENT_BAR':
              return <AnnouncementBar key={section.id} data={section.data as unknown as AnnouncementBarData} />;
            case 'HERO':
              return <Hero key={section.id} data={section.data as unknown as HeroData} />;
            case 'TRUST_BADGES':
              return <TrustBadges key={section.id} data={section.data as unknown as TrustBadgesData} />;
            case 'PROBLEM':
              return <Problem key={section.id} data={section.data as unknown as ProblemData} />;
            case 'FORMULA':
              return <Formula key={section.id} data={section.data as unknown as FormulaData} />;
            case 'HOW_IT_WORKS':
              return <HowItWorks key={section.id} data={section.data as unknown as HowItWorksData} />;
            case 'BENEFITS':
              return <Benefits key={section.id} data={section.data as unknown as BenefitsData} />;
            case 'COMPARISON':
              return <Comparison key={section.id} data={section.data as unknown as ComparisonData} />;
            case 'TESTIMONIALS':
              return <Testimonials key={section.id} data={section.data as unknown as TestimonialsData} />;
            case 'GUARANTEE':
              return <Guarantee key={section.id} data={section.data as unknown as GuaranteeData} />;
            case 'FAQ':
              return <Faq key={section.id} data={section.data as unknown as FaqData} />;
            case 'ORDER':
              return (
                <OrderSection
                  key={section.id}
                  data={section.data as unknown as OrderData}
                  productId={productId}
                  officeId={office.id}
                  landingPageId={landingPageId}
                />
              );
            case 'FOOTER':
              return (
                <Footer
                  key={section.id}
                  data={section.data as unknown as FooterData}
                  whatsappNumber={office.whatsappNumber}
                  whatsappCtaText={office.whatsappCtaText}
                />
              );
            default:
              return null;
          }
        })}
    </>
  );
}
