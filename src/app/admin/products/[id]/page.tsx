import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/currency';
import { PageHeader, Card, Button, Input, LinkButton } from '@/components/ui';
import { ProductForm } from '../product-form';
import { updateProduct, upsertProductOffice, addProductImage, removeProductImage, setPrimaryImage, duplicateProduct, archiveProduct } from '../actions';
import { ImageUploader } from '@/components/admin/image-uploader';

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const [product, offices] = await Promise.all([
    db.product.findUnique({
      where: { id: params.id },
      include: { productOffices: true, images: { orderBy: { sortOrder: 'asc' } }, offers: { orderBy: { sortOrder: 'asc' } } },
    }),
    db.office.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  if (!product) notFound();

  const updateProductBound = updateProduct.bind(null, product.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader
          title={product.name}
          description={`SKU ${product.sku}`}
          action={
            <div className="flex gap-2">
              <LinkButton href={`/admin/offers?product=${product.id}`} variant="secondary">
                Manage Offers ({product.offers.length})
              </LinkButton>
              <form action={duplicateProduct.bind(null, product.id)}>
                <Button variant="secondary" type="submit">Duplicate</Button>
              </form>
              <form action={archiveProduct.bind(null, product.id)}>
                <Button variant="danger" type="submit">Archive</Button>
              </form>
            </div>
          }
        />
        <Card>
          <ProductForm product={product} action={updateProductBound} />
        </Card>
      </div>

      <div>
        <PageHeader title="Images" />
        <Card>
          <ImageUploader onUploaded={async (url) => { 'use server'; await addProductImage(product.id, url); }} />
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {product.images.map((img) => (
              <div key={img.id} className="overflow-hidden rounded-lg border border-brand-dark/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.altText ?? ''} className="h-32 w-full object-cover" />
                <div className="flex items-center justify-between p-2 text-xs">
                  <form action={setPrimaryImage.bind(null, product.id, img.id)}>
                    <button className={img.isPrimary ? 'font-semibold text-brand' : 'text-brand-dark/50'}>
                      {img.isPrimary ? 'Primary' : 'Set primary'}
                    </button>
                  </form>
                  <form action={removeProductImage.bind(null, product.id, img.id)}>
                    <button className="text-red-500">Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <PageHeader title="Pricing & inventory by office" description="Each office can have its own price, compare-at price, and stock." />
        <div className="flex flex-col gap-4">
          {offices.map((office) => {
            const po = product.productOffices.find((p) => p.officeId === office.id);
            const action = upsertProductOffice.bind(null, product.id, office.id);
            return (
              <Card key={office.id}>
                <p className="mb-3 font-medium text-brand-dark">
                  {office.name} {po && <span className="ml-2 text-xs text-brand-dark/40">Currently {formatMoney(po.price, office)}</span>}
                </p>
                <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs text-brand-dark/50">Price</label>
                    <Input type="number" step="0.01" name="price" defaultValue={po ? Number(po.price) : ''} required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-brand-dark/50">Compare-at</label>
                    <Input type="number" step="0.01" name="compareAtPrice" defaultValue={po?.compareAtPrice ? Number(po.compareAtPrice) : ''} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-brand-dark/50">Stock qty</label>
                    <Input type="number" name="stockQuantity" defaultValue={po?.stockQuantity ?? 0} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-brand-dark/50">Low stock at</label>
                    <Input type="number" name="lowStockThreshold" defaultValue={po?.lowStockThreshold ?? 10} />
                  </div>
                  <div className="flex flex-col justify-end gap-1 text-xs">
                    <label className="flex items-center gap-1"><input type="checkbox" name="isActive" defaultChecked={po?.isActive ?? true} /> Active</label>
                    <label className="flex items-center gap-1"><input type="checkbox" name="trackInventory" defaultChecked={po?.trackInventory ?? true} /> Track inventory</label>
                  </div>
                  <div className="col-span-2 sm:col-span-5">
                    <Button type="submit" variant="secondary">Save {office.name} pricing</Button>
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
