import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PageHeader, Card, Button, Input } from '@/components/ui';
import { OfferForm } from '../offer-form';
import { updateOffer, upsertOfferOffice, deleteOffer } from '../actions';

export default async function OfferDetailPage({ params }: { params: { id: string } }) {
  const [offer, products, offices] = await Promise.all([
    db.offer.findUnique({ where: { id: params.id }, include: { offerOffices: true } }),
    db.product.findMany({ orderBy: { name: 'asc' } }),
    db.office.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  if (!offer) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader
          title={offer.name}
          action={
            <form action={deleteOffer.bind(null, offer.id)}>
              <Button type="submit" variant="danger">Delete offer</Button>
            </form>
          }
        />
        <Card>
          <OfferForm offer={offer} products={products} action={updateOffer.bind(null, offer.id)} />
        </Card>
      </div>

      <div>
        <PageHeader title="Per-office price override" description="Leave blank to fall back to the product's base price × quantity." />
        <div className="flex flex-col gap-4">
          {offices.map((office) => {
            const oo = offer.offerOffices.find((o) => o.officeId === office.id);
            return (
              <Card key={office.id}>
                <p className="mb-3 font-medium text-brand-dark">{office.name}</p>
                <form action={upsertOfferOffice.bind(null, offer.id, office.id)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-brand-dark/50">Bundle price</label>
                    <Input type="number" step="0.01" name="price" defaultValue={oo?.price ? Number(oo.price) : ''} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-brand-dark/50">Compare-at price</label>
                    <Input type="number" step="0.01" name="compareAtPrice" defaultValue={oo?.compareAtPrice ? Number(oo.compareAtPrice) : ''} />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={oo?.isActive ?? true} /> Active</label>
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" variant="secondary">Save</Button>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
