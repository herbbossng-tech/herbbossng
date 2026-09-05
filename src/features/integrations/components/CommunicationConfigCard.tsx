import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePermission } from '@/contexts/PermissionsContext'
import { useCommunicationConfigStatus, useSetBrandCommunicationConfig } from '@/features/integrations/hooks'

/**
 * Brand-level SMS/WhatsApp/email provider configuration, embedded in
 * Brand Detail. Only email (Resend) has a real adapter — see
 * dispatch-communication (0032/Phase 11). SMS/WhatsApp fields exist so
 * the interface is provider-ready without GCOS inventing a provider
 * choice; entering a provider name alone does not report the channel
 * as configured until an access key is also saved (see
 * resolve_brand_communication_config_internal(), 0032).
 */
export function CommunicationConfigCard({ brandId }: { brandId: string }) {
  const canManage = usePermission('communications.manage')
  const canView = usePermission('communications.view')
  const { data: status } = useCommunicationConfigStatus(brandId)
  const setConfig = useSetBrandCommunicationConfig(brandId)

  const [emailApiKey, setEmailApiKey] = React.useState('')
  const [smsProvider, setSmsProvider] = React.useState('')
  const [smsApiKey, setSmsApiKey] = React.useState('')
  const [smsSenderId, setSmsSenderId] = React.useState('')
  const [whatsappProvider, setWhatsappProvider] = React.useState('')
  const [whatsappApiKey, setWhatsappApiKey] = React.useState('')
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!canView) return null

  async function save() {
    setError(null)
    try {
      await setConfig.mutateAsync({
        emailApiKey: emailApiKey || null,
        smsProvider: smsProvider || null,
        smsApiKey: smsApiKey || null,
        smsSenderId: smsSenderId || null,
        whatsappProvider: whatsappProvider || null,
        whatsappApiKey: whatsappApiKey || null,
        whatsappPhoneNumberId: whatsappPhoneNumberId || null,
      })
      setEmailApiKey('')
      setSmsApiKey('')
      setWhatsappApiKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save communication configuration')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Communication Providers</CardTitle>
        <CardDescription>
          Email is sent via Resend using this brand's own sender identity (set above). SMS/WhatsApp have no provider chosen yet anywhere in
          GCOS — set one below only once you have a real account with it; access tokens are server-side only and never displayed once saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Email (Resend)</span>
            <Badge variant={status?.email_configured ? 'success' : 'secondary'}>{status?.email_configured ? 'Configured' : 'Not configured'}</Badge>
          </div>
          <Label className="mt-2">Resend API key</Label>
          <Input type="password" placeholder="Unchanged unless filled in" value={emailApiKey} disabled={!canManage} onChange={(e) => setEmailApiKey(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">SMS</span>
            <Badge variant={status?.sms_configured ? 'success' : 'secondary'}>{status?.sms_configured ? 'Configured' : 'Not configured'}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Provider name</Label>
              <Input placeholder="e.g. termii" value={smsProvider} disabled={!canManage} onChange={(e) => setSmsProvider(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>API key</Label>
              <Input type="password" placeholder="Unchanged unless filled in" value={smsApiKey} disabled={!canManage} onChange={(e) => setSmsApiKey(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Sender ID (optional)</Label>
              <Input value={smsSenderId} disabled={!canManage} onChange={(e) => setSmsSenderId(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">WhatsApp</span>
            <Badge variant={status?.whatsapp_configured ? 'success' : 'secondary'}>{status?.whatsapp_configured ? 'Configured' : 'Not configured'}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Provider name</Label>
              <Input placeholder="e.g. 360dialog" value={whatsappProvider} disabled={!canManage} onChange={(e) => setWhatsappProvider(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>API key</Label>
              <Input type="password" placeholder="Unchanged unless filled in" value={whatsappApiKey} disabled={!canManage} onChange={(e) => setWhatsappApiKey(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone number ID (optional)</Label>
              <Input value={whatsappPhoneNumberId} disabled={!canManage} onChange={(e) => setWhatsappPhoneNumberId(e.target.value)} />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {saved && <p className="text-xs text-success">Communication configuration saved.</p>}

        {canManage && (
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={save} disabled={setConfig.isPending}>
              {setConfig.isPending ? 'Saving…' : 'Save Communication Providers'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
