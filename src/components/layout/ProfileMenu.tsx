import { LogOut, Settings, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/contexts/PermissionsContext'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function ProfileMenu() {
  const { user, profile, signOut } = useAuth()
  const { roles } = usePermissions()
  const roleLabel = roles.length > 0 ? roles.map((r) => r.name).join(', ') : 'Member'
  const navigate = useNavigate()

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || user?.email || 'Account'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
          <span className="mt-1 w-fit rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
            {roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <UserRound className="h-4 w-4" />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
