import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';

export async function getTransportForOffice(officeId: string) {
  const smtp = await db.smtpSetting.findUnique({ where: { officeId } });
  if (!smtp || !smtp.isActive) return null;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.encryption === 'ssl',
    auth: { user: smtp.username, pass: decryptSecret(smtp.encryptedPassword) },
  });

  return { transporter, smtp };
}

export async function sendMail(officeId: string, mail: { to: string; subject: string; html: string }) {
  const ctx = await getTransportForOffice(officeId);
  if (!ctx) {
    console.warn(`[email] SMTP not configured/active for office ${officeId} — skipping send to ${mail.to}`);
    return { sent: false, reason: 'SMTP not configured or inactive for this office' };
  }
  const { transporter, smtp } = ctx;
  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    replyTo: smtp.replyTo ?? undefined,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
  });
  return { sent: true };
}

export async function testSmtpConnection(officeId: string) {
  const ctx = await getTransportForOffice(officeId);
  if (!ctx) return { ok: false, error: 'SMTP is not active for this office' };
  try {
    await ctx.transporter.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Connection failed' };
  }
}
