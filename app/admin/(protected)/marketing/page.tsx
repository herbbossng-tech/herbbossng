import { getCurrentAdminOffice } from "@/lib/office-context";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveTrackingSettings } from "../settings/actions";

export default async function MarketingPage() {
  const office = await getCurrentAdminOffice();
  if (!office) return <p className="text-sm text-zinc-500">Create an office first.</p>;

  const tracking = await prisma.trackingSetting.findUnique({ where: { officeId: office.id } });
  const saveWithId = saveTrackingSettings.bind(null, office.id);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Marketing — {office.name}</h1>

      <Card>
        <CardHeader className="font-medium">Meta Pixel & Conversions API</CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs text-zinc-500">
            The Pixel ID loads the browser-side Pixel on this office&apos;s landing pages and thank-you page. The
            access token is only used server-side to send a deduplicated Purchase event to Meta&apos;s Conversions
            API — it is never sent to the browser.
          </p>
          <form action={saveWithId} className="space-y-4">
            <div>
              <Label htmlFor="metaPixelId">Meta Pixel ID</Label>
              <Input id="metaPixelId" name="metaPixelId" defaultValue={tracking?.metaPixelId ?? ""} />
            </div>
            <div>
              <Label htmlFor="metaAccessToken">Conversions API access token {tracking?.metaAccessTokenEncrypted && "(leave blank to keep current)"}</Label>
              <Input id="metaAccessToken" name="metaAccessToken" type="password" placeholder={tracking?.metaAccessTokenEncrypted ? "••••••••" : ""} />
            </div>
            <div>
              <Label htmlFor="metaDatasetId">Dataset ID (optional)</Label>
              <Input id="metaDatasetId" name="metaDatasetId" defaultValue={tracking?.metaDatasetId ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="metaCapiEnabled" defaultChecked={tracking?.metaCapiEnabled ?? false} className="h-4 w-4 rounded border-zinc-300" />
              Enable server-side Conversions API sending
            </label>
            <div>
              <Label htmlFor="ga4MeasurementId">GA4 Measurement ID</Label>
              <Input id="ga4MeasurementId" name="ga4MeasurementId" defaultValue={tracking?.ga4MeasurementId ?? ""} placeholder="G-XXXXXXXXXX" />
            </div>
            <Button type="submit">Save tracking settings</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
