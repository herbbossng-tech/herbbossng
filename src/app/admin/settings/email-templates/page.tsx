import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { PageHeader, Card, Input, Label, Textarea, Button, EmptyState } from '@/components/ui';
import { saveEmailTemplate } from './actions';
import { requirePageAccess } from '@/lib/require-page-access';

const TEMPLATE_KEYS: { key: string; label: string; description: string }[] = [
  { key: 'NEW_ORDER_ADMIN', label: 'New Order (Admin)', description: 'Sent to the office email when a new order is placed.' },
  { key: 'ORDER_CONFIRMATION', label: 'Order Confirmation (Customer)', description: 'Sent to the customer right after checkout.' },
  { key: 'ORDER_CONFIRMED', label: 'Order Confirmed', description: 'Sent when staff confirm the order.' },
  { key: 'ORDER_DISPATCHED', label: 'Order Dispatched', description: 'Sent when the order is dispatched.' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', description: 'Sent when the order is out for delivery.' },
  { key: 'DELIVERED', label: 'Delivered', description: 'Sent when the order is delivered.' },
  { key: 'CANCELLED', label: 'Cancelled', description: 'Sent when the order is cancelled.' },
  { key: 'FAILED_DELIVERY', label: 'Failed Delivery', description: 'Sent when a delivery attempt fails.' },
];

const VARIABLES = [
  'customer_name', 'order_number', 'product_name', 'package_name', 'quantity', 'subtotal', 'shipping', 'total',
  'currency', 'delivery_address', 'city', 'state', 'office_name', 'office_phone', 'order_date', 'order_status', 'phone', 'email',
];

export default async function EmailTemplatesPage() {
  await requirePageAccess('settings');
  const office = await getActiveOffice();
  if (!office) return <EmptyState title="No office configured" />;

  const templates = await db.emailTemplate.findMany({ where: { officeId: office.id } });
  const templateMap = Object.fromEntries(templates.map((t) => [t.key, t]));

  return (
    <div>
      <PageHeader
        title="Email Templates"
        description={`${office.name} — edit subject/body/branding. Leave a template unsaved to use the built-in default.`}
      />
      <Card className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark/40">Available variables</p>
        <p className="mt-1 text-xs text-brand-dark/60">{VARIABLES.map((v) => `{{${v}}}`).join('  ')}</p>
      </Card>

      <div className="flex flex-col gap-6">
        {TEMPLATE_KEYS.map(({ key, label, description }) => {
          const t = templateMap[key];
          return (
            <Card key={key}>
              <p className="font-semibold text-brand-dark">{label}</p>
              <p className="mb-3 text-xs text-brand-dark/50">{description}</p>
              <form action={saveEmailTemplate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input type="hidden" name="officeId" value={office.id} />
                <input type="hidden" name="key" value={key} />
                <div>
                  <Label required>Subject</Label>
                  <Input name="subject" defaultValue={t?.subject} required placeholder="New Order Received — {{order_number}}" />
                </div>
                <div>
                  <Label>Preview text</Label>
                  <Input name="previewText" defaultValue={t?.previewText ?? ''} />
                </div>
                <div>
                  <Label>Header text</Label>
                  <Input name="headerText" defaultValue={t?.headerText ?? ''} placeholder="NEW ORDER RECEIVED" />
                </div>
                <div>
                  <Label required>Brand name</Label>
                  <Input name="brandName" defaultValue={t?.brandName || 'Wellness247'} required />
                </div>
                <div>
                  <Label>Logo URL</Label>
                  <Input name="logoUrl" defaultValue={t?.logoUrl ?? ''} />
                </div>
                <div>
                  <Label required>Primary color</Label>
                  <Input type="color" name="primaryColor" defaultValue={t?.primaryColor || '#0f3d2e'} required />
                </div>
                <div>
                  <Label>Button text</Label>
                  <Input name="buttonText" defaultValue={t?.buttonText ?? ''} />
                </div>
                <div>
                  <Label>Button URL</Label>
                  <Input name="buttonUrl" defaultValue={t?.buttonUrl ?? ''} />
                </div>
                <div className="col-span-full">
                  <Label required>Body (HTML, variables allowed)</Label>
                  <Textarea name="bodyHtml" defaultValue={t?.bodyHtml ?? ''} rows={6} className="font-mono text-xs" placeholder="<p>Hi {{customer_name}}, ...</p>" />
                </div>
                <div className="col-span-full">
                  <Label>Footer text</Label>
                  <Input name="footerText" defaultValue={t?.footerText ?? ''} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="isActive" id={`active-${key}`} defaultChecked={t?.isActive ?? true} />
                  <label htmlFor={`active-${key}`} className="text-sm text-brand-dark">Active</label>
                </div>
                <div className="col-span-full">
                  <Button type="submit" variant="secondary">Save template</Button>
                </div>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
