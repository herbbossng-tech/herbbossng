import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/currency';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import { PageHeader, Card, Badge, StatCard } from '@/components/ui';

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: { office: true, orders: { orderBy: { createdAt: 'desc' }, include: { product: true, offer: true } } },
  });
  if (!customer) notFound();

  const delivered = customer.orders.filter((o) => o.status === 'DELIVERED').length;
  const cancelled = customer.orders.filter((o) => o.status === 'CANCELLED').length;
  const returned = customer.orders.filter((o) => o.status === 'RETURNED').length;
  const totalValue = customer.orders.reduce((sum, o) => sum + Number(o.total), 0);
  const confirmationRate = customer.orders.length ? Math.round(((customer.orders.length - cancelled) / customer.orders.length) * 100) : 0;

  return (
    <div>
      <PageHeader title={customer.name} description={`${customer.phone} · ${customer.office.name}`} />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total orders" value={String(customer.orders.length)} />
        <StatCard label="Delivered" value={String(delivered)} />
        <StatCard label="Cancelled / Returned" value={String(cancelled + returned)} />
        <StatCard label="Lifetime value" value={formatMoney(totalValue, customer.office)} hint={`${confirmationRate}% confirmation rate`} />
      </div>

      <Card className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Profile</p>
        <p className="text-sm text-brand-dark">Address: {customer.address ?? '—'}</p>
        <p className="text-sm text-brand-dark">Email: {customer.email ?? '—'}</p>
        {customer.notes && <p className="mt-2 text-sm text-brand-dark/60">Notes: {customer.notes}</p>}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-brand-dark/10 text-xs uppercase text-brand-dark/40">
              <th className="p-3">Order #</th>
              <th>Product</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {customer.orders.map((o) => (
              <tr key={o.id} className="border-b border-brand-dark/5 hover:bg-brand/5">
                <td className="p-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-brand hover:underline">{o.orderNumber}</Link>
                </td>
                <td>{o.product.name} · {o.offer.name}</td>
                <td>{formatMoney(o.total, customer.office)}</td>
                <td><Badge tone="brand">{ORDER_STATUS_LABELS[o.status]}</Badge></td>
                <td className="text-xs text-brand-dark/40">{o.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
