import { db } from '@/lib/db';
import { PageHeader, Card, Input, Label, Button } from '@/components/ui';
import { saveTrackingSettings } from './actions';
import { requirePageAccess } from '@/lib/require-page-access';

export default async function TrackingSettingsPage() {
  await requirePageAccess('settings');
  const offices = await db.office.findMany({ orderBy: { sortOrder: 'asc' }, include: { trackingSetting: true } });

  return (
    <div>
      <PageHeader
        title="Tracking"
        description="Meta Pixel (client-side) + Conversions API (server-side, deduplicated by event ID) + GA4, configured per office."
      />
      <div className="flex flex-col gap-6">
        {offices.map((office) => {
          const t = office.trackingSetting;
          return (
            <Card key={office.id}>
              <p className="mb-3 font-semibold text-brand-dark">{office.name}</p>
              <form action={saveTrackingSettings} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input type="hidden" name="officeId" value={office.id} />
                <div>
                  <Label>Meta Pixel ID</Label>
                  <Input name="metaPixelId" defaultValue={t?.metaPixelId ?? ''} />
                </div>
                <div>
                  <Label>Meta Dataset ID</Label>
                  <Input name="metaDatasetId" defaultValue={t?.metaDatasetId ?? ''} />
                </div>
                <div className="col-span-full">
                  <Label>Meta Conversions API access token {t?.metaEncryptedAccessToken ? '(leave blank to keep current)' : ''}</Label>
                  <Input type="password" name="metaAccessToken" placeholder={t?.metaEncryptedAccessToken ? '••••••••' : ''} />
                  <p className="mt-1 text-xs text-brand-dark/40">Stored encrypted server-side. Never sent to the browser.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="metaCapiEnabled" id={`capi-${office.id}`} defaultChecked={t?.metaCapiEnabled} />
                  <label htmlFor={`capi-${office.id}`} className="text-sm text-brand-dark">Enable server-side Purchase events (CAPI)</label>
                </div>
                <div>
                  <Label>GA4 Measurement ID</Label>
                  <Input name="ga4MeasurementId" defaultValue={t?.ga4MeasurementId ?? ''} placeholder="G-XXXXXXX" />
                </div>
                <div>
                  <Label>GA4 API secret (optional)</Label>
                  <Input type="password" name="ga4ApiSecret" defaultValue={t?.ga4ApiSecret ?? ''} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="isActive" id={`active-${office.id}`} defaultChecked={t?.isActive} />
                  <label htmlFor={`active-${office.id}`} className="text-sm text-brand-dark">Active on this office&apos;s landing pages</label>
                </div>
                <div className="col-span-full">
                  <Button type="submit">Save tracking settings</Button>
                </div>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
