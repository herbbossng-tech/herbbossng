import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { PageHeader, Card, Badge, Input, Select, Button, EmptyState } from '@/components/ui';
import { adjustInventory } from './actions';

export default async function InventoryPage() {
  const office = await getActiveOffice();
  if (!office) return <EmptyState title="No office configured" />;

  const productOffices = await db.productOffice.findMany({
    where: { officeId: office.id },
    include: { product: true },
    orderBy: { product: { name: 'asc' } },
  });

  const recentMovements = await db.inventoryMovement.findMany({
    where: { officeId: office.id },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const productNames = Object.fromEntries((await db.product.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader title="Inventory" description={`Stock levels for ${office.name}. Strategy: ${office.inventoryStrategy.replaceAll('_', ' ')}`} />
        {productOffices.length === 0 ? (
          <EmptyState title="No products configured for this office" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {productOffices.map((po) => (
              <Card key={po.id}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-brand-dark">{po.product.name}</p>
                  {po.trackInventory && po.stockQuantity <= po.lowStockThreshold && <Badge tone="warning">Low stock</Badge>}
                </div>
                <p className="mt-1 text-2xl font-bold text-brand-dark">{po.trackInventory ? po.stockQuantity : '∞'}</p>
                <p className="text-xs text-brand-dark/40">Low stock threshold: {po.lowStockThreshold}</p>

                <form action={adjustInventory.bind(null, po.productId, office.id)} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input type="number" name="quantity" placeholder="+/- qty" required className="col-span-1" />
                  <Select name="type" defaultValue="STOCK_ADDITION" className="col-span-1">
                    <option value="STOCK_ADDITION">Stock addition</option>
                    <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="RETURN">Return</option>
                    <option value="OTHER">Other</option>
                  </Select>
                  <Input name="reason" placeholder="Reason" className="col-span-2 sm:col-span-1" />
                  <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1">Apply</Button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <PageHeader title="Movement history" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-dark/10 text-xs uppercase text-brand-dark/40">
                <th className="p-3">Product</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Reason</th>
                <th>By</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentMovements.map((m) => (
                <tr key={m.id} className="border-b border-brand-dark/5">
                  <td className="p-3">{productNames[m.productId] ?? m.productId}</td>
                  <td>{m.type.replaceAll('_', ' ')}</td>
                  <td className={m.quantity > 0 ? 'text-green-700' : 'text-red-600'}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                  <td className="text-brand-dark/60">{m.reason ?? '—'}</td>
                  <td className="text-brand-dark/60">{m.user?.name ?? 'System'}</td>
                  <td className="text-xs text-brand-dark/40">{m.createdAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
