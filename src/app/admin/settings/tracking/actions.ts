'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';
import { encryptSecret } from '@/lib/crypto';

const trackingSchema = z.object({
  officeId: z.string().min(1),
  metaPixelId: z.string().optional(),
  metaAccessToken: z.string().optional(),
  metaDatasetId: z.string().optional(),
  metaCapiEnabled: z.coerce.boolean().optional(),
  ga4MeasurementId: z.string().optional(),
  ga4ApiSecret: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function saveTrackingSettings(formData: FormData) {
  const session = await requireSession('settings');
  const raw = Object.fromEntries(formData.entries());
  const data = trackingSchema.parse({
    ...raw,
    metaCapiEnabled: formData.get('metaCapiEnabled') === 'on',
    isActive: formData.get('isActive') === 'on',
  });

  const existing = await db.trackingSetting.findUnique({ where: { officeId: data.officeId } });

  await db.trackingSetting.upsert({
    where: { officeId: data.officeId },
    create: {
      officeId: data.officeId,
      metaPixelId: data.metaPixelId || null,
      metaEncryptedAccessToken: data.metaAccessToken ? encryptSecret(data.metaAccessToken) : null,
      metaDatasetId: data.metaDatasetId || null,
      metaCapiEnabled: data.metaCapiEnabled ?? false,
      ga4MeasurementId: data.ga4MeasurementId || null,
      ga4ApiSecret: data.ga4ApiSecret || null,
      isActive: data.isActive ?? false,
    },
    update: {
      metaPixelId: data.metaPixelId || null,
      ...(data.metaAccessToken ? { metaEncryptedAccessToken: encryptSecret(data.metaAccessToken) } : {}),
      metaDatasetId: data.metaDatasetId || null,
      metaCapiEnabled: data.metaCapiEnabled ?? false,
      ga4MeasurementId: data.ga4MeasurementId || null,
      ga4ApiSecret: data.ga4ApiSecret || null,
      isActive: data.isActive ?? false,
    },
  });

  await logAudit({
    userId: session.user.id,
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'TrackingSetting',
    resourceId: data.officeId,
    after: { ...data, metaAccessToken: undefined, ga4ApiSecret: undefined },
  });
  revalidatePath('/admin/settings/tracking');
}
