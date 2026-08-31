import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  History,
  LayoutGrid,
  LifeBuoy,
  type LucideIcon,
  Megaphone,
  Package,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserSquare2,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Permission slug required to see this item. Omit for always-visible items. */
  permission?: string
  badge?: string
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/', icon: LayoutGrid, permission: 'dashboard.view' }],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Orders', href: '/orders', icon: ShoppingCart, permission: 'orders.view' },
      { label: 'Products', href: '/products', icon: Package, permission: 'products.view' },
      { label: 'Landing Pages', href: '/landing-pages', icon: Boxes, permission: 'landing_pages.view' },
      { label: 'Customers', href: '/customers', icon: UserSquare2, permission: 'customers.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Finance', href: '/finance', icon: Wallet, permission: 'finance.view' },
      { label: 'Analytics', href: '/analytics', icon: Sparkles, permission: 'analytics.view' },
      { label: 'Reports', href: '/reports', icon: BarChart3, permission: 'reports.view' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Affiliates', href: '/affiliates', icon: UsersRound, permission: 'affiliates.view' },
      { label: 'Marketing', href: '/marketing', icon: Megaphone, permission: 'marketing.view' },
    ],
  },
  {
    label: 'Organization',
    items: [
      { label: 'Staff', href: '/staff', icon: Users, permission: 'staff.view' },
      { label: 'Roles & Permissions', href: '/roles', icon: ShieldCheck, permission: 'roles_permissions.view' },
      { label: 'Notifications', href: '/notifications', icon: Bell, permission: 'notifications.view' },
      { label: 'Audit Logs', href: '/audit-logs', icon: History, permission: 'audit_logs.view' },
      { label: 'Brands', href: '/brands', icon: Building2, permission: 'brands.view' },
      { label: 'Workspace', href: '/workspace', icon: Wallet, permission: 'workspace.view' },
    ],
  },
  {
    items: [
      { label: 'Settings', href: '/settings', icon: SettingsIcon, permission: 'settings.view' },
      { label: 'Support', href: '/support', icon: LifeBuoy, permission: 'support.view' },
    ],
  },
]

export const allNavItems: NavItem[] = navSections.flatMap((section) => section.items)
