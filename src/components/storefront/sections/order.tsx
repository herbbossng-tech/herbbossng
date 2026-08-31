import { db } from '@/lib/db';
import { quotePrice } from '@/lib/pricing';
import type { OrderData } from '@/types/landing-sections';
import { OrderSectionClient, type OfferQuote } from '@/components/storefront/order-section-client';

export async function OrderSection({
  data,
  productId,
  officeId,
  landingPageId,
}: {
  data: OrderData;
  productId: string;
  officeId: string;
  landingPageId?: string;
}) {
  const [office, product, offers, divisions] = await Promise.all([
    db.office.findUniqueOrThrow({ where: { id: officeId } }),
    db.product.findUniqueOrThrow({ where: { id: productId } }),
    db.offer.findMany({ where: { productId, isActive: true }, orderBy: { sortOrder: 'asc' } }),
    db.division.findMany({
      where: { officeId },
      orderBy: { name: 'asc' },
      include: { cities: { orderBy: { name: 'asc' }, include: { deliveryAreas: { orderBy: { name: 'asc' } } } } },
    }),
  ]);

  const quotes: OfferQuote[] = [];
  for (const offer of offers) {
    try {
      const q = await quotePrice({ productId, officeId, offerId: offer.id });
      quotes.push({
        offerId: offer.id,
        name: offer.name,
        subtitle: offer.subtitle,
        badgeText: offer.badgeText,
        badgeColor: offer.badgeColor,
        isDefault: offer.isDefault,
        totalQuantity: q.totalQuantity,
        quantityFree: q.quantityFree,
        subtotal: q.subtotal,
        compareAtSubtotal: q.compareAtSubtotal,
        savingsPercent: q.savingsPercent,
      });
    } catch {
      // Offer not available in this office (no OfferOffice/ProductOffice row) — skip silently.
    }
  }

  if (quotes.length === 0) {
    return (
      <section className="bg-white px-4 py-12 text-center text-sm text-brand-dark/50">
        This product is not currently available for {office.name}.
      </section>
    );
  }

  return (
    <OrderSectionClient
      productId={productId}
      productName={product.name}
      officeId={officeId}
      landingPageId={landingPageId}
      currency={{
        currencySymbol: office.currencySymbol,
        currencySymbolPosition: office.currencySymbolPosition,
        currencyDecimalPlaces: office.currencyDecimalPlaces,
        currencyThousandSep: office.currencyThousandSep,
        currencyDecimalSep: office.currencyDecimalSep,
      }}
      divisionLabel={office.divisionLabel}
      phoneCountryCode={office.phoneCountryCode}
      divisions={divisions.map((d) => ({
        id: d.id,
        name: d.name,
        cities: d.cities.map((c) => ({
          id: c.id,
          name: c.name,
          deliveryAreas: c.deliveryAreas.map((a) => ({ id: a.id, name: a.name, fee: a.fee ? Number(a.fee) : null })),
        })),
      }))}
      offers={quotes}
      title={data.title}
      subtitle={data.subtitle}
      showStickyCta={data.showStickyCta}
      stickyCtaLabel={data.stickyCtaLabel}
    />
  );
}
