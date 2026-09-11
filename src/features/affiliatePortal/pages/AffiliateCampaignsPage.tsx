import { Eye, FilePlus2, Megaphone, Search } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { formatCurrency } from '@/lib/currency'
import type { AffiliateCampaign } from '@/types/database'

import { useCampaignProducts, useMyAvailableCampaigns } from '../hooks'

const PORTAL_CURRENCY = 'NGN'

function commissionLabel(campaign: AffiliateCampaign): string {
  return campaign.commission_type === 'PERCENTAGE' ? `${campaign.commission_value}%` : formatCurrency(campaign.commission_value, PORTAL_CURRENCY)
}

function CampaignCard({ campaign }: { campaign: AffiliateCampaign }) {
  const { data: products, isLoading } = useCampaignProducts(campaign.id)
  const firstProduct = products?.[0] as { name?: string; selling_price?: number; compare_price?: number | null; track_inventory?: boolean; stock_quantity?: number } | undefined
  const extraCount = (products?.length ?? 0) - 1
  const inStock = !firstProduct?.track_inventory || (firstProduct.stock_quantity ?? 0) > 0

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">{campaign.name}</h3>
              {firstProduct && <Badge variant={inStock ? 'success' : 'secondary'}>{inStock ? 'In stock' : 'Out of stock'}</Badge>}
            </div>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading product…</p>
            ) : firstProduct ? (
              <p className="text-sm text-muted-foreground">
                {firstProduct.name}
                {extraCount > 0 && ` + ${extraCount} more`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No products attached yet.</p>
            )}
          </div>
        </div>

        {firstProduct?.selling_price !== undefined && (
          <div className="flex items-baseline gap-2">
            {firstProduct.compare_price && firstProduct.compare_price > firstProduct.selling_price && (
              <span className="text-sm text-muted-foreground line-through">{formatCurrency(firstProduct.compare_price, PORTAL_CURRENCY)}</span>
            )}
            <span className="font-bold text-foreground">{formatCurrency(firstProduct.selling_price, PORTAL_CURRENCY)}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{campaign.description || 'earn commission per delivered order'}</p>
        <p className="text-sm font-medium text-foreground">Commission: {commissionLabel(campaign)}</p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm">
            <Link to={`/affiliate/order-forms?campaign=${campaign.id}`}>
              <FilePlus2 className="h-4 w-4" />
              Create Form
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/affiliate/campaigns/${campaign.id}`}>
              <Eye className="h-4 w-4" />
              View Campaign
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function AffiliateCampaignsPage() {
  const { data: campaigns, isLoading, isError, refetch } = useMyAvailableCampaigns()
  const [search, setSearch] = React.useState('')

  const filtered = (campaigns ?? []).filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
  const withCommission = (campaigns ?? []).filter((c) => c.commission_value > 0).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Available Campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse campaigns you can promote — create forms and submit orders.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="text-2xl font-bold text-foreground">{(campaigns ?? []).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">With commission</p>
            <p className="text-2xl font-bold text-foreground">{withCommission}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <LoadingState label="Loading campaigns…" />
      ) : isError ? (
        <ErrorState message="Couldn't load campaigns." onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns available" description="Check back later for new campaigns you can promote." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  )
}
