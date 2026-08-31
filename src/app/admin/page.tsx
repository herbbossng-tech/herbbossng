import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { formatMoney } from '@/lib/currency';
import { PageHeader, Card, StatCard, EmptyState } from '@/components/ui';
import { OrdersLineChart, RevenueBarChart } from '@/components/admin/charts';

const RANGE_OPTIONS: Record<string, number> = { today: 1, '7d': 7, '30d': 30 };

export default async function AdminDashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const office = await getActiveOffice();
  if (!office) return <EmptyState title="No office configured" description="Create your first office to get started." />;

  const days = RANGE_OPTIONS[searchParams.range ?? '30d'] ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [orders, deliveredCount, pendingCount, cancelledCount, failedCount, codCollected, productOffices] = await Promise.all([
    db.order.findMany({ where: { officeId: office.id, createdAt: { gte: since } }, include: { product: true } }),
    db.order.count({ where: { officeId: office.id, status: 'DELIVERED' } }),
    db.order.count({ where: { officeId: office.id, status: { in: ['NEW', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING', 'PACKED'] } } }),
    db.order.count({ where: { officeId: office.id, status: 'CANCELLED' } }),
    db.order.count({ where: { officeId: office.id, status: 'FAILED_DELIVERY' } }),
    db.order.aggregate({ where: { officeId: office.id, paymentStatus: 'COD_COLLECTED' }, _sum: { total: true } }),
    db.productOffice.findMany({ where: { officeId: office.id }, include: { product: true } }),
  ]);

  const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const inventoryValue = productOffices.reduce((sum, po) => sum + Number(po.price) * po.stockQuantity, 0);

  const byDate = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const entry = byDate.get(key) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += Number(o.total);
    byDate.set(key, entry);
  }
  const series = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date: date.slice(5), orders: v.orders, revenue: v.revenue }));

  const byProduct = new Map<string, number>();
  for (const o of orders) {
    byProduct.set(o.product.name, (byProduct.get(o.product.name) ?? 0) + Number(o.total));
  }
  const productSeries = Array.from(byProduct.entries()).map(([name, rev]) => ({ name, revenue: rev }));

  return (
    <div>
      <PageHeader title="Dashboard" description={`${office.name} · last ${days} day${days > 1 ? 's' : ''}`} />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(revenue, office)} />
        <StatCard label="Orders" value={String(orders.length)} />
        <StatCard label="Delivered" value={String(deliveredCount)} />
        <StatCard label="Pending" value={String(pendingCount)} />
        <StatCard label="Cancelled" value={String(cancelledCount)} />
        <StatCard label="Failed Delivery" value={String(failedCount)} />
        <StatCard label="COD Collected" value={formatMoney(Number(codCollected._sum.total ?? 0), office)} />
        <StatCard label="Inventory Value" value={formatMoney(inventoryValue, office)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-2 text-sm font-medium text-brand-dark">Orders over time</p>
          {series.length > 0 ? <OrdersLineChart data={series} /> : <EmptyState title="No orders yet in this range" />}
        </Card>
        <Card>
          <p className="mb-2 text-sm font-medium text-brand-dark">Revenue by product</p>
          {productSeries.length > 0 ? <RevenueBarChart data={productSeries} /> : <EmptyState title="No revenue yet in this range" />}
        </Card>
      </div>
    </div>
  );
}
