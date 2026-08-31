import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { formatMoney } from '@/lib/currency';
import { PageHeader, Card, Badge, LinkButton, EmptyState } from '@/components/ui';

export default async function OffersPage({ searchParams }: { searchParams: { product?: string } }) {
  const office = await getActiveOffice();
  const offers = await db.offer.findMany({
    where: searchParams.product ? { productId: searchParams.product } : undefined,
    include: { product: true, offerOffices: office ? { where: { officeId: office.id } } : false },
    orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
  });

  return (
    <div>
      <PageHeader
        title="Offers"
        description="Package/offer engine: buy-X, buy-X-get-Y-free, percentage or fixed discounts, with office-specific pricing."
        action={<LinkButton href={`/admin/offers/new${searchParams.product ? `?product=${searchParams.product}` : ''}`}>New Offer</LinkButton>}
      />
      {offers.length === 0 ? (
        <EmptyState title="No offers yet" description="Create a package offer for a product." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => {
            const oo = offer.offerOffices[0];
            return (
              <a key={offer.id} href={`/admin/offers/${offer.id}`}>
                <Card className="transition hover:shadow-cardSelected">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-brand-dark">{offer.name}</p>
                    <Badge tone={offer.isActive ? 'success' : 'neutral'}>{offer.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-brand-dark/40">{offer.product.name}</p>
                  {offer.badgeText && <Badge tone="brand">{offer.badgeText}</Badge>}
                  {office && oo?.price != null && <p className="mt-2 text-sm text-brand-dark/70">{formatMoney(oo.price, office)}</p>}
                </Card>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
