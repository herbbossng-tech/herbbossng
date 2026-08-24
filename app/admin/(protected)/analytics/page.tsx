import { prisma } from "@/lib/prisma";
import { getCurrentAdminOffice } from "@/lib/office-context";
import { formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { subDays } from "date-fns";

export default async function AnalyticsPage() {
  const office = await getCurrentAdminOffice();
  if (!office) return <p className="text-sm text-zinc-500">Create an office first.</p>;

  const since = subDays(new Date(), 30);

  const [funnelEvents, orders] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["eventName"],
      where: { officeId: office.id, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { officeId: office.id, createdAt: { gte: since } },
      include: { items: true },
    }),
  ]);

  const funnelCounts = Object.fromEntries(funnelEvents.map((e) => [e.eventName, e._count._all]));
  const funnel = [
    { label: "Page views", value: funnelCounts.page_view ?? 0 },
    { label: "Viewed product", value: funnelCounts.view_content ?? 0 },
    { label: "Selected package", value: funnelCounts.select_item ?? 0 },
    { label: "Started checkout", value: funnelCounts.begin_checkout ?? 0 },
    { label: "Orders placed", value: orders.length },
  ];

  const revenueByProduct = new Map<string, number>();
  const revenueByOffer = new Map<string, number>();
  const revenueByCampaign = new Map<string, number>();
  let totalRevenue = 0;
  const nonCancelled = orders.filter((o) => o.status !== "CANCELLED");

  for (const order of nonCancelled) {
    totalRevenue += Number(order.total);
    for (const item of order.items) {
      revenueByProduct.set(item.productName, (revenueByProduct.get(item.productName) ?? 0) + Number(item.lineTotal));
      if (item.offerTitle) revenueByOffer.set(item.offerTitle, (revenueByOffer.get(item.offerTitle) ?? 0) + Number(item.lineTotal));
    }
    const campaign = order.utmCampaign ?? "(none)";
    revenueByCampaign.set(campaign, (revenueByCampaign.get(campaign) ?? 0) + Number(order.total));
  }

  const money = (v: number) =>
    formatMoney(v, {
      currencySymbol: office.currencySymbol,
      symbolPosition: office.symbolPosition,
      decimalDigits: office.decimalDigits,
      thousandSeparator: office.thousandSeparator,
      decimalSeparator: office.decimalSeparator,
    });

  const avgOrderValue = nonCancelled.length > 0 ? totalRevenue / nonCancelled.length : 0;
  const conversionRate = funnel[0].value > 0 ? ((orders.length / funnel[0].value) * 100).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Analytics — {office.name} (last 30 days)</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Revenue" value={money(totalRevenue)} />
        <Stat label="Avg order value" value={money(avgOrderValue)} />
        <Stat label="Orders" value={String(orders.length)} />
        <Stat label="View → order rate" value={typeof conversionRate === "string" ? conversionRate : `${conversionRate}%`} />
      </div>

      <Card>
        <CardHeader className="font-medium">Conversion funnel</CardHeader>
        <CardBody>
          <div className="space-y-2">
            {funnel.map((step) => (
              <div key={step.label} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-zinc-600">{step.label}</span>
                <div className="h-6 flex-1 rounded-full bg-zinc-100">
                  <div
                    className="h-6 rounded-full bg-brand-green-700"
                    style={{ width: `${funnel[0].value > 0 ? Math.max(4, (step.value / funnel[0].value) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-medium">{step.value}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <RankedList title="Revenue by product" money={money} data={revenueByProduct} />
        <RankedList title="Revenue by offer" money={money} data={revenueByOffer} />
        <RankedList title="Revenue by campaign" money={money} data={revenueByCampaign} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function RankedList({ title, data, money }: { title: string; data: Map<string, number>; money: (v: number) => string }) {
  const sorted = Array.from(data.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <Card>
      <CardHeader className="text-sm font-medium">{title}</CardHeader>
      <CardBody>
        <ul className="space-y-1.5 text-sm">
          {sorted.map(([label, value]) => (
            <li key={label} className="flex justify-between">
              <span className="truncate text-zinc-600">{label}</span>
              <span className="font-medium">{money(value)}</span>
            </li>
          ))}
          {sorted.length === 0 && <li className="text-zinc-400">No data yet</li>}
        </ul>
      </CardBody>
    </Card>
  );
}
