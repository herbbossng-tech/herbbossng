'use server';

import type { OrderStatus, PaymentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';
import { recordInventoryMovement, getOrderNetDeduction } from '@/lib/inventory';
import { sendOrderStatusEmail } from '@/lib/email/send-order-emails';

const STATUS_EMAIL_MAP: Partial<Record<OrderStatus, 'ORDER_CONFIRMED' | 'ORDER_DISPATCHED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'FAILED_DELIVERY'>> = {
  CONFIRMED: 'ORDER_CONFIRMED',
  DISPATCHED: 'ORDER_DISPATCHED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  FAILED_DELIVERY: 'FAILED_DELIVERY',
};

export async function updateOrderStatus(orderId: string, formData: FormData) {
  const session = await requireSession('orders');
  const status = formData.get('status') as OrderStatus;
  const note = String(formData.get('note') ?? '');

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { office: true } });
  if (order.status === status) return;

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status } });
    await tx.orderStatusHistory.create({ data: { orderId, status, note: note || null, userId: session.user.id } });

    const strategy = order.office.inventoryStrategy;
    const totalQty = order.quantityPaid + order.quantityFree;
    const netDeducted = await getOrderNetDeduction(tx, orderId);

    if (status === 'CONFIRMED' && strategy === 'DEDUCT_ON_CONFIRM' && netDeducted === 0) {
      await recordInventoryMovement(tx, {
        productId: order.productId,
        officeId: order.officeId,
        type: 'ORDER_CONFIRMATION_DEDUCTION',
        quantity: -totalQty,
        reason: `Confirmed order ${order.orderNumber}`,
        orderId,
        userId: session.user.id,
      });
    } else if (status === 'DISPATCHED' && strategy === 'DEDUCT_ON_DISPATCH' && netDeducted === 0) {
      await recordInventoryMovement(tx, {
        productId: order.productId,
        officeId: order.officeId,
        type: 'ORDER_DISPATCH_DEDUCTION',
        quantity: -totalQty,
        reason: `Dispatched order ${order.orderNumber}`,
        orderId,
        userId: session.user.id,
      });
    } else if (['CANCELLED', 'RETURNED', 'FAILED_DELIVERY'].includes(status) && netDeducted > 0) {
      await recordInventoryMovement(tx, {
        productId: order.productId,
        officeId: order.officeId,
        type: 'ORDER_CANCELLATION',
        quantity: netDeducted,
        reason: `${status === 'CANCELLED' ? 'Cancelled' : status === 'RETURNED' ? 'Returned' : 'Failed delivery for'} order ${order.orderNumber}`,
        orderId,
        userId: session.user.id,
      });
    }
  });

  await logAudit({ userId: session.user.id, action: 'STATUS_CHANGE', resource: 'Order', resourceId: orderId, before: { status: order.status }, after: { status } });

  const emailKey = STATUS_EMAIL_MAP[status];
  if (emailKey) {
    void sendOrderStatusEmail(orderId, emailKey).catch((e) => console.error('[orders] status email failed', e));
  }

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
  const session = await requireSession('orders');
  await db.order.update({ where: { id: orderId }, data: { paymentStatus } });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'Order', resourceId: orderId, after: { paymentStatus } });
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function updateInternalNotes(orderId: string, formData: FormData) {
  const session = await requireSession('orders');
  const internalNotes = String(formData.get('internalNotes') ?? '');
  await db.order.update({ where: { id: orderId }, data: { internalNotes } });
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'Order', resourceId: orderId, after: { internalNotes } });
  revalidatePath(`/admin/orders/${orderId}`);
}
