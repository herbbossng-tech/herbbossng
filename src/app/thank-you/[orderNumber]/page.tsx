import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/currency';

export default async function ThankYouPage({ params }: { params: { orderNumber: string } }) {
  const order = await db.order.findUnique({
    where: { orderNumber: params.orderNumber },
    include: { office: true, product: true, offer: true },
  });
  if (!order) notFound();

  const { office } = order;

  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl2 bg-white p-6 text-center shadow-cardSelected sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-3xl text-brand">✓</div>
          <h1 className="text-xl font-bold text-brand-dark sm:text-2xl">Order Received</h1>
          <p className="mt-2 text-sm text-brand-dark/60">Thank you, {order.customerName}! Your order has been successfully received.</p>

          <div className="mt-6 rounded-xl border border-brand-dark/10 bg-cream p-4 text-left text-sm">
            <Row label="Order Number" value={order.orderNumber} />
            <Row label="Package" value={order.offer.name} />
            <Row label="Quantity" value={String(order.quantityPaid + order.quantityFree)} />
            <Row label="Total" value={formatMoney(order.total, office)} />
            <Row label="Delivery to" value={`${order.cityName}, ${order.divisionName}`} />
          </div>

          <div className="mt-6 rounded-xl bg-brand/5 p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Payment Method</p>
            <p className="mt-1 text-sm font-medium text-brand-dark">Cash on Delivery</p>
            <p className="text-xs text-brand-dark/60">You will pay when your order arrives.</p>
          </div>

          <div className="mt-6 text-left">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-dark/50">What happens next</p>
            <ol className="flex flex-col gap-2 text-sm text-brand-dark/70">
              <li>1. We confirm your order</li>
              <li>2. We prepare your package</li>
              <li>3. Our delivery team contacts/delivers to you</li>
              <li>4. You pay when your order arrives</li>
            </ol>
          </div>

          {office.whatsappNumber && (
            <a
              href={`https://wa.me/${office.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, I'd like help with my order ${order.orderNumber}`)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-semibold text-white"
            >
              💬 {office.whatsappCtaText ?? 'Chat with us on WhatsApp'}
            </a>
          )}

          {office.officePhone && <p className="mt-3 text-xs text-brand-dark/40">Need help? Call us on {office.officePhone}</p>}
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-brand-dark/5 py-1.5 last:border-0">
      <span className="text-xs uppercase tracking-wide text-brand-dark/40">{label}</span>
      <span className="font-medium text-brand-dark">{value}</span>
    </div>
  );
}
