import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { resolveStorefrontOffice } from "@/lib/office-context";
import { getOrderPricing } from "@/lib/pricing";
import { TrackingScripts } from "@/components/storefront/TrackingScripts";
import { OrderExperience } from "@/components/storefront/OrderExperience";
import {
  AnnouncementBar, Hero, TrustBadges, Problem, Formula, HowItWorks,
  Benefits, Comparison, Guarantee, Testimonials, Faq, Footer, CustomHtml,
} from "@/components/sections/PublicSections";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await prisma.landingPage.findUnique({ where: { slug } });
  if (!page) return {};
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? undefined,
    openGraph: page.ogImageUrl ? { images: [page.ogImageUrl] } : undefined,
  };
}

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ office?: string }>;
}) {
  const { slug } = await params;
  const { office: officeParam } = await searchParams;

  const page = await prisma.landingPage.findUnique({
    where: { slug },
    include: {
      product: true,
      sections: { where: { isEnabled: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (!page || page.status !== "PUBLISHED") notFound();

  const office = await resolveStorefrontOffice(officeParam, page.officeId);
  if (!office) notFound();

  const [divisions, offers] = await Promise.all([
    prisma.locationDivision.findMany({
      where: { officeId: office.id },
      include: { cities: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.offer.findMany({
      where: { productId: page.productId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const now = new Date();
  const activeOffers = offers.filter((o) => (!o.startsAt || o.startsAt <= now) && (!o.endsAt || o.endsAt >= now));

  const offersWithPricing = await Promise.all(
    activeOffers.map(async (offer) => {
      try {
        const pricing = await getOrderPricing({ productId: page.productId, officeId: office.id, offerId: offer.id });
        return {
          id: offer.id,
          title: offer.title,
          subtitle: offer.subtitle,
          badge: offer.badge,
          isDefault: offer.isDefault,
          pricing: {
            subtotal: pricing.subtotal,
            compareAtSubtotal: pricing.compareAtSubtotal,
            total: pricing.total,
            shipping: pricing.shipping,
            savingsPercent: pricing.savingsPercent,
            totalQuantity: pricing.totalQuantity,
            paidQuantity: pricing.paidQuantity,
            freeQuantity: pricing.freeQuantity,
          },
        };
      } catch {
        return null;
      }
    }),
  );
  const availableOffers = offersWithPricing.filter((o): o is NonNullable<typeof o> => o !== null);

  const currencyFormat = {
    currencySymbol: office.currencySymbol,
    symbolPosition: office.symbolPosition,
    decimalDigits: office.decimalDigits,
    thousandSeparator: office.thousandSeparator,
    decimalSeparator: office.decimalSeparator,
  };

  return (
    <>
      <TrackingScripts officeId={office.id} />
      {page.sections.map((section) => {
        const content = (section.content as Record<string, unknown>) ?? {};
        switch (section.type) {
          case "ANNOUNCEMENT_BAR":
            return <AnnouncementBar key={section.id} content={content} />;
          case "HERO":
            return <Hero key={section.id} content={content} />;
          case "TRUST_BADGES":
            return <TrustBadges key={section.id} content={content} />;
          case "PROBLEM":
            return <Problem key={section.id} content={content} />;
          case "FORMULA":
            return <Formula key={section.id} content={content} />;
          case "HOW_IT_WORKS":
            return <HowItWorks key={section.id} content={content} />;
          case "BENEFITS":
            return <Benefits key={section.id} content={content} />;
          case "COMPARISON":
            return <Comparison key={section.id} content={content} />;
          case "GUARANTEE":
            return <Guarantee key={section.id} content={content} />;
          case "TESTIMONIALS":
            return <Testimonials key={section.id} content={content} />;
          case "FAQ":
            return <Faq key={section.id} content={content} />;
          case "FOOTER":
            return <Footer key={section.id} content={content} />;
          case "CUSTOM_HTML":
            return <CustomHtml key={section.id} content={content} />;
          case "ORDER":
            return availableOffers.length > 0 ? (
              <OrderExperience
                key={section.id}
                title={(content.title as string) || "Select your package"}
                productId={page.productId}
                officeId={office.id}
                offers={availableOffers}
                currencyFormat={currencyFormat}
                divisionLabel={office.divisionLabel}
                phoneCountryCode={office.phoneCountryCode}
                phoneRegex={office.phoneRegex}
                divisions={divisions.map((d) => ({ id: d.id, name: d.name, cities: d.cities.map((c) => ({ id: c.id, name: c.name })) }))}
                landingPageSlug={page.slug}
                stickyCtaTemplate={page.stickyCtaText}
              />
            ) : null;
          default:
            return null;
        }
      })}
    </>
  );
}
