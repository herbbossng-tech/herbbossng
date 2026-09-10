import { ArrowLeft, Download, FilePlus2, ImageIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'
import type { AffiliateCampaign } from '@/types/database'

import { getCampaignAssetSignedUrl } from '../api'
import { useCampaign, useCampaignAssets, useCampaignProducts } from '../hooks'

const PORTAL_CURRENCY = 'NGN'

function commissionLabel(campaign: AffiliateCampaign): string {
  return campaign.commission_type === 'PERCENTAGE' ? `${campaign.commission_value}%` : formatCurrency(campaign.commission_value, PORTAL_CURRENCY)
}

export function AffiliateCampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId)
  const { data: products } = useCampaignProducts(campaignId ?? null)
  const { data: assets } = useCampaignAssets(campaignId)

  if (isLoading) return <LoadingState label="Loading campaign…" />
  if (isError || !campaign) return <ErrorState message="Couldn't load this campaign." onRetry={() => refetch()} />

  const canCreateForms = campaign.allowed_activities.includes('CREATE_ORDER_FORMS')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/affiliate/campaigns">
            <ArrowLeft className="h-4 w-4" />
            Back to campaigns
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
          <Badge variant={campaign.status === 'ACTIVE' ? 'success' : 'secondary'}>{campaign.status}</Badge>
        </div>
      </div>

      {(products ?? []).map((p) => {
        const product = p as { id: string; name: string; selling_price: number; compare_price?: number | null }
        return (
          <Card key={product.id}>
            <CardContent className="flex flex-col gap-2 p-4">
              <h2 className="font-semibold text-foreground">{product.name}</h2>
              <div className="flex items-baseline gap-2">
                {product.compare_price && product.compare_price > product.selling_price && (
                  <span className="text-sm text-muted-foreground line-through">{formatCurrency(product.compare_price, PORTAL_CURRENCY)}</span>
                )}
                <span className="font-bold text-foreground">{formatCurrency(product.selling_price, PORTAL_CURRENCY)}</span>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <div className="flex flex-wrap gap-2">
        <Button asChild disabled={!canCreateForms}>
          <Link to={`/affiliate/order-forms?campaign=${campaign.id}`} aria-disabled={!canCreateForms}>
            <FilePlus2 className="h-4 w-4" />
            Create Form
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About this campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{campaign.description || 'No description provided.'}</p>
        </CardContent>
      </Card>

      {campaign.instructions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{campaign.instructions}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="text-2xl font-bold text-foreground">{commissionLabel(campaign)}</p>
          <p className="text-xs text-muted-foreground">
            You earn when the order is {campaign.qualifying_event === 'PER_DELIVERED_ORDER' ? 'delivered' : 'placed'}.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you can do</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canCreateForms && <Badge variant="secondary">Create forms</Badge>}
          <Badge variant="secondary">Submit orders</Badge>
          {(assets ?? []).length > 0 && <Badge variant="secondary">Promo materials</Badge>}
        </CardContent>
      </Card>

      {(assets ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Promo materials</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {assets?.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={async () => {
                  const url = await getCampaignAssetSignedUrl(asset.file_path)
                  window.open(url, '_blank', 'noopener,noreferrer')
                }}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-left text-sm hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  {asset.name}
                </span>
                <Download className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
