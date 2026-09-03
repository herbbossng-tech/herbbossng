import { ArchiveIcon, ArrowLeft, PauseCircle, PlayCircle, Trash2, Upload } from 'lucide-react'
import * as React from 'react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import {
  useApprovedAffiliates,
  useCampaign,
  useCampaignAffiliates,
  useCampaignAssets,
  useCampaignProducts,
  useDeleteCampaignAsset,
  useSetCampaignAffiliateRelationships,
  useSetCampaignProducts,
  useSetCampaignStatus,
  useUploadCampaignAsset,
} from '@/features/campaigns/hooks'
import { useProducts } from '@/features/products/hooks'
import { formatCurrency } from '@/lib/currency'

const statusToneMap: Record<string, 'success' | 'secondary' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'destructive',
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: campaign, isLoading, isError, refetch } = useCampaign(id)
  const { data: campaignProducts } = useCampaignProducts(id)
  const { data: campaignAffiliates } = useCampaignAffiliates(id)
  const { data: assets } = useCampaignAssets(id)
  const { data: allProducts } = useProducts()
  const { data: approvedAffiliates } = useApprovedAffiliates()
  const canUpdate = usePermission('campaigns.update')
  const canFullyManage = usePermission('campaigns.manage')
  const canManage = canUpdate || canFullyManage

  const setStatus = useSetCampaignStatus(id ?? '')
  const setProducts = useSetCampaignProducts(id ?? '')
  const setAffiliateRelationships = useSetCampaignAffiliateRelationships(id ?? '')
  const uploadAsset = useUploadCampaignAsset(id ?? '')
  const deleteAsset = useDeleteCampaignAsset(id ?? '')
  const { activeWorkspace } = useWorkspace()

  const [error, setError] = React.useState<string | null>(null)

  if (isLoading) return <LoadingState label="Loading campaign…" />
  if (isError) return <ErrorState message="Couldn't load campaign." onRetry={() => refetch()} />
  if (!campaign) return <ErrorState title="Campaign not found" message="This campaign may have been removed." />

  const selectedProductIds = new Set((campaignProducts ?? []).map((p) => p.product_id))
  const accessAffiliateIds = new Set((campaignAffiliates ?? []).filter((a) => a.relationship === 'ACCESS').map((a) => a.affiliate_id))
  const exceptionAffiliateIds = new Set((campaignAffiliates ?? []).filter((a) => a.relationship === 'COMMISSION_EXCEPTION').map((a) => a.affiliate_id))
  const isDraft = campaign.status === 'DRAFT'

  async function toggleProduct(productId: string, checked: boolean) {
    setError(null)
    const next = new Set(selectedProductIds)
    if (checked) next.add(productId)
    else next.delete(productId)
    try {
      await setProducts.mutateAsync(Array.from(next))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update products')
    }
  }

  async function toggleAffiliate(relationship: 'ACCESS' | 'COMMISSION_EXCEPTION', affiliateId: string, checked: boolean) {
    setError(null)
    const current = relationship === 'ACCESS' ? accessAffiliateIds : exceptionAffiliateIds
    const next = new Set(current)
    if (checked) next.add(affiliateId)
    else next.delete(affiliateId)
    try {
      await setAffiliateRelationships.mutateAsync({ relationship, affiliateIds: Array.from(next) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update affiliate list')
    }
  }

  async function handleStatusChange(next: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    setError(null)
    try {
      await setStatus.mutateAsync(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change campaign status')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      await uploadAsset.mutateAsync(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload asset')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/affiliates/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Campaigns
        </Link>
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{campaign.name}</h1>
            <Badge variant={statusToneMap[campaign.status]}>{campaign.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaign.commission_type === 'FIXED_AMOUNT' ? `Flat ${formatCurrency(campaign.commission_value, null)}` : `${campaign.commission_value}%`} ·{' '}
            {campaign.qualifying_event === 'PER_ORDER_CREATED' ? 'Pays on order creation' : 'Pays on delivery'} ·{' '}
            {campaign.affiliate_access === 'ALL_APPROVED_AFFILIATES' ? 'Open to all approved affiliates' : 'Selected affiliates only'}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {campaign.status === 'DRAFT' && (
              <Button size="sm" onClick={() => handleStatusChange('ACTIVE')} disabled={setStatus.isPending}>
                <PlayCircle className="h-4 w-4" />
                Activate
              </Button>
            )}
            {campaign.status === 'ACTIVE' && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('PAUSED')} disabled={setStatus.isPending}>
                <PauseCircle className="h-4 w-4" />
                Pause
              </Button>
            )}
            {campaign.status === 'PAUSED' && (
              <Button size="sm" onClick={() => handleStatusChange('ACTIVE')} disabled={setStatus.isPending}>
                <PlayCircle className="h-4 w-4" />
                Resume
              </Button>
            )}
            {campaign.status !== 'ARCHIVED' && (
              <Button size="sm" variant="destructive" onClick={() => handleStatusChange('ARCHIVED')} disabled={setStatus.isPending}>
                <ArchiveIcon className="h-4 w-4" />
                Archive
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Products {isDraft ? '' : '(locked — only editable while Draft)'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(allProducts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No products in this brand yet.</p>
          ) : (
            (allProducts ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedProductIds.has(p.id)}
                  disabled={!canManage || !isDraft}
                  onCheckedChange={(checked) => toggleProduct(p.id, checked === true)}
                />
                {p.name}
                {p.sku && <span className="text-xs text-muted-foreground">({p.sku})</span>}
              </label>
            ))
          )}
        </CardContent>
      </Card>

      {campaign.affiliate_access === 'SELECTED_AFFILIATES_ONLY' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Affiliates with access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(approvedAffiliates ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved affiliates yet.</p>
            ) : (
              (approvedAffiliates ?? []).map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={accessAffiliateIds.has(a.id)}
                    disabled={!canManage}
                    onCheckedChange={(checked) => toggleAffiliate('ACCESS', a.id, checked === true)}
                  />
                  {a.full_name} <span className="text-xs text-muted-foreground">({a.referral_code})</span>
                </label>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission exceptions</CardTitle>
          <p className="text-sm text-muted-foreground">These affiliates can participate in this campaign but earn no commission on it.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(approvedAffiliates ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No approved affiliates yet.</p>
          ) : (
            (approvedAffiliates ?? []).map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={exceptionAffiliateIds.has(a.id)}
                  disabled={!canManage}
                  onCheckedChange={(checked) => toggleAffiliate('COMMISSION_EXCEPTION', a.id, checked === true)}
                />
                {a.full_name} <span className="text-xs text-muted-foreground">({a.referral_code})</span>
              </label>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promotional assets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PermissionGate anyOf={['campaigns.update', 'campaigns.manage']}>
            <div>
              <input id="asset-upload" type="file" className="hidden" onChange={handleFileUpload} />
              <Button size="sm" variant="outline" type="button" onClick={() => document.getElementById('asset-upload')?.click()} disabled={uploadAsset.isPending}>
                <Upload className="h-4 w-4" />
                {uploadAsset.isPending ? 'Uploading…' : 'Upload asset'}
              </Button>
            </div>
          </PermissionGate>
          {(assets?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No assets uploaded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assets?.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span className="truncate">{asset.name}</span>
                  <PermissionGate anyOf={['campaigns.update', 'campaigns.manage']}>
                    <Button size="icon" variant="ghost" onClick={() => deleteAsset.mutate(asset.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </PermissionGate>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Workspace: {activeWorkspace.name}</p>
    </div>
  )
}
