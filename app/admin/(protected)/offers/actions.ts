"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const offerSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["FIXED_QUANTITY", "BUY_X_GET_Y_FREE", "PERCENTAGE_DISCOUNT", "FIXED_DISCOUNT"]),
  title: z.string().min(2),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  badge: z.string().optional(),
  badgeColor: z.string().optional(),
  paidQuantity: z.coerce.number().int().min(1),
  freeQuantity: z.coerce.number().int().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  discountAmount: z.coerce.number().min(0).optional().or(z.literal("")),
  isDefault: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return offerSchema.parse({
    ...raw,
    isDefault: formData.get("isDefault") === "on",
    isActive: formData.get("isActive") === "on",
  });
}

export async function createOffer(formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "offers");
  const data = parse(formData);

  if (data.isDefault) {
    await prisma.offer.updateMany({ where: { productId: data.productId }, data: { isDefault: false } });
  }

  const offer = await prisma.offer.create({
    data: {
      ...data,
      discountPercent: data.discountPercent === "" ? null : data.discountPercent,
      discountAmount: data.discountAmount === "" ? null : data.discountAmount,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
    },
  });

  await recordAudit({ userId: session.userId, action: "offer.create", resource: "Offer", resourceId: offer.id, after: offer });
  revalidatePath(`/admin/products/${data.productId}`);
  redirect(`/admin/offers/${offer.id}`);
}

export async function updateOffer(offerId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "offers");
  const data = parse(formData);
  const before = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });

  if (data.isDefault) {
    await prisma.offer.updateMany({ where: { productId: data.productId, id: { not: offerId } }, data: { isDefault: false } });
  }

  const offer = await prisma.offer.update({
    where: { id: offerId },
    data: {
      ...data,
      discountPercent: data.discountPercent === "" ? null : data.discountPercent,
      discountAmount: data.discountAmount === "" ? null : data.discountAmount,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
    },
  });

  await recordAudit({ userId: session.userId, action: "offer.update", resource: "Offer", resourceId: offer.id, before, after: offer });
  revalidatePath(`/admin/products/${data.productId}`);
  revalidatePath(`/admin/offers/${offerId}`);
}

export async function deleteOffer(productId: string, offerId: string) {
  const session = await requireSession();
  assertAccess(session, "offers");
  await prisma.offer.delete({ where: { id: offerId } });
  await recordAudit({ userId: session.userId, action: "offer.delete", resource: "Offer", resourceId: offerId });
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}`);
}

const officePriceSchema = z.object({
  officeId: z.string().min(1),
  price: z.coerce.number().min(0),
  compareAtPrice: z.coerce.number().min(0).optional().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertOfferOfficePricing(offerId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "offers");
  const raw = Object.fromEntries(formData.entries());
  const data = officePriceSchema.parse({ ...raw, isActive: formData.get("isActive") === "on" });

  await prisma.offerOffice.upsert({
    where: { offerId_officeId: { offerId, officeId: data.officeId } },
    update: {
      price: data.price,
      compareAtPrice: data.compareAtPrice === "" ? null : data.compareAtPrice,
      isActive: data.isActive ?? true,
    },
    create: {
      offerId,
      officeId: data.officeId,
      price: data.price,
      compareAtPrice: data.compareAtPrice === "" ? null : data.compareAtPrice,
      isActive: data.isActive ?? true,
    },
  });

  await recordAudit({ userId: session.userId, action: "offer_office.upsert", resource: "OfferOffice", resourceId: offerId, after: data });
  revalidatePath(`/admin/offers/${offerId}`);
}
