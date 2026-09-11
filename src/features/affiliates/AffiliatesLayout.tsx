import { NavLink, Outlet } from 'react-router-dom'

import { usePermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'

interface SubNavItem {
  label: string
  href: string
  permission: string
}

const subNav: SubNavItem[] = [
  { label: 'Affiliates', href: '/affiliates', permission: 'affiliates.view' },
  { label: 'Campaigns', href: '/affiliates/campaigns', permission: 'campaigns.view' },
  { label: 'Wallet & Credits', href: '/affiliates/credits', permission: 'wallets.view' },
  { label: 'Withdrawals', href: '/affiliates/withdrawals', permission: 'withdrawals.view' },
  { label: 'Ad Costs', href: '/affiliates/ad-costs', permission: 'ad_costs.view' },
]

export function AffiliatesLayout() {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {subNav.map((item) => (
          <AffiliatesSubNavLink key={item.href} item={item} />
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

function AffiliatesSubNavLink({ item }: { item: SubNavItem }) {
  const canSee = usePermission(item.permission)
  if (!canSee) return null
  return (
    <NavLink
      to={item.href}
      end={item.href === '/affiliates'}
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
