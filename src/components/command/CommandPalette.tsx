import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  FilePlus2,
  Package,
  PlusCircle,
  Rows3,
  Settings as SettingsIcon,
  ShoppingCart,
  UserPlus,
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
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { allNavItems } from '@/data/navigation'
import { mediaBuyers, topProducts } from '@/data/mockData'
import { fetchOrders } from '@/features/orders/api'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const quickActions = [
  { label: 'Create Product', href: '/products', icon: PlusCircle },
  { label: 'Create Landing Page', href: '/landing-pages', icon: FilePlus2 },
  { label: 'New Order', href: '/orders/new', icon: ShoppingCart },
  { label: 'Open Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Open Reports', href: '/reports', icon: Rows3 },
  { label: 'Open Settings', href: '/settings', icon: SettingsIcon },
  { label: 'Invite Staff', href: '/staff', icon: UserPlus },
]

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { activeWorkspace, activeBrand } = useWorkspace()
  const brandId = activeBrand?.id ?? ''
  const [search, setSearch] = React.useState('')

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

  const { data: orderResults } = useQuery({
    queryKey: ['command-order-search', activeWorkspace.id, brandId, search],
    queryFn: () => fetchOrders(activeWorkspace.id, brandId, { search, pageSize: 6 }),
    enabled: open && Boolean(brandId) && search.trim().length >= 2,
  })

  const go = (href: string) => {
    onOpenChange(false)
    navigate(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search orders, customers, products, staff… or run a command"
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

        {search.trim().length >= 2 && (
          <CommandGroup heading="Orders">
            {(orderResults?.rows.length ?? 0) === 0 && (
              <CommandItem disabled value={`no-orders-${search}`}>
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

        <CommandGroup heading="Products">
          {topProducts.map((product) => (
            <CommandItem key={product.name} value={product.name} onSelect={() => go('/products')}>
              <Package className="h-4 w-4 text-muted-foreground" />
              {product.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Affiliates">
          {mediaBuyers.map((buyer) => (
            <CommandItem key={buyer.name} value={buyer.name} onSelect={() => go('/affiliates')}>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              {buyer.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {allNavItems.map((item) => (
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
