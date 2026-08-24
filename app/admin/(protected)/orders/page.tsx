import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAdminOffice } from "@/lib/office-context";
import { formatMoney } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { OrderStatus } from "@/app/generated/prisma/enums";

const STATUSES: OrderStatus[] = [
  "NEW", "PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "PACKED", "DISPATCHED",
  "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED", "FAILED_DELIVERY",
];

const PAGE_SIZE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page } = await searchParams;
  const office = await getCurrentAdminOffice();
  if (!office) return <p className="text-sm text-zinc-500">Create an office first.</p>;

  const pageNum = Math.max(1, Number(page) || 1);

  const where = {
    officeId: office.id,
    ...(status ? { status: status as OrderStatus } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { customerName: { contains: q, mode: "insensitive" as const } },
            { customerPhone: { contains: q } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { items: true },
    }),
    prisma.order.count({ where }),
  ]);

  const money = (v: number) =>
    formatMoney(v, {
      currencySymbol: office.currencySymbol,
      symbolPosition: office.symbolPosition,
      decimalDigits: office.decimalDigits,
      thousandSeparator: office.thousandSeparator,
      decimalSeparator: office.decimalSeparator,
    });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Orders — {office.name}</h1>

      <form className="flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={q} placeholder="Search order #, name or phone" className="max-w-xs" />
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${order.id}`} className="font-medium text-brand-green-700 hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div>{order.customerName}</div>
                  <div className="text-xs text-zinc-400">{order.customerPhone}</div>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-600">{order.items[0]?.offerTitle ?? order.items[0]?.productName}</td>
                <td className="px-4 py-3 font-medium">{money(Number(order.total))}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{order.createdAt.toLocaleString()}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/orders?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(p) })}`}
              className={p === pageNum ? "font-bold text-brand-green-700" : "text-zinc-500"}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
