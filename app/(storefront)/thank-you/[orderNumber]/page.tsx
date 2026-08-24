import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { TrackingScripts } from "@/components/storefront/TrackingScripts";

export default async function ThankYouPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { office: true, items: true },
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

  const item = order.items[0];
  const whatsapp = order.office.whatsappNumber;

  return (
    <div className="min-h-screen bg-brand-cream px-4 py-10">
      <TrackingScripts officeId={order.officeId} eventId={order.eventId ?? order.id} />
      <div className="mx-auto max-w-lg">
        <div className="rounded-3xl bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-50 text-2xl text-brand-green-700">
            ✓
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-green-600">Order received</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-green-900">Thank you, {order.customerName.split(" ")[0]}!</h1>
          <p className="mt-2 text-sm text-zinc-500">Your order has been successfully received.</p>

          <div className="mt-6 rounded-2xl border border-zinc-100 bg-brand-cream/60 p-4 text-left text-sm">
            <Row label="Order number" value={order.orderNumber} />
            {item && <Row label="Package" value={item.offerTitle ?? item.productName} />}
            {item && <Row label="Quantity" value={String(item.paidQuantity + item.freeQuantity)} />}
            <Row label="Total" value={money(Number(order.total))} />
            <Row label="Delivery to" value={`${order.city}, ${order.division}`} />
          </div>

          <div className="mt-4 rounded-2xl border-2 border-brand-gold-500 bg-white p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-gold-600">Payment method</p>
            <p className="mt-1 font-semibold text-zinc-900">Cash on Delivery</p>
            <p className="text-sm text-zinc-500">You will pay when your order arrives.</p>
          </div>

          <div className="mt-6 text-left">
            <p className="mb-2 text-sm font-semibold text-zinc-900">What happens next</p>
            <ol className="space-y-1.5 text-sm text-zinc-600">
              <li>1. We confirm your order</li>
              <li>2. We prepare your package</li>
              <li>3. Our delivery team contacts and delivers to you</li>
              <li>4. You pay when your order arrives</li>
            </ol>
          </div>

          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}`}
              target="_blank"
              className="mt-6 block w-full rounded-2xl bg-brand-green-700 px-4 py-3 text-center text-sm font-bold text-white"
            >
              Chat with us on WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-1.5 last:border-0">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-900">{value}</span>
    </div>
  );
}
