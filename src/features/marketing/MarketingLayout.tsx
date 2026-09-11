import { NavLink, Outlet } from 'react-router-dom'

import { usePermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'

interface SubNavItem {
  label: string
  href: string
}

// Only sections with real backing functionality — no tab is added
// merely to fill navigation. Every tab reuses either a Phase 12 RPC
// or an existing Finance/Analytics RPC (Landing Pages, Products).
const subNav: SubNavItem[] = [
  { label: 'Overview', href: '/marketing' },
  { label: 'Campaigns', href: '/marketing/campaigns' },
  { label: 'Channels', href: '/marketing/channels' },
  { label: 'Landing Pages', href: '/marketing/landing-pages' },
  { label: 'Products', href: '/marketing/products' },
  { label: 'Media Buyers', href: '/marketing/media-buyers' },
  { label: 'Budget', href: '/marketing/budget' },
]

export function MarketingLayout() {
  const canView = usePermission('marketing.view')
  if (!canView) return null

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {subNav.map((item) => (
          <MarketingSubNavLink key={item.href} item={item} />
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

function MarketingSubNavLink({ item }: { item: SubNavItem }) {
  return (
    <NavLink
      to={item.href}
      end={item.href === '/marketing'}
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
