import {
  Bell,
  Boxes,
  Building2,
  History,
  LayoutGrid,
  type LucideIcon,
  Package,
  ShieldCheck,
  ShoppingCart,
  UsersRound,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
}

export const primaryNav: NavItem[] = [
  { label: 'Dashboard Overview', href: '/', icon: LayoutGrid },
  { label: 'Orders Operations', href: '/orders', icon: ShoppingCart },
  { label: 'Financial Analytics', href: '/financials', icon: Wallet },
  { label: 'Media Buyers & Payouts', href: '/media-buyers', icon: UsersRound },
  { label: 'Brand Portfolio', href: '/brands', icon: Building2 },
  { label: 'Products & Pricing', href: '/products', icon: Package },
  { label: 'Landing Page Builder', href: '/landing-pages', icon: Boxes, badge: '5 FUNNELS' },
]

export const secondaryNav: NavItem[] = [
  { label: 'Staff Team Directory', href: '/staff', icon: UsersRound },
  { label: 'Roles & Permissions', href: '/roles', icon: ShieldCheck },
  { label: 'Audit Logs', href: '/audit-logs', icon: History },
  { label: 'Notifications', href: '/notifications', icon: Bell },
]
