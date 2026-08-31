import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { formatMoney } from '@/lib/currency';
import { PageHeader, Card, Badge, LinkButton, EmptyState } from '@/components/ui';

export default async function ProductsPage() {
  const office = await getActiveOffice();
  const products = await db.product.findMany({
    orderBy: { createdAt: 'desc' },
    include: { productOffices: office ? { where: { officeId: office.id } } : false, images: { where: { isPrimary: true }, take: 1 } },
  });

  return (
    <div>
      <PageHeader
        title="Products"
        description="Products can have different prices, offers and inventory per office."
        action={<LinkButton href="/admin/products/new">New Product</LinkButton>}
      />
      {products.length === 0 ? (
        <EmptyState title="No products yet" description="Create your first product to start building offers and landing pages." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const po = p.productOffices[0];
            return (
              <a key={p.id} href={`/admin/products/${p.id}`}>
                <Card className="transition hover:shadow-cardSelected">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-brand-dark">{p.name}</p>
                    <Badge tone={p.status === 'ACTIVE' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'neutral'}>{p.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-brand-dark/40">SKU {p.sku}</p>
                  {office && po ? (
                    <p className="mt-2 text-sm text-brand-dark/70">
                      {formatMoney(po.price, office)} in {office.name} · stock {po.stockQuantity}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-amber-700">Not configured for {office?.name ?? 'this office'}</p>
                  )}
                </Card>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
