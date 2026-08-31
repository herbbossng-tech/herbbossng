import { db } from '@/lib/db';
import { PageHeader, Card, Input, Label, Select, Button } from '@/components/ui';
import { saveSmtpSettings } from './actions';
import { SmtpTestPanel } from './smtp-test-panel';
import { requirePageAccess } from '@/lib/require-page-access';

export default async function SmtpSettingsPage() {
  await requirePageAccess('settings');
  const offices = await db.office.findMany({ orderBy: { sortOrder: 'asc' }, include: { smtpSettings: true } });

  return (
    <div>
      <PageHeader title="SMTP Settings" description="Works with Mailgun, Gmail, Hostinger, Brevo, SendGrid, or any custom SMTP provider." />
      <div className="flex flex-col gap-6">
        {offices.map((office) => {
          const smtp = office.smtpSettings;
          return (
            <Card key={office.id}>
              <p className="mb-3 font-semibold text-brand-dark">{office.name}</p>
              <form action={saveSmtpSettings} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input type="hidden" name="officeId" value={office.id} />
                <div>
                  <Label required>SMTP Host</Label>
                  <Input name="host" defaultValue={smtp?.host} required placeholder="smtp.mailgun.org" />
                </div>
                <div>
                  <Label required>Port</Label>
                  <Input type="number" name="port" defaultValue={smtp?.port ?? 587} required />
                </div>
                <div>
                  <Label required>Username</Label>
                  <Input name="username" defaultValue={smtp?.username} required />
                </div>
                <div>
                  <Label>Password {smtp ? '(leave blank to keep current)' : ''}</Label>
                  <Input type="password" name="password" placeholder={smtp ? '••••••••' : ''} />
                </div>
                <div>
                  <Label required>Encryption</Label>
                  <Select name="encryption" defaultValue={smtp?.encryption ?? 'tls'}>
                    <option value="tls">TLS</option>
                    <option value="ssl">SSL</option>
                    <option value="none">None</option>
                  </Select>
                </div>
                <div>
                  <Label required>From name</Label>
                  <Input name="fromName" defaultValue={smtp?.fromName ?? office.name} required />
                </div>
                <div>
                  <Label required>From email</Label>
                  <Input type="email" name="fromEmail" defaultValue={smtp?.fromEmail ?? office.officeEmail ?? ''} required />
                </div>
                <div>
                  <Label>Reply-to</Label>
                  <Input type="email" name="replyTo" defaultValue={smtp?.replyTo ?? ''} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" name="isActive" id={`active-${office.id}`} defaultChecked={smtp?.isActive} />
                  <label htmlFor={`active-${office.id}`} className="text-sm text-brand-dark">Active</label>
                </div>
                <div className="col-span-full">
                  <Button type="submit">Save SMTP settings</Button>
                </div>
              </form>
              {smtp?.isActive && <SmtpTestPanel officeId={office.id} />}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
