import { Lock } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCountries, useUpdateWorkspace } from '@/features/workspace/hooks'

const TIMEZONE_OPTIONS = ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'UTC']

export function WorkspaceSettingsPage() {
  const canView = usePermission('workspace.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Workspace settings are hidden" description="You don't have permission to view workspace settings. Ask a workspace admin for the workspace.view permission." />
      </Card>
    )
  }
  return <WorkspaceSettingsContent />
}

function WorkspaceSettingsContent() {
  const { activeWorkspace } = useWorkspace()
  const canManage = usePermission('workspace.manage')
  const { data: countries } = useCountries()
  const updateWorkspace = useUpdateWorkspace()

  const [name, setName] = React.useState(activeWorkspace.name)
  const [slug, setSlug] = React.useState(activeWorkspace.slug)
  const [logoUrl, setLogoUrl] = React.useState(activeWorkspace.logo_url ?? '')
  const [countryCode, setCountryCode] = React.useState(activeWorkspace.country_code ?? '')
  const [currencyCode, setCurrencyCode] = React.useState(activeWorkspace.currency_code ?? '')
  const [timezone, setTimezone] = React.useState(activeWorkspace.timezone)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    setName(activeWorkspace.name)
    setSlug(activeWorkspace.slug)
    setLogoUrl(activeWorkspace.logo_url ?? '')
    setCountryCode(activeWorkspace.country_code ?? '')
    setCurrencyCode(activeWorkspace.currency_code ?? '')
    setTimezone(activeWorkspace.timezone)
  }, [activeWorkspace])

  const dirty =
    name !== activeWorkspace.name ||
    slug !== activeWorkspace.slug ||
    logoUrl !== (activeWorkspace.logo_url ?? '') ||
    countryCode !== (activeWorkspace.country_code ?? '') ||
    currencyCode !== (activeWorkspace.currency_code ?? '') ||
    timezone !== activeWorkspace.timezone

  async function handleSave() {
    setError(null)
    setSaved(false)
    if (!name.trim()) {
      setError('Workspace name is required.')
      return
    }
    if (!slug.trim()) {
      setError('Slug is required.')
      return
    }
    try {
      await updateWorkspace.mutateAsync({
        name: name.trim(),
        slug: slug.trim(),
        logo_url: logoUrl.trim() || null,
        country_code: countryCode || null,
        currency_code: currencyCode || null,
        timezone,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update workspace'
      setError(message.includes('duplicate key') ? 'That slug is already taken.' : message)
    }
  }

  function handleCountryChange(code: string) {
    setCountryCode(code)
    const country = countries?.find((c) => c.code === code)
    if (country?.currency_code) setCurrencyCode(country.currency_code)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          General settings for <span className="font-semibold text-foreground">{activeWorkspace.name}</span>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Workspace name</Label>
            <Input value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Slug</Label>
            <Input value={slug} disabled={!canManage} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Logo URL</Label>
            <Input value={logoUrl} disabled={!canManage} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Localization</CardTitle>
          <CardDescription>Country, currency and timezone drive order numbers, currency formatting, and date boundaries across GCOS.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Country</Label>
            <Select value={countryCode} onValueChange={handleCountryChange} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {countries?.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.flag_emoji} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Currency</Label>
            <Input value={currencyCode} disabled className="bg-secondary/40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant={activeWorkspace.status === 'active' ? 'success' : 'secondary'} className="capitalize">
            {activeWorkspace.status}
          </Badge>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!dirty || updateWorkspace.isPending}>
            {updateWorkspace.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-success">Saved.</p>}
        </div>
      )}
    </div>
  )
}
