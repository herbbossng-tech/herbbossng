'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';
import type { EmailTemplateKey } from '@prisma/client';

const templateSchema = z.object({
  officeId: z.string().min(1),
  key: z.string().min(1),
  subject: z.string().min(1),
  previewText: z.string().optional(),
  headerText: z.string().optional(),
  bodyHtml: z.string().min(1),
  footerText: z.string().optional(),
  brandName: z.string().min(1),
  logoUrl: z.string().optional(),
  primaryColor: z.string().min(1),
  buttonText: z.string().optional(),
  buttonUrl: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function saveEmailTemplate(formData: FormData) {
  const session = await requireSession('settings');
  const raw = Object.fromEntries(formData.entries());
  const data = templateSchema.parse({ ...raw, isActive: formData.get('isActive') === 'on' });
  const key = data.key as EmailTemplateKey;

  await db.emailTemplate.upsert({
    where: { officeId_key: { officeId: data.officeId, key } },
    create: { ...data, key, isActive: data.isActive ?? true },
    update: { ...data, key, isActive: data.isActive ?? true },
  });

  await logAudit({ userId: session.user.id, action: 'UPSERT', resource: 'EmailTemplate', resourceId: `${data.officeId}:${key}`, after: data });
  revalidatePath('/admin/settings/email-templates');
}
