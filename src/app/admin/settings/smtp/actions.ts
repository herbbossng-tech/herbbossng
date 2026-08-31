'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireSession, logAudit } from '@/lib/require-session';
import { encryptSecret } from '@/lib/crypto';
import { testSmtpConnection } from '@/lib/email/mailer';
import { sendMail } from '@/lib/email/mailer';
import { renderEmailShell } from '@/lib/email/render';

const smtpSchema = z.object({
  officeId: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1),
  username: z.string().min(1),
  password: z.string().optional(),
  encryption: z.enum(['tls', 'ssl', 'none']),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function saveSmtpSettings(formData: FormData) {
  const session = await requireSession('settings');
  const raw = Object.fromEntries(formData.entries());
  const data = smtpSchema.parse({ ...raw, isActive: formData.get('isActive') === 'on' });

  const existing = await db.smtpSetting.findUnique({ where: { officeId: data.officeId } });

  await db.smtpSetting.upsert({
    where: { officeId: data.officeId },
    create: {
      officeId: data.officeId,
      host: data.host,
      port: data.port,
      username: data.username,
      encryptedPassword: encryptSecret(data.password || ''),
      encryption: data.encryption,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo || null,
      isActive: data.isActive ?? false,
    },
    update: {
      host: data.host,
      port: data.port,
      username: data.username,
      ...(data.password ? { encryptedPassword: encryptSecret(data.password) } : {}),
      encryption: data.encryption,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo || null,
      isActive: data.isActive ?? false,
    },
  });

  await logAudit({
    userId: session.user.id,
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'SmtpSetting',
    resourceId: data.officeId,
    after: { ...data, password: undefined },
  });
  revalidatePath('/admin/settings/smtp');
}

export async function testConnection(officeId: string) {
  await requireSession('settings');
  return testSmtpConnection(officeId);
}

export async function sendTestEmail(officeId: string, to: string) {
  const session = await requireSession('settings');
  const office = await db.office.findUniqueOrThrow({ where: { id: officeId } });
  const html = renderEmailShell({
    brandName: office.name,
    primaryColor: '#0f3d2e',
    headerText: 'TEST EMAIL',
    bodyHtml: `<p>This is a test email from your COD Commerce SMTP configuration for <strong>${office.name}</strong>. If you received this, your SMTP settings are working.</p>`,
    footerText: office.name,
  });
  const result = await sendMail(officeId, { to, subject: 'Test email — COD Commerce', html });
  await logAudit({ userId: session.user.id, action: 'TEST', resource: 'SmtpSetting', resourceId: officeId, after: { to, result } });
  return result;
}
