import { db } from '@/lib/db';
import { PageHeader, Card } from '@/components/ui';
import { OfferForm } from '../offer-form';
import { createOffer } from '../actions';

export default async function NewOfferPage({ searchParams }: { searchParams: { product?: string } }) {
  const products = await db.product.findMany({ orderBy: { name: 'asc' } });
  return (
    <div>
      <PageHeader title="New Offer" />
      <Card>
        <OfferForm products={products} defaultProductId={searchParams.product} action={createOffer} />
      </Card>
    </div>
  );
}
