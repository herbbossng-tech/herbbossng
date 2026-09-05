import { Lock, Megaphone, Plus, Search } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCampaigns } from '@/features/campaigns/hooks'

const statusToneMap: Record<string, 'success' | 'secondary' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'destructive',
}

export function CampaignsPage() {
  const canView = usePermission('campaigns.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Campaigns is hidden" description="You don't have permission to view campaigns. Ask a workspace admin for the campaigns.view permission." />
      </Card>
    )
  }
  return <CampaignsContent />
}

function CampaignsContent() {
  const { activeBrand } = useWorkspace()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const { data: campaigns, isLoading, isError, refetch } = useCampaigns({ search, status })

  if (!activeBrand) {
    return (
      <Card className="p-8">
        <EmptyState icon={Megaphone} title="Select a brand" description="Campaigns are scoped to a brand — pick one from the switcher to continue." />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Affiliate campaigns for {activeBrand.name}.</p>
        </div>
        <PermissionGate anyOf={['campaigns.create', 'campaigns.manage']}>
          <Button size="sm" asChild>
            <Link to="/affiliates/campaigns/new">
              <Plus className="h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        </PermissionGate>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search campaigns…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load campaigns." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading campaigns…" />
      ) : (campaigns?.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Create your first campaign to start attributing affiliate orders and paying commission." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns?.map((c) => (
            <Link key={c.id} to={`/affiliates/campaigns/${c.id}`}>
              <Card className="flex h-full flex-col gap-2 p-5 transition-colors hover:border-primary/40">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{c.name}</p>
                  <Badge variant={statusToneMap[c.status]}>{c.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.commission_type === 'FIXED_AMOUNT' ? `Flat ${c.commission_value}` : `${c.commission_value}%`} · {c.qualifying_event === 'PER_ORDER_CREATED' ? 'Per order created' : 'Per delivered order'}
                </p>
                <p className="text-xs text-muted-foreground">{c.affiliate_access === 'ALL_APPROVED_AFFILIATES' ? 'Open to all approved affiliates' : 'Selected affiliates only'}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
