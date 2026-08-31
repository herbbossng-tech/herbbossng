'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';

const offerSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  subtitle: z.string().optional(),
  type: z.enum(['FIXED_QTY', 'BUY_X_GET_Y', 'PERCENT_DISCOUNT', 'FIXED_DISCOUNT']),
  payQty: z.coerce.number().int().min(1),
  freeQty: z.coerce.number().int().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  discountAmount: z.coerce.number().min(0).optional().or(z.literal('')),
  badgeText: z.string().optional(),
  badgeColor: z.string().optional(),
  isDefault: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = offerSchema.parse({
    ...raw,
    isDefault: formData.get('isDefault') === 'on',
    isActive: formData.get('isActive') === 'on',
  });
  return {
    productId: parsed.productId,
    name: parsed.name,
    subtitle: parsed.subtitle || null,
    type: parsed.type,
    payQty: parsed.payQty,
    freeQty: parsed.freeQty,
    discountPercent: parsed.discountPercent === '' ? null : parsed.discountPercent,
    discountAmount: parsed.discountAmount === '' ? null : parsed.discountAmount,
    badgeText: parsed.badgeText || null,
    badgeColor: parsed.badgeColor || '#b6862c',
    isDefault: parsed.isDefault ?? false,
    isActive: parsed.isActive ?? true,
    sortOrder: parsed.sortOrder,
    startDate: parsed.startDate ? new Date(parsed.startDate) : null,
    endDate: parsed.endDate ? new Date(parsed.endDate) : null,
  };
}

export async function createOffer(formData: FormData) {
  const session = await requireSession('offers');
  const data = parseForm(formData);
  const offer = await db.offer.create({ data });
  if (offer.isDefault) {
    await db.offer.updateMany({ where: { productId: offer.productId, id: { not: offer.id } }, data: { isDefault: false } });
  }
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'Offer', resourceId: offer.id, after: data });
  revalidatePath('/admin/offers');
  redirect(`/admin/offers/${offer.id}`);
}

export async function updateOffer(offerId: string, formData: FormData) {
  const session = await requireSession('offers');
  const data = parseForm(formData);
  const before = await db.offer.findUnique({ where: { id: offerId } });
  await db.offer.update({ where: { id: offerId }, data });
  if (data.isDefault) {
    await db.offer.updateMany({ where: { productId: data.productId, id: { not: offerId } }, data: { isDefault: false } });
  }
  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'Offer', resourceId: offerId, before, after: data });
  revalidatePath('/admin/offers');
  revalidatePath(`/admin/offers/${offerId}`);
}

export async function deleteOffer(offerId: string) {
  const session = await requireSession('offers');
  await db.offer.delete({ where: { id: offerId } });
  await logAudit({ userId: session.user.id, action: 'DELETE', resource: 'Offer', resourceId: offerId });
  revalidatePath('/admin/offers');
}

export async function upsertOfferOffice(offerId: string, officeId: string, formData: FormData) {
  const session = await requireSession('offers');
  const priceRaw = formData.get('price');
  const compareAtRaw = formData.get('compareAtPrice');
  const isActive = formData.get('isActive') === 'on';

  const data = {
    price: priceRaw ? Number(priceRaw) : null,
    compareAtPrice: compareAtRaw ? Number(compareAtRaw) : null,
    isActive,
  };

  const existing = await db.offerOffice.findUnique({ where: { offerId_officeId: { offerId, officeId } } });
  if (existing) {
    await db.offerOffice.update({ where: { id: existing.id }, data });
  } else {
    await db.offerOffice.create({ data: { offerId, officeId, ...data } });
  }
  await logAudit({
    userId: session.user.id,
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'OfferOffice',
    resourceId: existing?.id ?? `${offerId}:${officeId}`,
    before: existing,
    after: data,
  });
  revalidatePath(`/admin/offers/${offerId}`);
}
