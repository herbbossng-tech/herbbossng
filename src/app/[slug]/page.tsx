import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { LandingPageRenderer } from '@/components/storefront/landing-page-renderer';
import { TrackingScripts } from '@/components/storefront/tracking-scripts';

async function resolveOffice(officeParam?: string) {
  if (officeParam) {
    const office = await db.office.findUnique({ where: { countryCode: officeParam.toUpperCase() } });
    if (office && office.isActive) return office;
  }
  return db.office.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
}

async function getLandingPage(slug: string, officeId: string) {
  return (
    (await db.landingPage.findFirst({ where: { slug, officeId, status: 'PUBLISHED' } })) ??
    (await db.landingPage.findFirst({ where: { slug, officeId: null, status: 'PUBLISHED' } }))
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { office?: string };
}): Promise<Metadata> {
  const office = await resolveOffice(searchParams.office);
  if (!office) return {};
  const page = await getLandingPage(params.slug, office.id);
  if (!page) return {};
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? undefined,
    openGraph: {
      title: page.seoTitle ?? page.title,
      description: page.seoDescription ?? undefined,
      images: page.ogImageUrl ? [page.ogImageUrl] : undefined,
    },
  };
}

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { office?: string };
}) {
  const office = await resolveOffice(searchParams.office);
  if (!office) notFound();

  const page = await getLandingPage(params.slug, office.id);
  if (!page) notFound();

  const [sections, tracking] = await Promise.all([
    db.landingPageSection.findMany({ where: { landingPageId: page.id }, orderBy: { sortOrder: 'asc' } }),
    db.trackingSetting.findUnique({ where: { officeId: office.id } }),
  ]);

  await db.analyticsEvent.createMany({
    data: [
      { officeId: office.id, sessionId: 'server', eventType: 'page_view', landingPageId: page.id, productId: page.productId },
      { officeId: office.id, sessionId: 'server', eventType: 'view_content', landingPageId: page.id, productId: page.productId },
    ],
  });

  return (
    <main>
      {tracking?.isActive && (
        <TrackingScripts
          metaPixelId={tracking.metaPixelId}
          ga4MeasurementId={tracking.ga4MeasurementId}
          contentName={page.title}
        />
      )}
      <LandingPageRenderer sections={sections} productId={page.productId} landingPageId={page.id} office={office} />
    </main>
  );
}
