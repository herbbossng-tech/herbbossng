import { Lock, Radio, Search } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { automationEventTypeLabels, automationEventTypes } from '@/features/automation/automationFields'
import { EventDetailDialog } from '@/features/automation/components/EventDetailDialog'
import { useAutomationEvents } from '@/features/automation/hooks'
import type { AutomationEvent, AutomationEventProcessingStatus } from '@/types/database'

const PAGE_SIZE = 30

const processingStatusVariant: Record<AutomationEventProcessingStatus, 'secondary' | 'success' | 'destructive'> = {
  pending: 'secondary',
  processed: 'success',
  failed: 'destructive',
}

export function AutomationEventsPage() {
  const canView = usePermission('automation.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Automation is hidden" description="You don't have permission to view automation events. Ask a workspace admin for the automation.view permission." />
      </Card>
    )
  }
  return <AutomationEventsContent />
}

function AutomationEventsContent() {
  const [search, setSearch] = React.useState('')
  const [eventType, setEventType] = React.useState('all')
  const [processingStatus, setProcessingStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<AutomationEvent | null>(null)

  const { data, isLoading, isError, refetch } = useAutomationEvents({ search, eventType, processingStatus, page, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Automation Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">The durable, append-only event log every automation rule reads from. Read-only.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search event/entity/key…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={eventType}
          onValueChange={(v) => {
            setEventType(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {automationEventTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {automationEventTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={processingStatus}
          onValueChange={(v) => {
            setProcessingStatus(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Processing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All processing states</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load automation events." onRetry={() => refetch()} />
      ) : isLoading && !data ? (
        <LoadingState label="Loading events…" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState icon={Radio} title="No events yet" description="Nothing matches these filters yet." />
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Occurred</th>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="px-5 py-3 font-semibold">Entity</th>
                    <th className="px-5 py-3 font-semibold">Source</th>
                    <th className="px-5 py-3 font-semibold">Processing</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((event) => (
                    <tr key={event.id} className="cursor-pointer border-t border-border/60 hover:bg-accent/40" onClick={() => setSelected(event)}>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</td>
                      <td className="px-5 py-3">{automationEventTypeLabels[event.event_type as keyof typeof automationEventTypeLabels] ?? event.event_type}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{event.entity_type}</td>
                      <td className="px-5 py-3 capitalize text-muted-foreground">{event.source.replace('_', ' ')}</td>
                      <td className="px-5 py-3">
                        <Badge variant={processingStatusVariant[event.processing_status]}>{event.processing_status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-primary">View</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
              <p className="text-muted-foreground">
                Page {page} of {totalPages} · {data?.totalCount ?? 0} events
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <EventDetailDialog event={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}
