import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { formatMoney } from '@/lib/currency';
import { PageHeader, Card, StatCard, EmptyState } from '@/components/ui';
import { requirePageAccess } from '@/lib/require-page-access';

export default async function AnalyticsPage() {
  await requirePageAccess('analytics');
  const office = await getActiveOffice();
  if (!office) return <EmptyState title="No office configured" />;

  const [pageViews, viewContent, selectItem, beginCheckout, orders, deliveredOrders] = await Promise.all([
    db.analyticsEvent.count({ where: { officeId: office.id, eventType: 'page_view' } }),
    db.analyticsEvent.count({ where: { officeId: office.id, eventType: 'view_content' } }),
    db.analyticsEvent.count({ where: { officeId: office.id, eventType: 'select_item' } }),
    db.analyticsEvent.count({ where: { officeId: office.id, eventType: 'begin_checkout' } }),
    db.order.findMany({ where: { officeId: office.id } }),
    db.order.count({ where: { officeId: office.id, status: 'DELIVERED' } }),
  ]);

  const purchases = orders.length;
  const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const aov = purchases > 0 ? revenue / purchases : 0;
  const cancelled = orders.filter((o) => o.status === 'CANCELLED').length;
  const returned = orders.filter((o) => o.status === 'RETURNED').length;

  const funnel = [
    { label: 'Landing page visits', value: pageViews },
    { label: 'View content', value: viewContent },
    { label: 'Package selected', value: selectItem },
    { label: 'Checkout started', value: beginCheckout },
    { label: 'Order submitted', value: purchases },
    { label: 'Order delivered', value: deliveredOrders },
  ];

  const byCampaign = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const key = o.utmCampaign || o.utmSource || 'Direct / Unknown';
    const entry = byCampaign.get(key) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += Number(o.total);
    byCampaign.set(key, entry);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader title="Analytics" description={`${office.name} — funnel, revenue and campaign attribution`} />
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Revenue" value={formatMoney(revenue, office)} />
          <StatCard label="Average order value" value={formatMoney(aov, office)} />
          <StatCard label="Cancellation rate" value={purchases ? `${Math.round((cancelled / purchases) * 100)}%` : '—'} />
          <StatCard label="Return rate" value={purchases ? `${Math.round((returned / purchases) * 100)}%` : '—'} />
        </div>
      </div>

      <div>
        <PageHeader title="Funnel" />
        <Card>
          <div className="flex flex-col gap-2">
            {funnel.map((step, i) => {
              const pct = funnel[0].value > 0 ? Math.round((step.value / funnel[0].value) * 100) : 0;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm text-brand-dark/70">{step.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-full bg-brand-dark/5">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${i === 0 ? 100 : pct}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-medium text-brand-dark">{step.value} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div>
        <PageHeader title="Revenue by campaign" />
        {byCampaign.size === 0 ? (
          <EmptyState title="No campaign data yet" description="Orders with utm_campaign/utm_source will appear here." />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-brand-dark/10 text-xs uppercase text-brand-dark/40">
                  <th className="p-3">Campaign / Source</th>
                  <th>Orders</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byCampaign.entries()).map(([name, v]) => (
                  <tr key={name} className="border-b border-brand-dark/5">
                    <td className="p-3">{name}</td>
                    <td>{v.orders}</td>
                    <td>{formatMoney(v.revenue, office)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
