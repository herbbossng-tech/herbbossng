"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const adjustSchema = z.object({
  productOfficeId: z.string().min(1),
  type: z.enum(["PURCHASE", "STOCK_ADDITION", "MANUAL_ADJUSTMENT", "RETURN", "DAMAGED", "OTHER"]),
  quantity: z.coerce.number().int(),
  reason: z.string().optional(),
});

export async function adjustInventory(formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "inventory");
  const data = adjustSchema.parse(Object.fromEntries(formData.entries()));

  const inventory = await prisma.inventory.findUnique({ where: { productOfficeId: data.productOfficeId } });
  if (!inventory) throw new Error("Inventory record not found");

  await prisma.inventory.update({
    where: { id: inventory.id },
    data: {
      quantityOnHand: { increment: data.quantity },
      movements: {
        create: {
          type: data.type,
          quantity: data.quantity,
          reason: data.reason || null,
          createdByUserId: session.userId,
        },
      },
    },
  });

  await recordAudit({ userId: session.userId, action: "inventory.adjust", resource: "Inventory", resourceId: inventory.id, after: data });
  revalidatePath("/admin/inventory");
}
