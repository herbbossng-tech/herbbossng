import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { formatMoney } from '@/lib/currency';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/order-status';
import { PageHeader, Card, Badge, Select, Textarea, Button } from '@/components/ui';
import { updateOrderStatus, updatePaymentStatus, updateInternalNotes } from '../actions';
import { PaymentStatusForm } from './payment-status-form';

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const order = await db.order.findUnique({
    where: { id: params.id },
    include: {
      office: true,
      product: true,
      offer: true,
      customer: true,
      city: true,
      deliveryArea: true,
      landingPage: true,
      statusHistory: { orderBy: { createdAt: 'desc' }, include: { user: true } },
      inventoryMovements: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) notFound();
  const { office } = order;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <div>
          <PageHeader
            title={order.orderNumber}
            description={order.createdAt.toLocaleString()}
            action={<Badge tone="brand">{ORDER_STATUS_LABELS[order.status]}</Badge>}
          />

          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Customer & delivery</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Customer" value={order.customerName} />
              <Field label="Phone" value={order.phone} />
              <Field label="Email" value={order.email ?? '—'} />
              <Field label={office.divisionLabel} value={order.divisionName} />
              <Field label="City" value={order.cityName} />
              <Field label="Delivery area" value={order.deliveryArea?.name ?? '—'} />
              <Field label="Address" value={order.deliveryAddress} className="sm:col-span-2" />
            </dl>
          </Card>

          <Card className="mt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Order</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Product" value={order.product.name} />
              <Field label="Package" value={order.offer.name} />
              <Field label="Quantity paid" value={String(order.quantityPaid)} />
              <Field label="Quantity free" value={String(order.quantityFree)} />
              <Field label="Unit price" value={formatMoney(order.unitPrice, office)} />
              <Field label="Subtotal" value={formatMoney(order.subtotal, office)} />
              <Field label="Discount" value={formatMoney(order.discount, office)} />
              <Field label="Shipping" value={Number(order.shipping) === 0 ? 'Free' : formatMoney(order.shipping, office)} />
              <Field label="Tax" value={formatMoney(order.tax, office)} />
              <Field label="Total" value={formatMoney(order.total, office)} className="font-semibold" />
              <Field label="Landing page" value={order.landingPage?.title ?? '—'} />
            </dl>
          </Card>

          <Card className="mt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Marketing attribution</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Source" value={order.source ?? '—'} />
              <Field label="UTM Source" value={order.utmSource ?? '—'} />
              <Field label="UTM Medium" value={order.utmMedium ?? '—'} />
              <Field label="UTM Campaign" value={order.utmCampaign ?? '—'} />
              <Field label="fbclid" value={order.fbclid ?? '—'} />
              <Field label="gclid" value={order.gclid ?? '—'} />
              <Field label="Landing URL" value={order.landingPageUrl ?? '—'} className="sm:col-span-2 break-all" />
              <Field label="Referrer" value={order.referrer ?? '—'} className="sm:col-span-2 break-all" />
              <Field label="IP address" value={order.ipAddress ?? '—'} />
            </dl>
          </Card>

          <Card className="mt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Internal notes</p>
            <form action={updateInternalNotes.bind(null, order.id)} className="flex flex-col gap-2">
              <Textarea name="internalNotes" defaultValue={order.internalNotes ?? ''} rows={3} />
              <Button type="submit" variant="secondary" className="self-start">Save notes</Button>
            </form>
            {order.customerNotes && <p className="mt-3 text-sm text-brand-dark/60">Customer note: {order.customerNotes}</p>}
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Status</p>
          <form action={updateOrderStatus.bind(null, order.id)} className="flex flex-col gap-3">
            <Select name="status" defaultValue={order.status}>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <Textarea name="note" placeholder="Optional note about this change" rows={2} />
            <Button type="submit">Update status</Button>
          </form>

          <div className="mt-4">
            <p className="mb-1 text-xs text-brand-dark/40">Payment status</p>
            <PaymentStatusForm orderId={order.id} paymentStatus={order.paymentStatus} action={updatePaymentStatus} />
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Timeline</p>
          <ol className="flex flex-col gap-3">
            {order.statusHistory.map((h) => (
              <li key={h.id} className="border-l-2 border-brand/30 pl-3 text-sm">
                <p className="font-medium text-brand-dark">{ORDER_STATUS_LABELS[h.status]}</p>
                <p className="text-xs text-brand-dark/40">{h.createdAt.toLocaleString()} {h.user ? `· ${h.user.name}` : ''}</p>
                {h.note && <p className="text-xs text-brand-dark/60">{h.note}</p>}
              </li>
            ))}
          </ol>
        </Card>

        {order.inventoryMovements.length > 0 && (
          <Card>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Inventory movements</p>
            <ul className="flex flex-col gap-2 text-xs text-brand-dark/60">
              {order.inventoryMovements.map((m) => (
                <li key={m.id}>
                  {m.type} · {m.quantity > 0 ? '+' : ''}{m.quantity} · {m.createdAt.toLocaleDateString()}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-brand-dark/40">{label}</dt>
      <dd className="text-brand-dark">{value}</dd>
    </div>
  );
}
