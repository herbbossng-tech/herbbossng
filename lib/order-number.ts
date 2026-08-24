import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Atomically claims the next order sequence number for an office and formats
 * it as `{prefix}-{sequence}` (e.g. NG-AF-000001). Must run inside the same
 * transaction as order creation so a concurrent request can never reuse a
 * sequence number.
 */
export async function nextOrderNumber(tx: Prisma.TransactionClient, officeId: string): Promise<string> {
  const office = await tx.office.update({
    where: { id: officeId },
    data: { nextOrderSequence: { increment: 1 } },
    select: { orderPrefix: true, nextOrderSequence: true },
  });
  const sequence = office.nextOrderSequence - 1;
  return `${office.orderPrefix}-${String(sequence).padStart(6, "0")}`;
}
