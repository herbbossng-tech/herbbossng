import { getCurrentAdminOffice } from "@/lib/office-context";
import { getDashboardStats, getOrdersOverTime } from "@/lib/dashboard";
import { formatMoney } from "@/lib/currency";
import { Card, CardBody } from "@/components/ui/Card";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { LinkButton } from "@/components/ui/Button";

export default async function DashboardPage() {
  const office = await getCurrentAdminOffice();

  if (!office) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
        <h2 className="text-lg font-semibold text-zinc-900">No office configured yet</h2>
        <p className="mt-1 text-sm text-zinc-500">Create your first office to start taking orders.</p>
        <LinkButton href="/admin/offices/new" className="mt-4">
          Create an office
        </LinkButton>
      </div>
    );
  }

  const [stats, timeseries] = await Promise.all([
    getDashboardStats(office.id, 30),
    getOrdersOverTime(office.id, 14),
  ]);

  const money = (v: number) =>
    formatMoney(v, {
      currencySymbol: office.currencySymbol,
      symbolPosition: office.symbolPosition,
      decimalDigits: office.decimalDigits,
      thousandSeparator: office.thousandSeparator,
      decimalSeparator: office.decimalSeparator,
    });

  const cards: { label: string; value: string; tone?: string }[] = [
    { label: "Revenue (30d)", value: money(stats.revenue) },
    { label: "Total orders", value: String(stats.totalOrders) },
    { label: "New / Pending", value: String(stats.newOrders + stats.pendingOrders) },
    { label: "Confirmed", value: String(stats.confirmedOrders) },
    { label: "Dispatched", value: String(stats.dispatchedOrders) },
    { label: "Delivered", value: String(stats.deliveredOrders) },
    { label: "Cancelled", value: String(stats.cancelledOrders) },
    { label: "Failed delivery", value: String(stats.failedDeliveryOrders) },
    { label: "COD collected", value: money(stats.codCollected) },
    { label: "Outstanding COD", value: money(stats.outstandingCod) },
    { label: "Inventory value (cost)", value: money(stats.inventoryValue) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Dashboard — {office.name}</h1>
          <p className="text-sm text-zinc-500">Last 30 days</p>
        </div>
        <LinkButton href="/admin/orders" variant="secondary">
          View all orders
        </LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">{card.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">Orders & revenue — last 14 days</h2>
          <RevenueChart data={timeseries} />
        </CardBody>
      </Card>
    </div>
  );
}
