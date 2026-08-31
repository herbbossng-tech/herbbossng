'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';

const officeSchema = z.object({
  name: z.string().min(1),
  countryCode: z.string().min(2).max(3).toUpperCase(),
  currencyCode: z.string().min(3).max(3).toUpperCase(),
  currencySymbol: z.string().min(1),
  currencySymbolPosition: z.enum(['BEFORE', 'AFTER']),
  currencyDecimalPlaces: z.coerce.number().int().min(0).max(4),
  currencyThousandSep: z.string().min(0).max(2),
  currencyDecimalSep: z.string().min(0).max(2),
  phoneCountryCode: z.string().min(1),
  phoneRegex: z.string().min(1),
  divisionLabel: z.string().min(1),
  timezone: z.string().min(1),
  locale: z.string().min(1),
  orderNumberPrefix: z.string().min(1).max(6).toUpperCase(),
  defaultDeliveryFee: z.coerce.number().min(0),
  freeDeliveryThreshold: z.coerce.number().min(0).optional().or(z.literal('')),
  taxLabel: z.string().optional(),
  taxRate: z.coerce.number().min(0).max(100),
  inventoryStrategy: z.enum(['RESERVE_ON_ORDER', 'DEDUCT_ON_CONFIRM', 'DEDUCT_ON_DISPATCH']),
  officeAddress: z.string().optional(),
  officeEmail: z.string().optional(),
  officePhone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  whatsappCtaText: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return officeSchema.parse({ ...raw, isActive: formData.get('isActive') === 'on' });
}

export async function createOffice(formData: FormData) {
  const session = await requireSession('offices');
  const data = parseForm(formData);

  const office = await db.office.create({
    data: {
      ...data,
      freeDeliveryThreshold: data.freeDeliveryThreshold === '' ? null : data.freeDeliveryThreshold,
    },
  });

  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'Office', resourceId: office.id, after: data });
  revalidatePath('/admin/offices');
  redirect(`/admin/offices/${office.id}`);
}

export async function updateOffice(officeId: string, formData: FormData) {
  const session = await requireSession('offices');
  const data = parseForm(formData);
  const before = await db.office.findUnique({ where: { id: officeId } });

  await db.office.update({
    where: { id: officeId },
    data: {
      ...data,
      freeDeliveryThreshold: data.freeDeliveryThreshold === '' ? null : data.freeDeliveryThreshold,
    },
  });

  await logAudit({ userId: session.user.id, action: 'UPDATE', resource: 'Office', resourceId: officeId, before, after: data });
  revalidatePath('/admin/offices');
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function createDivision(officeId: string, formData: FormData) {
  const session = await requireSession('offices');
  const name = String(formData.get('name') ?? '');
  const division = await db.division.create({ data: { officeId, name } });
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'Division', resourceId: division.id, after: { name } });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function deleteDivision(officeId: string, divisionId: string) {
  const session = await requireSession('offices');
  await db.division.delete({ where: { id: divisionId } });
  await logAudit({ userId: session.user.id, action: 'DELETE', resource: 'Division', resourceId: divisionId });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function createCity(officeId: string, divisionId: string, formData: FormData) {
  const session = await requireSession('offices');
  const name = String(formData.get('name') ?? '');
  const city = await db.city.create({ data: { divisionId, name } });
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'City', resourceId: city.id, after: { name } });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function deleteCity(officeId: string, cityId: string) {
  const session = await requireSession('offices');
  await db.city.delete({ where: { id: cityId } });
  await logAudit({ userId: session.user.id, action: 'DELETE', resource: 'City', resourceId: cityId });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function createDeliveryArea(officeId: string, cityId: string, name: string, fee?: string) {
  const session = await requireSession('offices');
  const area = await db.deliveryArea.create({
    data: { cityId, name, fee: fee ? Number(fee) : null },
  });
  await logAudit({ userId: session.user.id, action: 'CREATE', resource: 'DeliveryArea', resourceId: area.id, after: { name, fee } });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function deleteDeliveryArea(officeId: string, areaId: string) {
  const session = await requireSession('offices');
  await db.deliveryArea.delete({ where: { id: areaId } });
  await logAudit({ userId: session.user.id, action: 'DELETE', resource: 'DeliveryArea', resourceId: areaId });
  revalidatePath(`/admin/offices/${officeId}`);
}
