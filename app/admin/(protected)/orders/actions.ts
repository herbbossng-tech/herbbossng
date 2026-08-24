"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { sendOrderStatusEmail } from "@/lib/email";
import type { OrderStatus, PaymentStatus } from "@/app/generated/prisma/enums";

const statusSchema = z.object({
  status: z.enum([
    "NEW", "PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "PACKED", "DISPATCHED",
    "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED", "FAILED_DELIVERY",
  ]),
  note: z.string().optional(),
});

export async function updateOrderStatus(orderId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "orders");
  const raw = Object.fromEntries(formData.entries());
  const data = statusSchema.parse(raw);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { office: true, items: true } });
  const previousStatus = order.status;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: data.status } });
    await tx.orderStatusHistory.create({
      data: { orderId, status: data.status, note: data.note || null, changedByUserId: session.userId },
    });

    await applyInventoryForStatusChange(tx, order.officeId, order.items, previousStatus, data.status);
  });

  await recordAudit({
    userId: session.userId,
    action: "order.status_change",
    resource: "Order",
    resourceId: orderId,
    before: { status: previousStatus },
    after: { status: data.status },
  });

  const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  void sendOrderStatusEmail(updatedOrder, order.office).catch((e) => console.error("status email failed:", e));

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
}

// Applies the office's configured inventory deduction strategy as an order
// moves through the workflow (brief §27) — never let an order be dispatched
// twice without deducting stock twice, and always restore stock on cancel.
async function applyInventoryForStatusChange(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  officeId: string,
  items: { productId: string; paidQuantity: number; freeQuantity: number }[],
  from: OrderStatus,
  to: OrderStatus,
) {
  const office = await tx.office.findUniqueOrThrow({ where: { id: officeId } });

  for (const item of items) {
    const productOffice = await tx.productOffice.findUnique({ where: { productId_officeId: { productId: item.productId, officeId } } });
    if (!productOffice) continue;
    const inventory = await tx.inventory.findUnique({ where: { productOfficeId: productOffice.id } });
    if (!inventory) continue;
    const quantity = item.paidQuantity + item.freeQuantity;

    if (to === "CANCELLED" && from !== "CANCELLED") {
      // Release whatever was held for this order back into available stock.
      if (office.inventoryStrategy === "RESERVATION") {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            quantityReserved: { decrement: quantity },
            movements: { create: { type: "ORDER_CANCELLATION", quantity, reason: "Order cancelled" } },
          },
        });
      } else {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            quantityOnHand: { increment: quantity },
            movements: { create: { type: "ORDER_CANCELLATION", quantity, reason: "Order cancelled — stock restored" } },
          },
        });
      }
      continue;
    }

    if (office.inventoryStrategy === "CONFIRMATION" && to === "CONFIRMED" && from !== "CONFIRMED") {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          quantityOnHand: { decrement: quantity },
          movements: { create: { type: "ORDER_CONFIRMATION_DEDUCTION", quantity: -quantity, reason: "Order confirmed" } },
        },
      });
    }

    if (office.inventoryStrategy === "DISPATCH" && to === "DISPATCHED" && from !== "DISPATCHED") {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          quantityOnHand: { decrement: quantity },
          movements: { create: { type: "ORDER_DISPATCH_DEDUCTION", quantity: -quantity, reason: "Order dispatched" } },
        },
      });
    }
  }
}

const paymentSchema = z.object({ paymentStatus: z.enum(["COD_PENDING", "COD_COLLECTED", "REFUNDED", "NOT_APPLICABLE"]) });

export async function updatePaymentStatus(orderId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "orders");
  const data = paymentSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: data.paymentStatus as PaymentStatus } });
  await recordAudit({ userId: session.userId, action: "order.payment_status_change", resource: "Order", resourceId: orderId, after: data });
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function updateInternalNotes(orderId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "orders");
  const notes = String(formData.get("internalNotes") ?? "");
  await prisma.order.update({ where: { id: orderId }, data: { internalNotes: notes } });
  await recordAudit({ userId: session.userId, action: "order.notes_update", resource: "Order", resourceId: orderId });
  revalidatePath(`/admin/orders/${orderId}`);
}
