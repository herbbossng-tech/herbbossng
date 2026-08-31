import type { Prisma } from '@prisma/client';

/**
 * Every stock change goes through here so it always produces an audit row.
 * Runs inside the caller's transaction. Throws if a decrease would push
 * stock below zero for a tracked product (prevents overselling).
 */
export async function recordInventoryMovement(
  tx: Prisma.TransactionClient,
  params: {
    productId: string;
    officeId: string;
    type:
      | 'PURCHASE'
      | 'STOCK_ADDITION'
      | 'MANUAL_ADJUSTMENT'
      | 'ORDER_RESERVATION'
      | 'ORDER_CANCELLATION'
      | 'ORDER_CONFIRMATION_DEDUCTION'
      | 'ORDER_DISPATCH_DEDUCTION'
      | 'RETURN'
      | 'DAMAGED'
      | 'OTHER';
    quantity: number; // signed
    reason?: string;
    orderId?: string;
    userId?: string;
  }
) {
  const productOffice = await tx.productOffice.findUnique({
    where: { productId_officeId: { productId: params.productId, officeId: params.officeId } },
  });
  if (!productOffice) throw new Error('Product is not configured for this office');

  if (productOffice.trackInventory) {
    const nextStock = productOffice.stockQuantity + params.quantity;
    if (nextStock < 0) {
      throw new Error('Insufficient stock for this operation');
    }
    await tx.productOffice.update({
      where: { id: productOffice.id },
      data: { stockQuantity: nextStock },
    });
  }

  await tx.inventoryMovement.create({
    data: {
      productId: params.productId,
      officeId: params.officeId,
      type: params.type,
      quantity: params.quantity,
      reason: params.reason,
      orderId: params.orderId,
      userId: params.userId,
    },
  });
}

/** Net stock already removed for an order (reservation and/or confirm/dispatch deductions minus any restore). */
export async function getOrderNetDeduction(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const movements = await tx.inventoryMovement.findMany({ where: { orderId } });
  const net = movements.reduce((sum, m) => sum + m.quantity, 0);
  return net < 0 ? -net : 0;
}
