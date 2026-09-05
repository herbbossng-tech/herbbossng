import { AlertTriangle, CheckCircle2, Clock, Lock, RefreshCcw, Send } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { fetchFailedAutomationExecutions } from '@/features/automation/api'
import { summarizeByStatus, type QueueHealthRow } from '@/features/integrations/api'
import {
  useCommunicationLog,
  useQueueHealth,
  useRetryCommunicationLogEntry,
  useRetryTrackingDispatchEvent,
  useTrackingDispatchEvents,
} from '@/features/integrations/hooks'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'
import type { CommunicationLog, TrackingDispatchLog } from '@/types/database'
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
