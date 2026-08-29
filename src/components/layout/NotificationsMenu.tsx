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
import { notifications } from '@/data/mockData'
import { cn } from '@/lib/utils'

const toneDot: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
}

export function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between text-sm font-semibold text-foreground">
          Notifications
          <span className="text-xs font-normal text-muted-foreground">{notifications.length} new</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.map((note) => (
          <DropdownMenuItem key={note.title} className="items-start gap-2.5 whitespace-normal py-2.5">
            <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', toneDot[note.tone])} />
            <div className="min-w-0">
              <p className="text-sm leading-snug text-foreground">{note.title}</p>
              <p className="text-xs text-muted-foreground">{note.time}</p>
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
