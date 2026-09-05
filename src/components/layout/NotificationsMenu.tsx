import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMarkNotificationRead, useNotificationsRealtime, useRecentNotifications, useUnreadNotificationCount } from '@/features/notifications/hooks'
import { cn } from '@/lib/utils'

const priorityDot: Record<string, string> = {
  low: 'bg-muted-foreground',
  normal: 'bg-info',
  high: 'bg-warning',
  urgent: 'bg-destructive',
}

export function NotificationsMenu() {
  useNotificationsRealtime()
  const { data: unreadCount } = useUnreadNotificationCount()
  const { data: recent } = useRecentNotifications()
  const markRead = useMarkNotificationRead()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Bell className="h-4 w-4" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between text-sm font-semibold text-foreground">
          Notifications
          <span className="text-xs font-normal text-muted-foreground">{unreadCount ?? 0} unread</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(recent?.length ?? 0) === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">You're all caught up.</div>
        )}
        {recent?.map((note) => (
          <DropdownMenuItem
            key={note.id}
            className="items-start gap-2.5 whitespace-normal py-2.5"
            onSelect={() => {
              if (!note.is_read) markRead.mutate(note.id)
            }}
          >
            <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', priorityDot[note.priority] ?? 'bg-info', note.is_read && 'opacity-30')} />
            <div className="min-w-0">
              <p className={cn('text-sm leading-snug text-foreground', !note.is_read && 'font-medium')}>{note.title}</p>
              <p className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</p>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/notifications" className="justify-center text-center text-sm font-medium text-primary">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
