import { ArrowLeft, Lock } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { BrandLogoUploader } from '@/features/brands/components/BrandLogoUploader'
import { useBrand, useSetBrandStatus, useUpdateBrand } from '@/features/brands/hooks'
import type { BrandFormFields } from '@/features/brands/api'

export function BrandDetailPage() {
  const canView = usePermission('brands.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Brands is hidden" description="You don't have permission to view this brand." />
      </Card>
    )
  }
  return <BrandDetailContent />
}

function BrandDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: brand, isLoading, isError, refetch } = useBrand(id)
  const canManage = usePermission('brands.manage')
  const updateBrand = useUpdateBrand(id ?? '')
  const setStatus = useSetBrandStatus()

  const [fields, setFields] = React.useState<BrandFormFields>({ name: '' })
  const [dirty, setDirty] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(false)

  React.useEffect(() => {
    if (brand && !dirty) {
      setFields({
        name: brand.name,
        domain: brand.domain ?? '',
        email_sender_name: brand.email_sender_name ?? '',
        email_sender_address: brand.email_sender_address ?? '',
        meta_pixel_id: brand.meta_pixel_id ?? '',
        google_analytics_id: brand.google_analytics_id ?? '',
        google_tag_manager_id: brand.google_tag_manager_id ?? '',
        microsoft_clarity_id: brand.microsoft_clarity_id ?? '',
      })
    }
  }, [brand, dirty])

  if (isLoading) return <LoadingState label="Loading brand…" />
  if (isError || !brand) return <ErrorState message="Couldn't load this brand." onRetry={() => refetch()} />

  function set<K extends keyof BrandFormFields>(key: K, value: BrandFormFields[K]) {
    setFields((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    if (!fields.name.trim()) {
      setError('Brand name is required.')
      return
    }
    try {
      await updateBrand.mutateAsync(fields)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to="/brands">
          <ArrowLeft className="h-4 w-4" />
          Brands
        </Link>
      </Button>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{brand.name}</h1>
          <Badge variant={brand.status === 'active' ? 'success' : 'secondary'} className="mt-1 capitalize">
            {brand.status}
          </Badge>
        </div>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            className={brand.status === 'active' ? 'text-destructive hover:text-destructive' : undefined}
            onClick={() => (brand.status === 'active' ? setConfirmDeactivate(true) : setStatus.mutate({ id: brand.id, status: 'active' }))}
            disabled={setStatus.isPending}
          >
            {brand.status === 'active' ? 'Deactivate' : 'Activate'} Brand
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Identity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <BrandLogoUploader brandId={brand.id} logoUrl={brand.logo_url} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Brand name</Label>
              <Input value={fields.name} disabled={!canManage} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Domain</Label>
              <Input value={fields.domain ?? ''} disabled={!canManage} onChange={(e) => set('domain', e.target.value)} placeholder="brand.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Sender Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Sender name</Label>
            <Input value={fields.email_sender_name ?? ''} disabled={!canManage} onChange={(e) => set('email_sender_name', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Sender address</Label>
            <Input value={fields.email_sender_address ?? ''} disabled={!canManage} onChange={(e) => set('email_sender_address', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analytics Identifiers</CardTitle>
          <CardDescription>Stored for future use — GCOS does not yet send events to any of these platforms.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Meta Pixel ID</Label>
            <Input value={fields.meta_pixel_id ?? ''} disabled={!canManage} onChange={(e) => set('meta_pixel_id', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Google Analytics ID</Label>
            <Input value={fields.google_analytics_id ?? ''} disabled={!canManage} onChange={(e) => set('google_analytics_id', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Google Tag Manager ID</Label>
            <Input value={fields.google_tag_manager_id ?? ''} disabled={!canManage} onChange={(e) => set('google_tag_manager_id', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Microsoft Clarity ID</Label>
            <Input value={fields.microsoft_clarity_id ?? ''} disabled={!canManage} onChange={(e) => set('microsoft_clarity_id', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!dirty || updateBrand.isPending}>
            {updateBrand.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-success">Saved.</p>}
        </div>
      )}

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {brand.name}?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="px-6 text-sm text-muted-foreground">
            This marks the brand inactive for administrative purposes. Existing orders, products and historical data are unaffected. Landing pages under
            this brand are not automatically unpublished — archive them individually if they should stop accepting orders.
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setStatus.mutate({ id: brand.id, status: 'inactive' })
                setConfirmDeactivate(false)
              }}
              disabled={setStatus.isPending}
            >
              Deactivate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
