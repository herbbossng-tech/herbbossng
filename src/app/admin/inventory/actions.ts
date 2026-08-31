'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';
import { recordInventoryMovement } from '@/lib/inventory';

export async function adjustInventory(productId: string, officeId: string, formData: FormData) {
  const session = await requireSession('inventory');
  const quantity = Number(formData.get('quantity'));
  const type = String(formData.get('type') ?? 'MANUAL_ADJUSTMENT') as
    | 'STOCK_ADDITION'
    | 'MANUAL_ADJUSTMENT'
    | 'DAMAGED'
    | 'RETURN'
    | 'OTHER';
  const reason = String(formData.get('reason') ?? '');

  if (!quantity) return;

  await db.$transaction(async (tx) => {
    await recordInventoryMovement(tx, { productId, officeId, type, quantity, reason: reason || undefined, userId: session.user.id });
  });

  await logAudit({ userId: session.user.id, action: 'ADJUST', resource: 'Inventory', resourceId: `${productId}:${officeId}`, after: { quantity, type, reason } });
  revalidatePath('/admin/inventory');
}
