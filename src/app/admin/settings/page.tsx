import { PageHeader, Card } from '@/components/ui';
import Link from 'next/link';
import { requirePageAccess } from '@/lib/require-page-access';

const SECTIONS = [
  { href: '/admin/settings/smtp', title: 'SMTP', description: 'Email delivery configuration per office. Test connection, send test email.' },
  { href: '/admin/settings/email-templates', title: 'Email Templates', description: 'Edit subject, body, variables for order notification emails.' },
  { href: '/admin/settings/tracking', title: 'Tracking', description: 'Meta Pixel, Conversions API, and Google Analytics 4.' },
  { href: '/admin/audit-logs', title: 'Audit Logs', description: 'Every admin mutation: who, what, when, before/after.' },
];

export default async function SettingsPage() {
  await requirePageAccess('settings');
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="transition hover:shadow-cardSelected">
              <p className="font-semibold text-brand-dark">{s.title}</p>
              <p className="mt-1 text-sm text-brand-dark/50">{s.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
