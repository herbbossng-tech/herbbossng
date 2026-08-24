"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const officeSchema = z.object({
  name: z.string().min(2),
  countryCode: z.string().length(2).toUpperCase(),
  currencyCode: z.string().min(2).max(6).toUpperCase(),
  currencySymbol: z.string().min(1).max(6),
  symbolPosition: z.enum(["before", "after"]),
  decimalDigits: z.coerce.number().int().min(0).max(4),
  thousandSeparator: z.string().max(2),
  decimalSeparator: z.string().max(2),
  divisionLabel: z.string().min(2),
  phoneCountryCode: z.string().min(1),
  phoneRegex: z.string().min(1),
  orderPrefix: z.string().min(2).max(12).toUpperCase(),
  timezone: z.string().min(1),
  dateFormat: z.string().min(1),
  language: z.string().min(2),
  defaultDeliveryFee: z.coerce.number().min(0),
  freeDeliveryThreshold: z.coerce.number().min(0).optional().or(z.literal("")),
  inventoryStrategy: z.enum(["RESERVATION", "CONFIRMATION", "DISPATCH"]),
  officeAddress: z.string().optional(),
  officePhone: z.string().optional(),
  officeEmail: z.string().email().optional().or(z.literal("")),
  whatsappNumber: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

function parseFormData(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return officeSchema.parse({
    ...raw,
    isActive: formData.get("isActive") === "on",
    freeDeliveryThreshold: raw.freeDeliveryThreshold || undefined,
  });
}

export async function createOffice(formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "offices");
  const data = parseFormData(formData);

  const office = await prisma.office.create({
    data: {
      ...data,
      freeDeliveryThreshold: data.freeDeliveryThreshold === "" ? null : data.freeDeliveryThreshold,
      isActive: data.isActive ?? true,
    },
  });

  await recordAudit({
    userId: session.userId,
    action: "office.create",
    resource: "Office",
    resourceId: office.id,
    after: office,
  });

  revalidatePath("/admin/offices");
  redirect(`/admin/offices/${office.id}`);
}

export async function updateOffice(officeId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "offices");
  const data = parseFormData(formData);
  const before = await prisma.office.findUniqueOrThrow({ where: { id: officeId } });

  const office = await prisma.office.update({
    where: { id: officeId },
    data: {
      ...data,
      freeDeliveryThreshold: data.freeDeliveryThreshold === "" ? null : data.freeDeliveryThreshold,
      isActive: data.isActive ?? false,
    },
  });

  await recordAudit({
    userId: session.userId,
    action: "office.update",
    resource: "Office",
    resourceId: office.id,
    before,
    after: office,
  });

  revalidatePath("/admin/offices");
  revalidatePath(`/admin/offices/${officeId}`);
}

const divisionSchema = z.object({ name: z.string().min(1), sortOrder: z.coerce.number().int().default(0) });

export async function addDivision(officeId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "offices");
  const data = divisionSchema.parse(Object.fromEntries(formData.entries()));
  await prisma.locationDivision.create({ data: { officeId, ...data } });
  await recordAudit({ userId: session.userId, action: "division.create", resource: "LocationDivision", after: data });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function deleteDivision(officeId: string, divisionId: string) {
  const session = await requireSession();
  assertAccess(session, "offices");
  await prisma.locationDivision.delete({ where: { id: divisionId } });
  await recordAudit({ userId: session.userId, action: "division.delete", resource: "LocationDivision", resourceId: divisionId });
  revalidatePath(`/admin/offices/${officeId}`);
}

const citySchema = z.object({ divisionId: z.string().min(1), name: z.string().min(1) });

export async function addCity(officeId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "offices");
  const data = citySchema.parse(Object.fromEntries(formData.entries()));
  await prisma.city.create({ data });
  await recordAudit({ userId: session.userId, action: "city.create", resource: "City", after: data });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function deleteCity(officeId: string, cityId: string) {
  const session = await requireSession();
  assertAccess(session, "offices");
  await prisma.city.delete({ where: { id: cityId } });
  await recordAudit({ userId: session.userId, action: "city.delete", resource: "City", resourceId: cityId });
  revalidatePath(`/admin/offices/${officeId}`);
}

const zoneSchema = z.object({
  name: z.string().min(1),
  divisionId: z.string().optional(),
  cityId: z.string().optional(),
  fee: z.coerce.number().min(0),
  isFree: z.coerce.boolean().optional(),
  estimatedDays: z.string().optional(),
});

export async function addDeliveryZone(officeId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "delivery");
  const raw = Object.fromEntries(formData.entries());
  const data = zoneSchema.parse({ ...raw, isFree: formData.get("isFree") === "on" });
  await prisma.deliveryZone.create({
    data: {
      officeId,
      name: data.name,
      divisionId: data.divisionId || null,
      cityId: data.cityId || null,
      fee: data.isFree ? 0 : data.fee,
      isFree: !!data.isFree,
      estimatedDays: data.estimatedDays || null,
    },
  });
  await recordAudit({ userId: session.userId, action: "delivery_zone.create", resource: "DeliveryZone", after: data });
  revalidatePath(`/admin/offices/${officeId}`);
}

export async function deleteDeliveryZone(officeId: string, zoneId: string) {
  const session = await requireSession();
  assertAccess(session, "delivery");
  await prisma.deliveryZone.delete({ where: { id: zoneId } });
  await recordAudit({ userId: session.userId, action: "delivery_zone.delete", resource: "DeliveryZone", resourceId: zoneId });
  revalidatePath(`/admin/offices/${officeId}`);
}
