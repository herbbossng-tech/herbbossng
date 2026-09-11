import { NavLink, Outlet } from 'react-router-dom'

import { usePermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'

interface SubNavItem {
  label: string
  href: string
  permission: string
}

const subNav: SubNavItem[] = [
  { label: 'Operations Dashboard', href: '/operations', permission: 'operations.view' },
  { label: 'Rescue Board', href: '/operations/rescue-board', permission: 'operations.view' },
  { label: 'Follow-up Tasks', href: '/operations/tasks', permission: 'tasks.view' },
  { label: 'Waybills', href: '/operations/waybills', permission: 'waybills.view' },
  { label: 'Delivery Partners', href: '/operations/delivery-partners', permission: 'delivery_partners.view' },
  { label: 'COD Settlement', href: '/operations/settlement', permission: 'settlement.view' },
]

export function OperationsLayout() {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {subNav.map((item) => (
          <OperationsSubNavLink key={item.href} item={item} />
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

function OperationsSubNavLink({ item }: { item: SubNavItem }) {
  const canSee = usePermission(item.permission)
  if (!canSee) return null
  return (
    <NavLink
      to={item.href}
      end={item.href === '/operations'}
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
