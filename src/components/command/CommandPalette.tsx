import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Banknote,
  FilePlus2,
  Layout,
  Megaphone,
  Package,
  PlusCircle,
  Settings as SettingsIcon,
  ShoppingCart,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { allNavItems } from '@/data/navigation'
import { fetchAffiliates } from '@/features/affiliates/api'
import { fetchCustomers } from '@/features/customers/api'
import { fetchLandingPages } from '@/features/landingPages/api'
import { fetchOrders } from '@/features/orders/api'
import { fetchProducts } from '@/features/products/api'
import { fetchWorkspaceStaff } from '@/features/staff/api'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const quickActions = [
  { label: 'Create Product', href: '/products', icon: PlusCircle },
  { label: 'Create Landing Page', href: '/landing-pages/new', icon: FilePlus2 },
  { label: 'New Order', href: '/orders/new', icon: ShoppingCart },
  { label: 'Add Customer', href: '/customers/new', icon: Users },
  { label: 'Open Finance', href: '/finance', icon: Wallet },
  { label: 'Open Analytics', href: '/analytics', icon: Sparkles },
  { label: 'Open Reports', href: '/reports', icon: BarChart3 },
  { label: 'Open Settings', href: '/settings', icon: SettingsIcon },
  { label: 'Invite Staff', href: '/staff', icon: UserPlus },
  { label: 'New Affiliate', href: '/affiliates', icon: UsersRound },
  { label: 'New Campaign', href: '/affiliates/campaigns/new', icon: Megaphone },
  { label: 'Open Withdrawals', href: '/affiliates/withdrawals', icon: Banknote },
]

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { hasPermission } = usePermissions()
  const brandId = activeBrand?.id ?? ''
  const [search, setSearch] = React.useState('')
  const term = search.trim()
  const searching = open && Boolean(brandId) && term.length >= 2

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // Every search below is explicitly gated on the relevant view
  // permission — an unauthorized module is never queried at all, not
  // just hidden after the fact. RLS would return nothing regardless,
  // but the query itself staying scoped is the point (see Phase 5
  // spec §24/§78: "do not query unauthorized data merely to hide it
  // later in React").
  const canSearchOrders = hasPermission('orders.view')
  const canSearchCustomers = hasPermission('customers.view')
  const canSearchProducts = hasPermission('products.view')
  const canSearchLandingPages = hasPermission('landing_pages.view')
  const canSearchStaff = hasPermission('staff.view')
  const canSearchAffiliates = hasPermission('affiliates.view')

  const { data: orderResults } = useQuery({
    queryKey: ['command-order-search', activeWorkspace.id, brandId, term],
    queryFn: () => fetchOrders(activeWorkspace.id, brandId, { search: term, pageSize: 6 }),
    enabled: searching && canSearchOrders,
  })

  const { data: customerResults } = useQuery({
    queryKey: ['command-customer-search', activeWorkspace.id, brandId, term],
    queryFn: () => fetchCustomers(activeWorkspace.id, brandId, { search: term, pageSize: 6 }),
    enabled: searching && canSearchCustomers,
  })

  const { data: productResults } = useQuery({
    queryKey: ['command-product-search', activeWorkspace.id, brandId, term],
    queryFn: () => fetchProducts(activeWorkspace.id, brandId, { search: term }),
    enabled: searching && canSearchProducts,
  })

  const { data: landingPageResults } = useQuery({
    queryKey: ['command-landing-page-search', activeWorkspace.id, brandId, term],
    queryFn: () => fetchLandingPages(activeWorkspace.id, brandId, { search: term, pageSize: 6 }),
    enabled: searching && canSearchLandingPages,
  })

  const { data: staffResults } = useQuery({
    queryKey: ['command-staff-search', activeWorkspace.id],
    queryFn: () => fetchWorkspaceStaff(activeWorkspace.id),
    enabled: searching && canSearchStaff,
  })
  const filteredStaff = (staffResults ?? [])
    .filter((s) => {
      const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.toLowerCase()
      return name.includes(term.toLowerCase()) || s.email.toLowerCase().includes(term.toLowerCase())
    })
    .slice(0, 6)

  const { data: affiliateResults } = useQuery({
    queryKey: ['command-affiliate-search', activeWorkspace.id, term],
    queryFn: () => fetchAffiliates(activeWorkspace.id, { search: term }),
    enabled: searching && canSearchAffiliates,
  })

  const visibleNavItems = allNavItems.filter((item) => !item.permission || hasPermission(item.permission))

  const go = (href: string) => {
    onOpenChange(false)
    navigate(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search orders, customers, products, staff, landing pages… or run a command"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          {quickActions.map((action) => (
            <CommandItem key={action.label} value={action.label} onSelect={() => go(action.href)}>
              <action.icon className="h-4 w-4 text-muted-foreground" />
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {searching && canSearchOrders && (
          <CommandGroup heading="Orders">
            {(orderResults?.rows.length ?? 0) === 0 && (
              <CommandItem disabled value={`no-orders-${term}`}>
                No matching orders
              </CommandItem>
            )}
            {orderResults?.rows.map((order) => (
              <CommandItem
                key={order.id}
                value={`${order.order_number} ${order.customer_name} ${order.customer_phone}`}
                onSelect={() => go(`/orders/${order.id}`)}
              >
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-xs text-muted-foreground">{order.order_number}</span>
                {order.customer_name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && canSearchCustomers && (
          <CommandGroup heading="Customers">
            {(customerResults?.rows.length ?? 0) === 0 && (
              <CommandItem disabled value={`no-customers-${term}`}>
                No matching customers
              </CommandItem>
            )}
            {customerResults?.rows.map((customer) => (
              <CommandItem
                key={customer.id}
                value={`${customer.full_name} ${customer.phone} ${customer.email ?? ''}`}
                onSelect={() => go(`/customers/${customer.id}`)}
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{customer.full_name}</span>
                <span className="text-xs text-muted-foreground">{customer.total_orders} order{customer.total_orders === 1 ? '' : 's'}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && canSearchProducts && (
          <CommandGroup heading="Products">
            {(productResults?.length ?? 0) === 0 && (
              <CommandItem disabled value={`no-products-${term}`}>
                No matching products
              </CommandItem>
            )}
            {productResults?.slice(0, 6).map((product) => (
              <CommandItem key={product.id} value={`${product.name} ${product.sku ?? ''}`} onSelect={() => go(`/products/${product.id}/edit`)}>
                <Package className="h-4 w-4 text-muted-foreground" />
                {product.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && canSearchLandingPages && (
          <CommandGroup heading="Landing Pages">
            {(landingPageResults?.rows.length ?? 0) === 0 && (
              <CommandItem disabled value={`no-landing-pages-${term}`}>
                No matching landing pages
              </CommandItem>
            )}
            {landingPageResults?.rows.map((page) => (
              <CommandItem key={page.id} value={`${page.name} ${page.slug}`} onSelect={() => go(`/landing-pages/${page.id}/edit`)}>
                <Layout className="h-4 w-4 text-muted-foreground" />
                {page.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && canSearchStaff && (
          <CommandGroup heading="Staff">
            {filteredStaff.length === 0 && (
              <CommandItem disabled value={`no-staff-${term}`}>
                No matching staff
              </CommandItem>
            )}
            {filteredStaff.map((s) => (
              <CommandItem key={s.user_id} value={`${s.first_name ?? ''} ${s.last_name ?? ''} ${s.email}`} onSelect={() => go(`/staff/${s.user_id}`)}>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && canSearchAffiliates && (
          <CommandGroup heading="Affiliates">
            {(affiliateResults?.length ?? 0) === 0 && (
              <CommandItem disabled value={`no-affiliates-${term}`}>
                No matching affiliates
              </CommandItem>
            )}
            {affiliateResults?.slice(0, 6).map((affiliate) => (
              <CommandItem key={affiliate.id} value={`${affiliate.full_name} ${affiliate.referral_code} ${affiliate.email ?? ''}`} onSelect={() => go(`/affiliates/${affiliate.id}`)}>
                <UsersRound className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{affiliate.full_name}</span>
                <span className="font-mono text-xs text-muted-foreground">{affiliate.referral_code}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {visibleNavItems.map((item) => (
            <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
              <item.icon className="h-4 w-4 text-muted-foreground" />
              {item.label}
              {item.href === '/' && <CommandShortcut>Home</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
