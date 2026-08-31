import Link from 'next/link';
import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { formatMoney } from '@/lib/currency';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import { PageHeader, Card, Badge, Input, Select, EmptyState } from '@/components/ui';

const PAGE_SIZE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string };
}) {
  const office = await getActiveOffice();
  if (!office) return <EmptyState title="No office configured" description="Create an office first." />;

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const where = {
    officeId: office.id,
    ...(searchParams.status ? { status: searchParams.status as never } : {}),
    ...(searchParams.q
      ? {
          OR: [
            { orderNumber: { contains: searchParams.q, mode: 'insensitive' as const } },
            { customerName: { contains: searchParams.q, mode: 'insensitive' as const } },
            { phone: { contains: searchParams.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [orders, total, statusCounts] = await Promise.all([
    db.order.findMany({
      where,
      include: { product: true, offer: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.order.count({ where }),
    db.order.groupBy({ by: ['status'], where: { officeId: office.id }, _count: true }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Orders" description={`${office.name} · ${total} total`} />

      <div className="mb-4 flex flex-wrap gap-2">
        {statusCounts.map((s) => (
          <Badge key={s.status} tone="neutral">
            {ORDER_STATUS_LABELS[s.status]}: {s._count}
          </Badge>
        ))}
      </div>

      <Card className="mb-4">
        <form className="flex flex-wrap gap-3" method="GET">
          <Input name="q" defaultValue={searchParams.q} placeholder="Search order #, name or phone" className="max-w-xs" />
          <Select name="status" defaultValue={searchParams.status ?? ''} className="max-w-[12rem]">
            <option value="">All statuses</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">Filter</button>
        </form>
      </Card>

      {orders.length === 0 ? (
        <EmptyState title="No orders found" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-dark/10 text-xs uppercase text-brand-dark/40">
                <th className="p-3">Order #</th>
                <th>Customer</th>
                <th>Product / Package</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-brand-dark/5 hover:bg-brand/5">
                  <td className="p-3">
                    <Link href={`/admin/orders/${order.id}`} className="font-medium text-brand hover:underline">{order.orderNumber}</Link>
                  </td>
                  <td>
                    <p>{order.customerName}</p>
                    <p className="text-xs text-brand-dark/40">{order.phone}</p>
                  </td>
                  <td>
                    <p>{order.product.name}</p>
                    <p className="text-xs text-brand-dark/40">{order.offer.name}</p>
                  </td>
                  <td>{formatMoney(order.total, office)}</td>
                  <td>
                    <Badge tone={order.status === 'DELIVERED' ? 'success' : order.status === 'CANCELLED' || order.status === 'FAILED_DELIVERY' ? 'danger' : 'brand'}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </td>
                  <td className="text-xs text-brand-dark/50">{order.createdAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/orders?${new URLSearchParams({ ...searchParams, page: String(p) }).toString()}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${p === page ? 'bg-brand text-white' : 'bg-white text-brand-dark/60'}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
