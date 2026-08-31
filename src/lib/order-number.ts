import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

/**
 * Generates a human-readable, office-scoped order number like "NG-AF-000001".
 * Uses an atomic increment on Office.orderNumberSeq inside the caller's transaction
 * so concurrent orders never collide.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  officeId: string,
  brandCode = 'AF'
): Promise<string> {
  const office = await tx.office.update({
    where: { id: officeId },
    data: { orderNumberSeq: { increment: 1 } },
    select: { orderNumberPrefix: true, orderNumberSeq: true },
  });

  const seq = office.orderNumberSeq.toString().padStart(6, '0');
  return `${office.orderNumberPrefix}-${brandCode}-${seq}`;
}
