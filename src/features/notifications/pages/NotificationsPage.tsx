import { Archive, ArchiveRestore, Bell, Check, CheckCheck } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnarchiveNotification,
} from '@/features/notifications/hooks'
import type { NotificationTab } from '@/features/notifications/api'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types/database'

const priorityTone: Record<string, string> = {
  low: 'bg-muted-foreground',
  normal: 'bg-info',
  high: 'bg-warning',
  urgent: 'bg-destructive',
}

export function NotificationsPage() {
  const [tab, setTab] = React.useState<NotificationTab>('unread')
  const [priority, setPriority] = React.useState('all')
  const { data, isLoading, isError, refetch } = useNotifications({ tab, priority, page: 1, pageSize: 50 })
  const markAllRead = useMarkAllNotificationsRead()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Operational alerts for your workspace.</p>
        </div>
        {tab === 'unread' && (data?.rows.length ?? 0) > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as NotificationTab)}>
          <TabsList>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load notifications." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading notifications…" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Bell}
            title={tab === 'unread' ? "You're all caught up." : tab === 'archived' ? 'No archived notifications' : 'No read notifications yet'}
            description={tab === 'unread' ? 'New operational alerts will show up here.' : undefined}
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {data?.rows.map((n) => (
              <NotificationRow key={n.id} notification={n} tab={tab} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function NotificationRow({ notification, tab }: { notification: Notification; tab: NotificationTab }) {
  const markRead = useMarkNotificationRead()
  const archive = useArchiveNotification()
  const unarchive = useUnarchiveNotification()

  const content = (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', priorityTone[notification.priority] ?? 'bg-info')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground">{notification.title}</p>
          {notification.priority === 'urgent' && (
            <Badge variant="destructive" className="text-[10px]">
              Urgent
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{notification.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {tab === 'unread' && (
          <Button variant="ghost" size="sm" onClick={() => markRead.mutate(notification.id)} disabled={markRead.isPending} title="Mark as read">
            <Check className="h-4 w-4" />
          </Button>
        )}
        {tab !== 'archived' ? (
          <Button variant="ghost" size="sm" onClick={() => archive.mutate(notification.id)} disabled={archive.isPending} title="Archive">
            <Archive className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => unarchive.mutate(notification.id)} disabled={unarchive.isPending} title="Restore">
            <ArchiveRestore className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )

  // Only ever navigate to a same-origin internal path — never treat
  // notification.link as trustworthy enough for arbitrary navigation.
  const safeLink = notification.link && notification.link.startsWith('/') && !notification.link.startsWith('//') ? notification.link : null

  if (safeLink) {
    return (
      <Link to={safeLink} className="block transition-colors hover:bg-accent/40">
        {content}
      </Link>
    )
  }
  return content
}
