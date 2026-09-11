import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { usePermission } from '@/contexts/PermissionsContext'
import { useLandingPageTrackingStatus, useSetLandingPageTracking } from '@/features/landingPages/hooks'
import type { LandingPage } from '@/types/database'

/**
 * Page-level conversion tracking override. Resolution is
 * page-override → brand-default (get_landing_page_tracking_status(),
 * 0031) — this form only ever WRITES the page's own override; the
 * brand default is configured on the Brand Detail page. Access tokens
 * are write-only inputs that are never re-displayed once saved (the
 * RPC never returns them) — only a "configured" badge shows whether
 * one exists, resolved server-side.
 */
export function TrackingSettingsForm({ page }: { page: LandingPage }) {
  const canManage = usePermission('landing_pages.tracking.manage')
  const canView = usePermission('landing_pages.tracking.view')
  const { data: status, isLoading } = useLandingPageTrackingStatus(page.id)
  const setTracking = useSetLandingPageTracking(page.id)

  const [metaEnabled, setMetaEnabled] = React.useState(false)
  const [metaPixelId, setMetaPixelId] = React.useState('')
  const [metaCapiToken, setMetaCapiToken] = React.useState('')
  const [metaTestEventCode, setMetaTestEventCode] = React.useState('')
  const [tiktokEnabled, setTiktokEnabled] = React.useState(false)
  const [tiktokPixelId, setTiktokPixelId] = React.useState('')
  const [tiktokToken, setTiktokToken] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [initialized, setInitialized] = React.useState(false)

  React.useEffect(() => {
    if (status && !initialized) {
      setMetaEnabled(status.meta_source === 'page' && status.meta_enabled)
      setMetaPixelId(status.meta_source === 'page' ? (status.meta_pixel_id ?? '') : '')
      setTiktokEnabled(status.tiktok_source === 'page' && status.tiktok_enabled)
      setTiktokPixelId(status.tiktok_source === 'page' ? (status.tiktok_pixel_id ?? '') : '')
      setInitialized(true)
    }
  }, [status, initialized])

  if (!canView) return null

  async function save() {
    setError(null)
    try {
      await setTracking.mutateAsync({
        metaEnabled,
        metaPixelId: metaPixelId || null,
        metaCapiAccessToken: metaCapiToken || null,
        metaCapiTestEventCode: metaTestEventCode || null,
        tiktokEnabled,
        tiktokPixelId: tiktokPixelId || null,
        tiktokAccessToken: tiktokToken || null,
      })
      setMetaCapiToken('')
      setMetaTestEventCode('')
      setTiktokToken('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tracking configuration')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conversion Tracking</CardTitle>
        <CardDescription>
          Override the brand's default Meta Pixel/TikTok Pixel for just this page. Leave overrides off to inherit the brand default. Access
          tokens are stored server-side only and never sent to the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={metaEnabled} disabled={!canManage} onCheckedChange={setMetaEnabled} />
              Meta Pixel / Conversions API override
            </label>
            {!isLoading && status && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Effective: <Badge variant={status.meta_source === 'none' ? 'secondary' : 'success'}>{status.meta_source}</Badge>
                {status.meta_capi_configured && <Badge variant="outline">CAPI configured</Badge>}
              </div>
            )}
          </div>
          {metaEnabled && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Meta Pixel ID</Label>
                <Input value={metaPixelId} disabled={!canManage} onChange={(e) => setMetaPixelId(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>CAPI access token</Label>
                <Input
                  type="password"
                  placeholder="Unchanged unless filled in"
                  value={metaCapiToken}
                  disabled={!canManage}
                  onChange={(e) => setMetaCapiToken(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>CAPI test event code (optional)</Label>
                <Input
                  placeholder="Unchanged unless filled in"
                  value={metaTestEventCode}
                  disabled={!canManage}
                  onChange={(e) => setMetaTestEventCode(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={tiktokEnabled} disabled={!canManage} onCheckedChange={setTiktokEnabled} />
              TikTok Pixel / Events API override
            </label>
            {!isLoading && status && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Effective: <Badge variant={status.tiktok_source === 'none' ? 'secondary' : 'success'}>{status.tiktok_source}</Badge>
                {status.tiktok_events_configured && <Badge variant="outline">Events API configured</Badge>}
              </div>
            )}
          </div>
          {tiktokEnabled && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>TikTok Pixel ID</Label>
                <Input value={tiktokPixelId} disabled={!canManage} onChange={(e) => setTiktokPixelId(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Events API access token</Label>
                <Input
                  type="password"
                  placeholder="Unchanged unless filled in"
                  value={tiktokToken}
                  disabled={!canManage}
                  onChange={(e) => setTiktokToken(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {saved && <p className="text-xs text-success">Tracking configuration saved.</p>}

        {canManage && (
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={save} disabled={setTracking.isPending}>
              {setTracking.isPending ? 'Saving…' : 'Save Tracking Configuration'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
