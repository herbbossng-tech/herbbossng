import { LayoutDashboard, Layers, Loader2, LogOut, Megaphone, Package, Settings, SquareStack, TrendingUp, Wallet } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAffiliateAuth } from '@/contexts/AffiliateAuthContext'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/affiliate', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/affiliate/campaigns', label: 'Campaigns', icon: Megaphone, end: false },
  { to: '/affiliate/order-forms', label: 'My Forms', icon: SquareStack, end: false },
  { to: '/affiliate/offers', label: 'My Offers', icon: Layers, end: false },
  { to: '/affiliate/orders', label: 'My Orders', icon: Package, end: false },
  { to: '/affiliate/wallet', label: 'Wallet', icon: Wallet, end: false },
  { to: '/affiliate/ad-costs', label: 'Ad Costs', icon: TrendingUp, end: false },
  { to: '/affiliate/settings', label: 'Settings', icon: Settings, end: false },
]

export function AffiliatePortalLayout() {
  const { affiliate, loading, signOut } = useAffiliateAuth()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
        <div>
          <p className="text-sm font-bold text-foreground">Affiliate Portal</p>
          {affiliate && <p className="text-xs text-muted-foreground">{affiliate.full_name}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 sm:px-6">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
