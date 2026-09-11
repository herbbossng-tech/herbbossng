import { AlertTriangle, CheckCircle2, Clock, Lock, RefreshCcw, Send } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { fetchFailedAutomationExecutions } from '@/features/automation/api'
import { externalConnectionProviderLabel, summarizeByStatus, type QueueHealthRow } from '@/features/integrations/api'
import {
  useCommunicationLog,
  useExternalIngestionHealth,
  useExternalIngestionLog,
  useQueueHealth,
  useRetryCommunicationLogEntry,
  useRetryExternalOrderIngestion,
  useRetryTrackingDispatchEvent,
  useTrackingDispatchEvents,
  useUpsertExternalProductMapping,
} from '@/features/integrations/hooks'
import { fetchProducts } from '@/features/products/api'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'
import type { CommunicationLog, ExternalOrderIngestionLog, TrackingDispatchLog } from '@/types/database'
import { useQuery } from '@tanstack/react-query'

function StatTile({ label, value, tone }: { label: string; value: number; tone?: 'default' | 'warning' | 'destructive' | 'success' }) {
  const toneClass =
    tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-foreground'
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold ${toneClass}`}>{value}</span>
    </div>
  )
}

function ProviderCard({
  title,
  rows,
  canManage,
  onRetry,
  retrying,
}: {
  title: string
  rows: TrackingDispatchLog[]
  canManage: boolean
  onRetry: (id: string) => void
  retrying: boolean
}) {
  const summary = summarizeByStatus(rows)
  const lastSent = rows.filter((r) => r.status === 'sent').sort((a, b) => (b.dispatched_at ?? '').localeCompare(a.dispatched_at ?? ''))[0]
  const failing = rows.filter((r) => r.status === 'permanently_failed' || r.status === 'retryable')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {lastSent?.dispatched_at
            ? `Last successful dispatch: ${new Date(lastSent.dispatched_at).toLocaleString()}`
            : 'No successful dispatch in the recent window'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          <StatTile label="Pending" value={summary.pending ?? 0} />
          <StatTile label="Retrying" value={summary.retryable ?? 0} tone="warning" />
          <StatTile label="Sent" value={summary.sent ?? 0} tone="success" />
          <StatTile label="Failed" value={summary.permanently_failed ?? 0} tone="destructive" />
        </div>
        {failing.length > 0 && (
          <div className="flex flex-col gap-2">
            {failing.slice(0, 5).map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{row.event_type}</span>
                  <span className="text-muted-foreground">{row.error_message ?? 'no error detail'}</span>
                </div>
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => onRetry(row.id)} disabled={retrying}>
                    <RefreshCcw className="h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const queueHealthLabel: Record<QueueHealthRow['queue'], string> = {
  tracking: 'Tracking Dispatch',
  communication: 'Communications',
  automation: 'Automation',
}

const healthBadgeVariant: Record<QueueHealthRow['health'], 'success' | 'warning' | 'destructive' | 'secondary'> = {
  healthy: 'success',
  degraded: 'warning',
  failing: 'destructive',
  not_configured: 'secondary',
  no_data: 'secondary',
}

const healthLabel: Record<QueueHealthRow['health'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  failing: 'Failing',
  not_configured: 'Not configured',
  no_data: 'No data yet',
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function QueueHealthCard({ row }: { row: QueueHealthRow }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{queueHealthLabel[row.queue]}</CardTitle>
          <Badge variant={healthBadgeVariant[row.health]}>{healthLabel[row.health]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Pending" value={row.pending} />
          <StatTile label="Retrying" value={row.retrying} tone={row.retrying > 0 ? 'warning' : undefined} />
          <StatTile label="Failed (24h)" value={row.failed_recent} tone={row.failed_recent > 0 ? 'destructive' : undefined} />
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Oldest pending: {relativeTime(row.oldest_pending_at)}</span>
          <span>Last success: {relativeTime(row.last_success_at)}</span>
          <span>Last failure: {relativeTime(row.last_failure_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function ChannelCard({
  title,
  rows,
  canManage,
  onRetry,
  retrying,
}: {
  title: string
  rows: CommunicationLog[]
  canManage: boolean
  onRetry: (id: string) => void
  retrying: boolean
}) {
  const summary = summarizeByStatus(rows)
  const configured = rows.some((r) => r.status !== 'not_configured')
  const failing = rows.filter((r) => r.status === 'permanently_failed' || r.status === 'retryable')
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant={configured ? 'success' : 'secondary'}>{configured ? 'Configured' : 'Not configured'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          <StatTile label="Queued" value={summary.queued ?? 0} />
          <StatTile label="Retrying" value={summary.retryable ?? 0} tone="warning" />
          <StatTile label="Sent" value={summary.sent ?? 0} tone="success" />
          <StatTile label="Failed" value={summary.permanently_failed ?? 0} tone="destructive" />
        </div>
        {failing.length > 0 && (
          <div className="flex flex-col gap-2">
            {failing.slice(0, 5).map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{row.recipient ?? '(no recipient)'}</span>
                  <span className="text-muted-foreground">{row.failure_category ?? 'unknown failure'}</span>
                </div>
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => onRetry(row.id)} disabled={retrying}>
                    <RefreshCcw className="h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OrderSourcesHealthCard() {
  const { data: health } = useExternalIngestionHealth()
  if (!health) return null
  const failing = health.failed + health.permanently_failed
  const overallHealth: 'healthy' | 'degraded' | 'failing' =
    failing > 0 ? 'failing' : health.needs_review > 0 ? 'degraded' : 'healthy'
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Order Sources (Shopify / WooCommerce / Google Sheets)</CardTitle>
          <Badge variant={healthBadgeVariant[overallHealth]}>{healthLabel[overallHealth]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          <StatTile label="Needs Review" value={health.needs_review} tone={health.needs_review > 0 ? 'warning' : undefined} />
          <StatTile label="Failed" value={health.failed} tone={health.failed > 0 ? 'warning' : undefined} />
          <StatTile label="Permanently failed" value={health.permanently_failed} tone={health.permanently_failed > 0 ? 'destructive' : undefined} />
          <StatTile label="Ingested (24h)" value={health.ingested_recent} tone="success" />
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Oldest pending: {relativeTime(health.oldest_pending_at)}</span>
          <span>Last success: {relativeTime(health.last_success_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function UnresolvedItemRow({ connectionId, brandId, item }: { connectionId: string; brandId: string; item: { external_product_id?: string; external_variant_id?: string; external_sku?: string; name?: string; quantity?: number } }) {
  const { activeWorkspace } = useWorkspace()
  const { data: products } = useQuery({
    queryKey: ['products-for-mapping', activeWorkspace.id, brandId],
    queryFn: () => fetchProducts(activeWorkspace.id, brandId),
    enabled: Boolean(brandId),
  })
  const [productId, setProductId] = React.useState('')
  const upsertMapping = useUpsertExternalProductMapping()
  const [saved, setSaved] = React.useState(false)

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium text-foreground">{item.name ?? '(unnamed item)'}</span>
        <span className="text-muted-foreground">
          Qty {item.quantity ?? 1} · SKU: {item.external_sku ?? '(none)'} · External ID: {item.external_product_id ?? '(none)'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Map to product…" />
          </SelectTrigger>
          <SelectContent>
            {(products ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={!productId || upsertMapping.isPending}
          onClick={async () => {
            await upsertMapping.mutateAsync({
              connectionId,
              externalProductId: item.external_product_id ?? null,
              externalVariantId: item.external_variant_id ?? null,
              externalSku: item.external_sku ?? null,
              productId,
            })
            setSaved(true)
          }}
        >
          {saved ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : 'Map'}
        </Button>
      </div>
    </div>
  )
}

function NeedsReviewDialog({ row, onClose }: { row: ExternalOrderIngestionLog; onClose: () => void }) {
  const retry = useRetryExternalOrderIngestion()
  const [error, setError] = React.useState<string | null>(null)
  const unresolvedItems = Array.isArray(row.unresolved_items) ? (row.unresolved_items as Array<Record<string, unknown>>) : []

  async function handleRetry() {
    setError(null)
    try {
      const result = await retry.mutateAsync(row.id)
      if (result.status === 'needs_review') {
        setError('Still missing a mapping for one or more items — map every item below, then retry again.')
      } else {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {externalConnectionProviderLabel[row.provider]} order {row.external_order_number ?? row.external_order_id} needs product mapping
          </DialogTitle>
          <DialogDescription>
            One or more line items on this order couldn't be matched to a product automatically. Map each one below, then retry — GCOS never
            guesses a product match, so the order is not created until every item resolves.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {unresolvedItems.map((item, idx) => (
            <UnresolvedItemRow
              key={idx}
              connectionId={row.connection_id}
              brandId={row.brand_id}
              item={item as { external_product_id?: string; external_variant_id?: string; external_sku?: string; name?: string; quantity?: number }}
            />
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={handleRetry} disabled={retry.isPending}>
            <RefreshCcw className="h-3.5 w-3.5" />
            {retry.isPending ? 'Retrying…' : 'Retry Order'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OrderSourcesReviewSection({ canManage }: { canManage: boolean }) {
  const { data: needsReview } = useExternalIngestionLog('needs_review')
  const { data: failed } = useExternalIngestionLog('failed')
  const retry = useRetryExternalOrderIngestion()
  const [reviewing, setReviewing] = React.useState<ExternalOrderIngestionLog | null>(null)

  const rows = [...(needsReview ?? []), ...(failed ?? [])]
  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orders Awaiting Review</CardTitle>
        <CardDescription>Ingested orders that could not be created automatically — a product mapping is missing, or a genuine error occurred.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.slice(0, 10).map((row) => (
          <div key={row.id} className="flex items-center justify-between rounded-md border border-border p-3 text-xs">
            <div className="flex flex-col">
              <span className="font-medium text-foreground">
                {externalConnectionProviderLabel[row.provider]} · {row.external_order_number ?? row.external_order_id}
              </span>
              <span className="text-muted-foreground">
                {row.status === 'needs_review' ? 'Needs product mapping' : (row.error_message ?? 'Unknown error')}
              </span>
            </div>
            {canManage && (
              <div className="flex gap-2">
                {row.status === 'needs_review' ? (
                  <Button size="sm" variant="outline" onClick={() => setReviewing(row)}>
                    Review
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => retry.mutate(row.id)} disabled={retry.isPending}>
                    <RefreshCcw className="h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
      {reviewing && <NeedsReviewDialog row={reviewing} onClose={() => setReviewing(null)} />}
    </Card>
  )
}

export function IntegrationHealthPage() {
  const canView = usePermission('integrations.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Integration Health is hidden" description="You don't have permission to view this page." />
      </Card>
    )
  }
  return <IntegrationHealthContent />
}

function IntegrationHealthContent() {
  const { activeWorkspace } = useWorkspace()
  const canManage = usePermission('integrations.manage')
  const canManageOrderIngestion = usePermission('order_ingestion.manage')
  const { data: trackingEvents, isLoading: trackingLoading, isError: trackingError, refetch: refetchTracking } = useTrackingDispatchEvents()
  const { data: commLog, isLoading: commLoading, isError: commError, refetch: refetchComm } = useCommunicationLog()
  const { data: queueHealth } = useQueueHealth()
  const retryTracking = useRetryTrackingDispatchEvent()
  const retryComm = useRetryCommunicationLogEntry()

  const { data: automationFailed } = useQuery({
    queryKey: ['integration-health-automation', activeWorkspace.id],
    queryFn: () => fetchFailedAutomationExecutions(activeWorkspace.id, { pageSize: 1 }),
    enabled: Boolean(activeWorkspace.id),
    refetchInterval: 30_000,
  })

  const queueHealthKey = ['queue-health', activeWorkspace.id]
  useRealtimeInvalidate('tracking_dispatch_log', activeWorkspace.id, [['tracking-dispatch-events'], queueHealthKey])
  useRealtimeInvalidate('communication_log', activeWorkspace.id, [['communication-log'], queueHealthKey])
  useRealtimeInvalidate('automation_executions', activeWorkspace.id, [['integration-health-automation', activeWorkspace.id], queueHealthKey])
  useRealtimeInvalidate('external_order_ingestion_log', activeWorkspace.id, [
    ['external-ingestion-log', activeWorkspace.id],
    ['external-ingestion-health', activeWorkspace.id],
  ])

  if (trackingLoading || commLoading) return <LoadingState label="Loading integration health…" />
  if (trackingError || commError) return <ErrorState message="Couldn't load integration health." onRetry={() => { refetchTracking(); refetchComm() }} />

  const trackingByProvider = {
    meta: (trackingEvents ?? []).filter((e) => e.provider === 'meta'),
    tiktok: (trackingEvents ?? []).filter((e) => e.provider === 'tiktok'),
  }
  const commByChannel = {
    email: (commLog ?? []).filter((c) => c.channel === 'email'),
    sms: (commLog ?? []).filter((c) => c.channel === 'sms'),
    whatsapp: (commLog ?? []).filter((c) => c.channel === 'whatsapp'),
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integration Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time dispatch status for Meta/TikTok conversion tracking, outbound communications, and automation retries — derived from actual
          queue state, never a fabricated green check.
        </p>
      </div>

      {queueHealth && queueHealth.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {queueHealth.map((row) => (
            <QueueHealthCard key={row.queue} row={row} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProviderCard
          title="Meta Conversions API"
          rows={trackingByProvider.meta}
          canManage={canManage}
          onRetry={(id) => retryTracking.mutate(id)}
          retrying={retryTracking.isPending}
        />
        <ProviderCard
          title="TikTok Events API"
          rows={trackingByProvider.tiktok}
          canManage={canManage}
          onRetry={(id) => retryTracking.mutate(id)}
          retrying={retryTracking.isPending}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChannelCard title="Email (Resend)" rows={commByChannel.email} canManage={canManage} onRetry={(id) => retryComm.mutate(id)} retrying={retryComm.isPending} />
        <ChannelCard title="SMS" rows={commByChannel.sms} canManage={canManage} onRetry={(id) => retryComm.mutate(id)} retrying={retryComm.isPending} />
        <ChannelCard title="WhatsApp" rows={commByChannel.whatsapp} canManage={canManage} onRetry={(id) => retryComm.mutate(id)} retrying={retryComm.isPending} />
      </div>

      <OrderSourcesHealthCard />
      <OrderSourcesReviewSection canManage={canManageOrderIngestion} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation Retry Queue</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(automationFailed?.totalCount ?? 0) > 0 ? (
              <AlertTriangle className="h-4 w-4 text-warning" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )}
            <span className="text-sm text-foreground">
              {automationFailed?.totalCount ?? 0} rule execution{(automationFailed?.totalCount ?? 0) === 1 ? '' : 's'} failed or retrying
            </span>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/automation/failed">
              <Send className="h-3.5 w-3.5" />
              Open Failed Automations
            </Link>
          </Button>
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Auto-refreshes every 30 seconds. Dispatch happens server-side via scheduled Edge Functions — this page shows their real outcomes, not a
        simulation.
      </p>
    </div>
  )
}
