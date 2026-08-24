import { getCurrentAdminOffice } from "@/lib/office-context";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SmtpTestButton } from "@/components/admin/SmtpTestButton";
import { saveSmtpSettings } from "./actions";

export default async function SettingsPage() {
  const office = await getCurrentAdminOffice();
  if (!office) return <p className="text-sm text-zinc-500">Create an office first.</p>;

  const smtp = await prisma.smtpSetting.findUnique({ where: { officeId: office.id } });
  const saveWithId = saveSmtpSettings.bind(null, office.id);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Settings — {office.name}</h1>

      <Card>
        <CardHeader className="font-medium">SMTP configuration</CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs text-zinc-500">
            Works with any SMTP provider — Mailgun, Gmail, Hostinger, Brevo, SendGrid, or a custom server. Credentials
            are encrypted at rest and never shown again after saving.
          </p>
          <form action={saveWithId} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="host">SMTP host</Label>
                <Input id="host" name="host" required defaultValue={smtp?.host} placeholder="smtp.mailgun.org" />
              </div>
              <div>
                <Label htmlFor="port">Port</Label>
                <Input id="port" name="port" type="number" required defaultValue={smtp?.port ?? 587} />
              </div>
              <div>
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" required defaultValue={smtp?.username} />
              </div>
              <div>
                <Label htmlFor="password">Password {smtp && "(leave blank to keep current)"}</Label>
                <Input id="password" name="password" type="password" required={!smtp} placeholder={smtp ? "••••••••" : ""} />
              </div>
              <div>
                <Label htmlFor="encryption">Encryption</Label>
                <Select id="encryption" name="encryption" defaultValue={smtp?.encryption ?? "TLS"}>
                  <option value="TLS">STARTTLS</option>
                  <option value="SSL">SSL</option>
                  <option value="NONE">None</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="fromName">From name</Label>
                <Input id="fromName" name="fromName" required defaultValue={smtp?.fromName ?? office.name} />
              </div>
              <div>
                <Label htmlFor="fromEmail">From email</Label>
                <Input id="fromEmail" name="fromEmail" type="email" required defaultValue={smtp?.fromEmail} />
              </div>
              <div>
                <Label htmlFor="replyTo">Reply-to (optional)</Label>
                <Input id="replyTo" name="replyTo" type="email" defaultValue={smtp?.replyTo ?? ""} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="isActive" defaultChecked={smtp?.isActive ?? true} className="h-4 w-4 rounded border-zinc-300" />
              Active
            </label>
            <Button type="submit">Save SMTP settings</Button>
          </form>

          {smtp?.lastTestedAt && (
            <p className="text-xs text-zinc-500">
              Last tested {smtp.lastTestedAt.toLocaleString()} — {smtp.lastTestResult}
            </p>
          )}
          {smtp && <SmtpTestButton officeId={office.id} />}
        </CardBody>
      </Card>
    </div>
  );
}
