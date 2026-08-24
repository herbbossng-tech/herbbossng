import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge, Badge } from "@/components/ui/Badge";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { office: true, orders: { orderBy: { createdAt: "desc" } } },
  });
  if (!customer) notFound();

  const money = (v: number) =>
    formatMoney(v, {
      currencySymbol: customer.office.currencySymbol,
      symbolPosition: customer.office.symbolPosition,
      decimalDigits: customer.office.decimalDigits,
      thousandSeparator: customer.office.thousandSeparator,
      decimalSeparator: customer.office.decimalSeparator,
    });

  const totalOrders = customer.orders.length;
  const delivered = customer.orders.filter((o) => o.status === "DELIVERED").length;
  const cancelled = customer.orders.filter((o) => o.status === "CANCELLED").length;
  const failedDelivery = customer.orders.filter((o) => o.status === "FAILED_DELIVERY").length;
  const totalValue = customer.orders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + Number(o.total), 0);
  const distinctAddresses = new Set(customer.orders.map((o) => o.deliveryAddress.trim().toLowerCase()));

  const flags: string[] = [];
  if (totalOrders >= 3 && cancelled / totalOrders > 0.4) flags.push("High cancellation rate");
  if (totalOrders >= 3 && failedDelivery / totalOrders > 0.3) flags.push("Repeated failed deliveries");
  if (distinctAddresses.size >= 3) flags.push("Multiple delivery addresses used");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{customer.name}</h1>
        <p className="text-sm text-zinc-500">
          {customer.phone} · {customer.office.name}
        </p>
      </div>

      {flags.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardBody className="flex flex-wrap gap-2">
            {flags.map((f) => (
              <Badge key={f} tone="gold">
                ⚠ {f}
              </Badge>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total orders" value={String(totalOrders)} />
        <Stat label="Delivered" value={String(delivered)} />
        <Stat label="Cancelled" value={String(cancelled)} />
        <Stat label="Lifetime value" value={money(totalValue)} />
      </div>

      <Card>
        <CardHeader className="font-medium">Contact details</CardHeader>
        <CardBody className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-zinc-400">Email</p>
            <p>{customer.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-zinc-400">Address</p>
            <p>{customer.address ?? "—"}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Order history</CardHeader>
        <CardBody>
          <ul className="divide-y divide-zinc-100 text-sm">
            {customer.orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between py-2">
                <Link href={`/admin/orders/${order.id}`} className="text-brand-green-700 hover:underline">
                  {order.orderNumber}
                </Link>
                <span className="text-xs text-zinc-500">{order.createdAt.toLocaleDateString()}</span>
                <span className="font-medium">{money(Number(order.total))}</span>
                <StatusBadge status={order.status} />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
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
