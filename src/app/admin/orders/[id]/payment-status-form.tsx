'use client';

import type { PaymentStatus } from '@prisma/client';
import { PAYMENT_STATUS_LABELS } from '@/lib/order-status';

export function PaymentStatusForm({
  orderId,
  paymentStatus,
  action,
}: {
  orderId: string;
  paymentStatus: PaymentStatus;
  action: (orderId: string, status: PaymentStatus) => void;
}) {
  return (
    <select
      defaultValue={paymentStatus}
      onChange={(e) => action(orderId, e.target.value as PaymentStatus)}
      className="w-full rounded-lg border border-brand-dark/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
    >
      {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}
