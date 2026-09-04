import { Loader2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateLandingPage } from '@/features/landingPages/hooks'
import { TrackingSettingsForm } from '@/features/landingPages/components/TrackingSettingsForm'
import type { FloatingCtaConfig, LandingPage, LandingPageFormConfig, LandingPageSeoConfig, WhatsappCtaConfig } from '@/types/database'

export function PageSettingsForm({ page }: { page: LandingPage }) {
  const updatePage = useUpdateLandingPage(page.id)

  const [title, setTitle] = React.useState(page.title ?? '')
  const [description, setDescription] = React.useState(page.description ?? '')
  const [seo, setSeo] = React.useState<LandingPageSeoConfig>(page.seo_config ?? {})
  const [form, setForm] = React.useState<LandingPageFormConfig>(page.form_config ?? {})
  const [whatsapp, setWhatsapp] = React.useState<WhatsappCtaConfig>(page.whatsapp_config ?? { enabled: false, phone: null, message: null, label: 'Chat With Us' })
  const [floating, setFloating] = React.useState<FloatingCtaConfig>(page.floating_cta_config ?? { enabled: false, label: 'Order Now' })
  const [orderSummaryEnabled, setOrderSummaryEnabled] = React.useState(page.order_summary_enabled)

  async function save() {
    await updatePage.mutateAsync({
      title: title || null,
      description: description || null,
      seo_config: seo,
      form_config: form,
      whatsapp_config: whatsapp,
      floating_cta_config: floating,
      order_summary_enabled: orderSummaryEnabled,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pageTitle">Browser tab title</Label>
            <Input id="pageTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pageDescription">Internal description (staff only)</Label>
            <Textarea id="pageDescription" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <TrackingSettingsForm page={page} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Meta title</Label>
            <Input value={seo.metaTitle ?? ''} onChange={(e) => setSeo((s) => ({ ...s, metaTitle: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Meta description</Label>
            <Textarea rows={2} value={seo.metaDescription ?? ''} onChange={(e) => setSeo((s) => ({ ...s, metaDescription: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!seo.noindex} onCheckedChange={(checked) => setSeo((s) => ({ ...s, noindex: checked }))} />
            No-index this page (hide from search engines)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Form</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!form.collectEmail} onCheckedChange={(checked) => setForm((f) => ({ ...f, collectEmail: checked }))} />
            Collect email address
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!form.collectAlternatePhone} onCheckedChange={(checked) => setForm((f) => ({ ...f, collectAlternatePhone: checked }))} />
            Collect alternate phone number
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!form.collectLandmark} onCheckedChange={(checked) => setForm((f) => ({ ...f, collectLandmark: checked }))} />
            Collect delivery landmark
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!form.collectNotes} onCheckedChange={(checked) => setForm((f) => ({ ...f, collectNotes: checked }))} />
            Collect order notes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={orderSummaryEnabled} onCheckedChange={setOrderSummaryEnabled} />
            Show order summary before the Place Order button
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">WhatsApp CTA</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={whatsapp.enabled} onCheckedChange={(checked) => setWhatsapp((w) => ({ ...w, enabled: checked }))} />
            Show a "Chat With Us" WhatsApp button
          </label>
          {whatsapp.enabled && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>WhatsApp number (with country code)</Label>
                <Input value={whatsapp.phone ?? ''} onChange={(e) => setWhatsapp((w) => ({ ...w, phone: e.target.value }))} placeholder="e.g. 2348012345678" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Button label</Label>
                <Input value={whatsapp.label} onChange={(e) => setWhatsapp((w) => ({ ...w, label: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Pre-filled message (optional)</Label>
                <Textarea rows={2} value={whatsapp.message ?? ''} onChange={(e) => setWhatsapp((w) => ({ ...w, message: e.target.value }))} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Floating CTA</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={floating.enabled} onCheckedChange={(checked) => setFloating((f) => ({ ...f, enabled: checked }))} />
            Show a floating "Order Now" button that scrolls to the order form
          </label>
          {floating.enabled && (
            <div className="flex flex-col gap-1.5">
              <Label>Button label</Label>
              <Input value={floating.label} onChange={(e) => setFloating((f) => ({ ...f, label: e.target.value }))} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={updatePage.isPending}>
          {updatePage.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Settings
        </Button>
      </div>
    </div>
  )
}
