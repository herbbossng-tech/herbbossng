import { Lock, Megaphone, Plus } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { DateRangeFilter } from '@/features/finance/components/DateRangeFilter'
import { useMarketingDateRange } from '@/features/marketing/dateRange'
import { useCreateMarketingCampaign, useMarketingCampaignList } from '@/features/marketing/hooks'
import { useLandingPages } from '@/features/landingPages/hooks'
import { useProducts } from '@/features/products/hooks'
import { formatCurrency } from '@/lib/currency'
import type { MarketingChannel } from '@/types/database'

const CHANNELS: MarketingChannel[] = ['meta', 'tiktok', 'google', 'affiliate', 'organic', 'direct', 'whatsapp', 'other']
const CHANNEL_LABELS: Record<MarketingChannel, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  google: 'Google',
  affiliate: 'Affiliate',
  organic: 'Organic',
  direct: 'Direct',
  whatsapp: 'WhatsApp',
  other: 'Other',
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'secondary',
  archived: 'destructive',
}

export function MarketingCampaignsPage() {
  const canView = usePermission('marketing.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Campaigns hidden" description="You don't have permission to view marketing campaigns." />
      </Card>
    )
  }
  return <MarketingCampaignsContent />
}

function MarketingCampaignsContent() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { setPreset, customFrom, customTo, setCustom, resolved, range } = useMarketingDateRange()
  const [status, setStatus] = React.useState('all')
  const [channel, setChannel] = React.useState('all')
  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)

  const { data: rows, isLoading, isError, refetch } = useMarketingCampaignList({ ...range, status, channel, search })

  if (!activeBrand) {
    return (
      <Card className="p-8">
        <EmptyState icon={Megaphone} title="Select a brand" description="Marketing campaigns are scoped to a brand — pick one from the switcher to continue." />
      </Card>
    )
  }

  const money = (n: number | null) => (n === null ? '—' : formatCurrency(n, currency))
  const ratio = (n: number | null, suffix: string) => (n === null ? '—' : `${n.toLocaleString()}${suffix}`)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every acquisition initiative and its economic result.</p>
        </div>
        <PermissionGate permission="marketing.create">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Campaign
          </Button>
        </PermissionGate>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search campaigns…" className="w-[200px]" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter value={resolved} onChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomChange={setCustom} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load campaigns." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading campaigns…" />
            </div>
          ) : (rows?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign to start tracking acquisition performance." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Campaign</th>
                    <th className="px-5 py-3 font-semibold">Channel</th>
                    <th className="px-5 py-3 font-semibold">Spend</th>
                    <th className="px-5 py-3 font-semibold">Orders</th>
                    <th className="px-5 py-3 font-semibold">Delivered</th>
                    <th className="px-5 py-3 font-semibold">Delivery Rate</th>
                    <th className="px-5 py-3 font-semibold">Delivered Revenue</th>
                    <th className="px-5 py-3 font-semibold">Delivered CPA</th>
                    <th className="px-5 py-3 font-semibold">ROAS</th>
                    <th className="px-5 py-3 font-semibold">Profit</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row) => (
                    <tr key={row.campaign_id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <Link to={`/marketing/campaigns/${row.campaign_id}`} className="font-medium text-foreground hover:underline">
                          {row.name}
                        </Link>
                        {row.product_name && <p className="text-xs text-muted-foreground">{row.product_name}</p>}
                      </td>
                      <td className="px-5 py-3">{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                      <td className="px-5 py-3">{money(row.spend)}</td>
                      <td className="px-5 py-3">{row.orders_created.toLocaleString()}</td>
                      <td className="px-5 py-3">{row.delivered_orders.toLocaleString()}</td>
                      <td className="px-5 py-3">{ratio(row.delivery_rate_pct, '%')}</td>
                      <td className="px-5 py-3">{money(row.delivered_revenue)}</td>
                      <td className="px-5 py-3">{money(row.delivered_cpa)}</td>
                      <td className="px-5 py-3">{ratio(row.roas, 'x')}</td>
                      <td className="px-5 py-3">{row.profit_data_available ? money(row.contribution_profit) : 'Not available'}</td>
                      <td className="px-5 py-3">
                        <Badge variant={STATUS_TONE[row.status] ?? 'secondary'}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function CreateCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { data: products } = useProducts()
  const { data: landingPages } = useLandingPages()
  const createCampaign = useCreateMarketingCampaign()

  const [name, setName] = React.useState('')
  const [channel, setChannel] = React.useState<MarketingChannel>('meta')
  const [productId, setProductId] = React.useState('')
  const [landingPageId, setLandingPageId] = React.useState('')
  const [utmCampaign, setUtmCampaign] = React.useState('')
  const [budgetTotal, setBudgetTotal] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setName('')
      setChannel('meta')
      setProductId('')
      setLandingPageId('')
      setUtmCampaign('')
      setBudgetTotal('')
      setStartDate('')
      setEndDate('')
      setDescription('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Campaign name is required.')
      return
    }
    try {
      const campaign = await createCampaign.mutateAsync({
        name: name.trim(),
        description: description || null,
        channel,
        product_id: productId || null,
        landing_page_id: landingPageId || null,
        utm_campaign: utmCampaign || null,
        budget_total: budgetTotal ? Number(budgetTotal) : null,
        start_date: startDate || null,
        end_date: endDate || null,
      })
      onOpenChange(false)
      navigate(`/marketing/campaigns/${campaign.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Marketing Campaign</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meta — March Launch" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as MarketingChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>UTM Campaign (for attribution)</Label>
              <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="e.g. march_launch" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Product (optional)</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="No specific product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Landing Page (optional)</Label>
              <Select value={landingPageId} onValueChange={setLandingPageId}>
                <SelectTrigger>
                  <SelectValue placeholder="No specific page" />
                </SelectTrigger>
                <SelectContent>
                  {landingPages?.rows.map((lp) => (
                    <SelectItem key={lp.id} value={lp.id}>
                      {lp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Total budget (optional)</Label>
              <Input type="number" min="0" step="0.01" value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? 'Creating…' : 'Create Campaign'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
