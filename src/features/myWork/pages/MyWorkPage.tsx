import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  Inbox,
  Lock,
  PackageCheck,
  PhoneCall,
  PhoneMissed,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { LogInteractionDialog } from '@/features/support/components/LogInteractionDialog'
import { MyWorkCard } from '@/features/myWork/components/MyWorkCard'
import { PriorityQueueItem } from '@/features/myWork/components/PriorityQueueItem'
import { relativeTime } from '@/features/myWork/format'
import { useMyPriorityQueue, useMyRecentOrders, useMyWorkRealtime, useMyWorkSummary } from '@/features/myWork/hooks'
import { orderStatusLabels, orderStatusTone } from '@/features/orders/statusMeta'
import { useMyAssignmentSettings, useSetMyAssignmentAvailability } from '@/features/staff/hooks'
import { formatCurrency } from '@/lib/currency'
import type { MyWorkQueueGroup, MyWorkQueueItem } from '@/types/database'

const queueGroupMeta: Record<MyWorkQueueGroup, { label: string; icon: typeof AlertTriangle }> = {
  OVERDUE_FOLLOW_UP: { label: 'Overdue Follow-Ups', icon: AlertTriangle },
  DUE_TODAY: { label: 'Follow-Ups Due Today', icon: Clock },
  AWAITING_CONFIRMATION: { label: 'Customers Awaiting Confirmation', icon: PhoneCall },
  NOT_YET_CONTACTED: { label: 'Orders Not Yet Contacted', icon: Inbox },
  MISSED_CONTACT: { label: 'Missed Contact Attempts', icon: PhoneMissed },
  RECENTLY_ASSIGNED: { label: 'Recently Assigned Orders', icon: ClipboardList },
}

const queueGroupOrder: MyWorkQueueGroup[] = [
  'OVERDUE_FOLLOW_UP',
  'DUE_TODAY',
  'AWAITING_CONFIRMATION',
  'NOT_YET_CONTACTED',
  'MISSED_CONTACT',
  'RECENTLY_ASSIGNED',
]

export function MyWorkPage() {
  const canView = usePermission('orders.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="My Work is hidden" description="You don't have permission to view orders. Ask a workspace admin for the orders.view permission." />
      </Card>
    )
  }
  return <MyWorkContent />
}

function orderLink(params: Record<string, string>): string {
  return `/orders?${new URLSearchParams(params).toString()}`
}

