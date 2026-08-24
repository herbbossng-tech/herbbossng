import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updateOrderStatus, updatePaymentStatus, updateInternalNotes } from "../actions";
import type { OrderStatus, PaymentStatus } from "@/app/generated/prisma/enums";

const STATUSES: OrderStatus[] = [
  "NEW", "PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "PACKED", "DISPATCHED",
  "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED", "FAILED_DELIVERY",
];
const PAYMENT_STATUSES: PaymentStatus[] = ["COD_PENDING", "COD_COLLECTED", "REFUNDED", "NOT_APPLICABLE"];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      office: true,
      customer: true,
      items: true,
      statusHistory: { orderBy: { createdAt: "desc" }, include: { changedByUser: true } },
    },
  });
  if (!order) notFound();

  const money = (v: number) =>
    formatMoney(v, {
      currencySymbol: order.currencySymbol,
      symbolPosition: order.office.symbolPosition,
      decimalDigits: order.office.decimalDigits,
      thousandSeparator: order.office.thousandSeparator,
      decimalSeparator: order.office.decimalSeparator,
    });

  const updateStatusWithId = updateOrderStatus.bind(null, order.id);
  const updatePaymentWithId = updatePaymentStatus.bind(null, order.id);
  const updateNotesWithId = updateInternalNotes.bind(null, order.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{order.orderNumber}</h1>
          <p className="text-sm text-zinc-500">{order.createdAt.toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
        </div>
      </div>

      <Card>
        <CardHeader className="font-medium">Customer & delivery</CardHeader>
        <CardBody className="grid gap-2 text-sm sm:grid-cols-2">
          <Field label="Customer" value={order.customerName} />
          <Field label="Phone" value={order.customerPhone} />
          <Field label="Email" value={order.customerEmail ?? "—"} />
          <Field label="Office" value={order.office.name} />
          <Field label="Address" value={order.deliveryAddress} />
          <Field label={`${order.office.divisionLabel} / City`} value={`${order.division}, ${order.city}`} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Order items</CardHeader>
        <CardBody className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <p className="font-medium text-zinc-900">{item.offerTitle ?? item.productName}</p>
                <p className="text-xs text-zinc-500">
                  {item.paidQuantity} paid + {item.freeQuantity} free = {item.paidQuantity + item.freeQuantity} units
                </p>
              </div>
              <p className="font-medium">{money(Number(item.lineTotal))}</p>
            </div>
          ))}
          <div className="space-y-1 border-t border-zinc-100 pt-3 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>Subtotal</span>
              <span>{money(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>Shipping</span>
              <span>{Number(order.shipping) === 0 ? "Free" : money(Number(order.shipping))}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-brand-green-800">
              <span>Total</span>
              <span>{money(Number(order.total))}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Status</CardHeader>
        <CardBody className="space-y-4">
          <form action={updateStatusWithId} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Order status</label>
              <Select name="status" defaultValue={order.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-zinc-500">Note (optional)</label>
              <Textarea name="note" rows={1} />
            </div>
            <Button type="submit" size="sm">
              Update status
            </Button>
          </form>

          <form action={updatePaymentWithId} className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Payment status</label>
              <Select name="paymentStatus" defaultValue={order.paymentStatus}>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Update payment
            </Button>
          </form>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Timeline</h3>
            <ul className="space-y-2 text-sm">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="flex items-start justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <div>
                    <StatusBadge status={h.status} />
                    {h.note && <p className="mt-1 text-xs text-zinc-500">{h.note}</p>}
                  </div>
                  <span className="text-xs text-zinc-400">{h.createdAt.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Internal notes</CardHeader>
        <CardBody>
          <form action={updateNotesWithId} className="space-y-2">
            <Textarea name="internalNotes" rows={3} defaultValue={order.internalNotes ?? ""} />
            <Button type="submit" size="sm">
              Save notes
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Marketing attribution</CardHeader>
        <CardBody className="grid gap-2 text-sm sm:grid-cols-2">
          <Field label="Landing page" value={order.landingPageSlug ?? "—"} />
          <Field label="UTM source / medium" value={`${order.utmSource ?? "—"} / ${order.utmMedium ?? "—"}`} />
          <Field label="UTM campaign" value={order.utmCampaign ?? "—"} />
          <Field label="Referrer" value={order.referrer ?? "—"} />
          <Field label="IP address" value={order.ipAddress ?? "—"} />
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="font-medium text-zinc-800">{value}</p>
    </div>
  );
}
