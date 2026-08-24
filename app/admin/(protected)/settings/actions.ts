"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { sendTestEmail } from "@/lib/email";

const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().optional(),
  encryption: z.enum(["NONE", "SSL", "TLS"]),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
});

export async function saveSmtpSettings(officeId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "settings");
  const raw = Object.fromEntries(formData.entries());
  const data = smtpSchema.parse({ ...raw, isActive: formData.get("isActive") === "on" });

  const existing = await prisma.smtpSetting.findUnique({ where: { officeId } });

  if (!data.password && !existing) {
    throw new Error("Password is required when configuring SMTP for the first time");
  }

  await prisma.smtpSetting.upsert({
    where: { officeId },
    update: {
      host: data.host,
      port: data.port,
      username: data.username,
      ...(data.password ? { passwordEncrypted: encryptSecret(data.password) } : {}),
      encryption: data.encryption,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo || null,
      isActive: data.isActive ?? true,
    },
    create: {
      officeId,
      host: data.host,
      port: data.port,
      username: data.username,
      passwordEncrypted: encryptSecret(data.password!),
      encryption: data.encryption,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo || null,
      isActive: data.isActive ?? true,
    },
  });

  await recordAudit({ userId: session.userId, action: "smtp_setting.save", resource: "SmtpSetting", resourceId: officeId, after: { ...data, password: "[redacted]" } });
  revalidatePath("/admin/settings");
}

export async function testSmtpConnection(officeId: string, testRecipient: string) {
  const session = await requireSession();
  assertAccess(session, "settings");

  try {
    await sendTestEmail(officeId, testRecipient);
    await prisma.smtpSetting.update({ where: { officeId }, data: { lastTestedAt: new Date(), lastTestResult: "success" } });
    await recordAudit({ userId: session.userId, action: "smtp_setting.test", resource: "SmtpSetting", resourceId: officeId, after: { result: "success" } });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.smtpSetting.update({ where: { officeId }, data: { lastTestedAt: new Date(), lastTestResult: `failed: ${message}` } }).catch(() => {});
    await recordAudit({ userId: session.userId, action: "smtp_setting.test", resource: "SmtpSetting", resourceId: officeId, after: { result: "failed", message } });
    revalidatePath("/admin/settings");
    return { ok: false, error: message };
  }
}

const trackingSchema = z.object({
  metaPixelId: z.string().optional(),
  metaAccessToken: z.string().optional(),
  metaDatasetId: z.string().optional(),
  metaCapiEnabled: z.coerce.boolean().optional(),
  ga4MeasurementId: z.string().optional(),
});

export async function saveTrackingSettings(officeId: string, formData: FormData) {
  const session = await requireSession();
  assertAccess(session, "marketing");
  const raw = Object.fromEntries(formData.entries());
  const data = trackingSchema.parse({ ...raw, metaCapiEnabled: formData.get("metaCapiEnabled") === "on" });

  const existing = await prisma.trackingSetting.findUnique({ where: { officeId } });

  await prisma.trackingSetting.upsert({
    where: { officeId },
    update: {
      metaPixelId: data.metaPixelId || null,
      ...(data.metaAccessToken ? { metaAccessTokenEncrypted: encryptSecret(data.metaAccessToken) } : {}),
      metaDatasetId: data.metaDatasetId || null,
      metaCapiEnabled: data.metaCapiEnabled ?? false,
      ga4MeasurementId: data.ga4MeasurementId || null,
    },
    create: {
      officeId,
      metaPixelId: data.metaPixelId || null,
      metaAccessTokenEncrypted: data.metaAccessToken ? encryptSecret(data.metaAccessToken) : null,
      metaDatasetId: data.metaDatasetId || null,
      metaCapiEnabled: data.metaCapiEnabled ?? false,
      ga4MeasurementId: data.ga4MeasurementId || null,
    },
  });

  await recordAudit({
    userId: session.userId,
    action: "tracking_setting.save",
    resource: "TrackingSetting",
    resourceId: officeId,
    after: { ...data, metaAccessToken: existing ? "[updated]" : undefined },
  });
  revalidatePath("/admin/marketing");
}