function MyWorkContent() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const canLogSupportCreate = usePermission('support.create')
  const canLogSupportManage = usePermission('support.manage')
  const canLogInteraction = canLogSupportCreate || canLogSupportManage
  const [interactionOrderId, setInteractionOrderId] = React.useState<string | null>(null)

  useMyWorkRealtime()
  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useMyWorkSummary()
  const { data: queue, isLoading: queueLoading, isError: queueError, refetch: refetchQueue } = useMyPriorityQueue()
  const { data: recentOrders, isLoading: recentLoading, isError: recentError, refetch: refetchRecent } = useMyRecentOrders()

  const grouped = React.useMemo(() => {
    const map = new Map<MyWorkQueueGroup, MyWorkQueueItem[]>()
    for (const item of queue ?? []) {
      const list = map.get(item.queue_group) ?? []
      list.push(item)
      map.set(item.queue_group, list)
    }
    return map
  }, [queue])

  if (!user) return <LoadingState label="Loading your workspace…" />

  const uid = user.id

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Work</h1>
          <p className="mt-1 text-sm text-muted-foreground">The orders assigned to you, what needs attention today, and what to do next.</p>
        </div>
        <AvailabilityToggle />
      </div>

      {summaryError ? (
        <ErrorState message="Couldn't load your work summary." onRetry={() => refetchSummary()} />
      ) : summaryLoading || !summary ? (
        <LoadingState label="Loading your work summary…" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MyWorkCard
            label="Assigned to Me"
            value={summary.assigned_to_me_count}
            icon={ClipboardList}
            tone="default"
            href={orderLink({ assignedTo: uid })}
            sub={
              summary.overdue_follow_ups_count > 0
                ? `${summary.overdue_follow_ups_count} follow-up${summary.overdue_follow_ups_count === 1 ? '' : 's'} overdue`
                : summary.oldest_pending_since
                  ? `Oldest unworked: ${relativeTime(summary.oldest_pending_since)}`
                  : 'All caught up'
            }
            highlight={summary.overdue_follow_ups_count > 0}
          />
          <MyWorkCard
            label="New"
            value={summary.new_count}
            icon={Inbox}
            tone="info"
            href={orderLink({ assignedTo: uid, status: 'NEW' })}
          />
          <MyWorkCard
            label="Pending Confirmation"
            value={summary.pending_confirmation_count}
            icon={PhoneCall}
            tone="warning"
            href={orderLink({ assignedTo: uid, statusIn: 'PENDING,WILL_CALL_BACK' })}
            sub={summary.oldest_pending_since ? `Oldest since ${relativeTime(summary.oldest_pending_since)}` : undefined}
          />
          <MyWorkCard
            label="Confirmed"
            value={summary.confirmed_count}
            icon={CheckCircle2}
            tone="info"
            href={orderLink({ assignedTo: uid, statusIn: 'SCHEDULED,PROCESSING_FOR_DISPATCH' })}
          />
          <MyWorkCard
            label="Follow-Up Required"
            value={summary.follow_up_required_count}
            icon={Bell}
            tone="warning"
            href="/operations/tasks?quick=mine"
            sub={summary.due_today_follow_ups_count > 0 ? `${summary.due_today_follow_ups_count} due today` : undefined}
            highlight={summary.overdue_follow_ups_count > 0}
          />
          <MyWorkCard
            label="Out for Delivery"
            value={summary.out_for_delivery_count}
            icon={Truck}
            tone="info"
            href={orderLink({ assignedTo: uid, statusIn: 'DISPATCHED,IN_TRANSIT,PARTIALLY_DELIVERED' })}
          />
          <MyWorkCard
            label="Delivered"
            value={summary.delivered_count}
            icon={PackageCheck}
            tone="success"
            href={orderLink({ assignedTo: uid, status: 'DELIVERED' })}
          />
          <MyWorkCard
            label="Cancelled"
            value={summary.cancelled_count}
            icon={XCircle}
            tone="secondary"
            href={orderLink({ assignedTo: uid, status: 'CANCELLED' })}
          />
          <MyWorkCard
            label="Returned"
            value={summary.returned_count}
            icon={RotateCcw}
            tone="destructive"
            href={orderLink({ assignedTo: uid, status: 'RETURNED' })}
          />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Today's Work</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Your priority queue — what to work on next, ordered by urgency.</p>

        <div className="mt-3 flex flex-col gap-5">
          {queueError ? (
            <ErrorState message="Couldn't load your priority queue." onRetry={() => refetchQueue()} />
          ) : queueLoading ? (
            <LoadingState label="Loading your priority queue…" />
          ) : !queue || queue.length === 0 ? (
            <Card className="p-8">
              <EmptyState icon={CheckCircle2} title="Nothing urgent right now" description="Orders needing a follow-up, confirmation, or contact attempt will show up here." />
            </Card>
          ) : (
            queueGroupOrder.map((group) => {
              const items = grouped.get(group)
              if (!items || items.length === 0) return null
              const meta = queueGroupMeta[group]
              return (
                <div key={group}>
                  <div className="mb-2 flex items-center gap-2">
                    <meta.icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((item) => (
                      <PriorityQueueItem
                        key={`${group}-${item.order_id}`}
                        item={item}
                        currencyCode={activeWorkspace.currency_code}
                        canLogInteraction={canLogInteraction}
                        onLogInteraction={() => setInteractionOrderId(item.order_id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">My Recent Orders</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">The last orders you've worked, most recently updated first.</p>

        <div className="mt-3">
          {recentError ? (
            <ErrorState message="Couldn't load your recent orders." onRetry={() => refetchRecent()} />
          ) : recentLoading ? (
            <LoadingState label="Loading your recent orders…" />
          ) : !recentOrders || recentOrders.length === 0 ? (
            <Card className="p-8">
              <EmptyState icon={Inbox} title="No orders yet" description="Orders assigned to you will appear here." />
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Order</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Location</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Last Contact</th>
                    <th className="px-4 py-2.5 font-medium">Next Follow-Up</th>
                    <th className="px-4 py-2.5 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.order_id} className="border-b border-border last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-2.5">
                        <Link to={`/orders/${o.order_id}`} className="font-mono text-xs font-semibold hover:text-primary">
                          {o.order_number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{o.customer_name}</span>
                          <a href={`tel:${o.customer_phone}`} className="text-xs text-muted-foreground hover:text-primary">
                            {o.customer_phone}
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{o.product_summary ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium">{formatCurrency(o.total_amount, activeWorkspace.currency_code)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{[o.customer_city, o.customer_state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={orderStatusTone[o.status]}>{orderStatusLabels[o.status]}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {o.last_interaction_at ? relativeTime(o.last_interaction_at) : 'none yet'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {o.next_follow_up_at ? relativeTime(o.next_follow_up_at) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{relativeTime(o.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>

      <LogInteractionDialog open={Boolean(interactionOrderId)} onOpenChange={(open) => !open && setInteractionOrderId(null)} orderId={interactionOrderId} />
    </div>
  )
}

function AvailabilityToggle() {
  const { data: settings } = useMyAssignmentSettings()
  const setAvailability = useSetMyAssignmentAvailability()
  // No settings row yet = the documented default (available).
  const isAvailable = settings?.is_available_for_assignment ?? true

  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span className="text-muted-foreground">Available for new assignments</span>
      <Switch checked={isAvailable} onCheckedChange={(v) => setAvailability.mutate(v)} disabled={setAvailability.isPending} />
    </label>
  )
}
