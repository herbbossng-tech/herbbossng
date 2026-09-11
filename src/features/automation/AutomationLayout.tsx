import { NavLink, Outlet } from 'react-router-dom'

import { usePermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'

interface SubNavItem {
  label: string
  href: string
  permission: string
}

const subNav: SubNavItem[] = [
  { label: 'Rules', href: '/automation', permission: 'automation.view' },
  { label: 'Events', href: '/automation/events', permission: 'automation.view' },
  { label: 'Executions', href: '/automation/executions', permission: 'automation.view' },
  { label: 'Failed Automations', href: '/automation/failed', permission: 'automation.view' },
]

export function AutomationLayout() {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {subNav.map((item) => (
          <AutomationSubNavLink key={item.href} item={item} />
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

function AutomationSubNavLink({ item }: { item: SubNavItem }) {
  const canSee = usePermission(item.permission)
  if (!canSee) return null
  return (
    <NavLink
      to={item.href}
      end={item.href === '/automation'}
      className={({ isActive }) =>
        cn(
          'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
          isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
        )
      }
    >
      {item.label}
    </NavLink>
  )
}
